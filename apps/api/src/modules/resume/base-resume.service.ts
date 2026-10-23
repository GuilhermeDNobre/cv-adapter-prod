import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { desc, eq } from 'drizzle-orm';
import {
  careerProfiles,
  certifications,
  educationEntries,
  evidences,
  experiences,
  languages,
  resumeImports,
  skills,
} from 'schema';
import type { CreateBaseResumeRequest } from 'schema/contracts/resume';
import { DATABASE, type Database } from '../database/database.provider';
import { DEFAULT_JOB_OPTIONS, RESUME_WRITING_QUEUE } from '../../queue.module';
import { ResumeRepository } from './resume.repository';
import type {
  ResumeBulletInput,
  ResumeEntryInput,
  ResumeSectionInput,
} from './resume.repository';
import { resolveLengthTarget } from './length-target';
import { resolveResumeStructure } from './resume-structure';

const DEFAULT_LANGUAGE = 'pt' as const;
const DEFAULT_TEMPLATE = 'comfortable' as const;
const DEFAULT_WRITING_METHOD = 'xyz' as const;
const DEFAULT_TONE = 'direct' as const;

interface CareerData {
  readonly profileId: string;
  readonly experienceRows: ReadonlyArray<typeof experiences.$inferSelect>;
  readonly educationRows: ReadonlyArray<typeof educationEntries.$inferSelect>;
  readonly evidenceRows: ReadonlyArray<typeof evidences.$inferSelect>;
  readonly skillRows: ReadonlyArray<typeof skills.$inferSelect>;
  readonly languageRows: ReadonlyArray<typeof languages.$inferSelect>;
  readonly certificationRows: ReadonlyArray<typeof certifications.$inferSelect>;
  readonly sectionOrder: readonly string[] | undefined;
}

@Injectable()
export class BaseResumeService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(ResumeRepository) private readonly repository: ResumeRepository,
    @InjectQueue(RESUME_WRITING_QUEUE) private readonly writingQueue: Queue,
  ) {}

  async createBaseResume(userId: string, input: CreateBaseResumeRequest): Promise<{ id: string }> {
    const career = await this.loadCareerData(userId);
    if (career === undefined) {
      throw new UnprocessableEntityException(
        'You must have a Career Profile before creating a Base Resume.',
      );
    }
    const sections = this.assembleSections(input, career);
    const lengthTarget = resolveLengthTarget({
      explicit: input.lengthTarget,
      experienceRows: career.experienceRows,
      selections: input.sections,
    });
    const resumeId = await this.repository.createBaseResume({
      userId,
      name: input.name,
      language: input.language ?? DEFAULT_LANGUAGE,
      template: input.template ?? DEFAULT_TEMPLATE,
      lengthTarget,
      writingMethod: input.writingMethod ?? DEFAULT_WRITING_METHOD,
      tone: input.tone ?? DEFAULT_TONE,
      sections,
    });
    await this.writingQueue.add(
      'write-base',
      { resumeId, userId },
      DEFAULT_JOB_OPTIONS,
    );
    console.log('resume.enqueued', { resumeId, userId, kind: 'base' });
    return { id: resumeId };
  }

  private async loadCareerData(userId: string): Promise<CareerData | undefined> {
    const [profile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (profile === undefined) {
      return undefined;
    }
    const experienceRows = await this.database
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profile.id));
    const educationRows = await this.database
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, profile.id));
    const evidenceRows = await this.database
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, profile.id));
    const skillRows = await this.database
      .select()
      .from(skills)
      .where(eq(skills.careerProfileId, profile.id));
    const languageRows = await this.database
      .select()
      .from(languages)
      .where(eq(languages.careerProfileId, profile.id));
    const certificationRows = await this.database
      .select()
      .from(certifications)
      .where(eq(certifications.careerProfileId, profile.id));
    const [latestImport] = await this.database
      .select({ draft: resumeImports.draft })
      .from(resumeImports)
      .where(eq(resumeImports.userId, userId))
      .orderBy(desc(resumeImports.createdAt))
      .limit(1);
    return {
      profileId: profile.id,
      experienceRows,
      educationRows,
      evidenceRows,
      skillRows,
      languageRows,
      certificationRows,
      sectionOrder: parseImportSectionOrder(latestImport?.draft),
    };
  }

  private assembleSections(
    input: CreateBaseResumeRequest,
    career: CareerData,
  ): ResumeSectionInput[] {
    const validExperienceIds = new Set(career.experienceRows.map((row) => row.id));
    const validEducationIds = new Set(career.educationRows.map((row) => row.id));
    const validSkillIds = new Set(career.skillRows.map((row) => row.id));
    const evidenceById = new Map(career.evidenceRows.map((row) => [row.id, row]));
    const usedEvidenceIds = new Set<string>();
    const usedSkillIds = new Set<string>();
    const byKind = new Map<string, NonNullable<CreateBaseResumeRequest['sections']>[number]>();
    for (const selection of input.sections ?? []) {
      if (!byKind.has(selection.kind)) {
        byKind.set(selection.kind, selection);
      }
    }
    const orderedKinds = resolveResumeStructure({
      sectionOrder: career.sectionOrder,
      hasSummary: byKind.has('summary'),
      hasExperience: byKind.has('experience'),
      hasEducation: byKind.has('education'),
      hasSkills: byKind.has('skills'),
      hasLanguages: byKind.has('languages'),
      hasCertifications: byKind.has('certifications'),
      hasCustom: byKind.has('custom'),
      experienceRows: career.experienceRows,
      educationRows: career.educationRows,
    });
    const sections: ResumeSectionInput[] = [];
    for (const kind of orderedKinds) {
      const selection = byKind.get(kind);
      if (selection === undefined) {
        continue;
      }
      if (selection.kind === 'skills') {
        const skillIds = (selection.skillIds ?? []).filter(
          (id) => validSkillIds.has(id) && !usedSkillIds.has(id),
        );
        for (const id of skillIds) {
          usedSkillIds.add(id);
        }
        sections.push({ kind: selection.kind, title: selection.title ?? null, entries: [], skillIds });
        continue;
      }
      if (selection.kind === 'languages' || selection.kind === 'certifications') {
        if (selection.entries !== undefined && selection.entries.length > 0) {
          sections.push(
            this.buildApprovedSection(selection.kind, selection.title ?? null, {
              entries: selection.entries,
              validExperienceIds,
              validEducationIds,
              evidenceById,
              usedEvidenceIds,
            }),
          );
          continue;
        }
        sections.push({ kind: selection.kind, title: selection.title ?? null, entries: [] });
        continue;
      }
      if (selection.entries !== undefined && selection.entries.length > 0) {
        sections.push(
          this.buildApprovedSection(selection.kind, selection.title ?? null, {
            entries: selection.entries,
            validExperienceIds,
            validEducationIds,
            evidenceById,
            usedEvidenceIds,
          }),
        );
        continue;
      }
      const items = selection.items ?? [];
      if (selection.kind === 'custom' && items.length === 0) {
        continue;
      }
      const experienceIds = (selection.experienceIds ?? []).filter((id) => validExperienceIds.has(id));
      const educationEntryIds = (selection.educationEntryIds ?? []).filter((id) =>
        validEducationIds.has(id),
      );
      const evidenceIds = this.collectReservedEvidenceIds(selection, evidenceById, usedEvidenceIds);
      sections.push(
        this.buildSection(selection.kind, selection.title ?? null, {
          experienceIds,
          educationEntryIds,
          evidenceIds,
          evidenceById,
          items,
        }),
      );
    }
    return sections;
  }

  private collectReservedEvidenceIds(
    selection: NonNullable<CreateBaseResumeRequest['sections']>[number],
    evidenceById: Map<string, typeof evidences.$inferSelect>,
    usedEvidenceIds: Set<string>,
  ): string[] {
    if (selection.kind !== 'experience' && selection.kind !== 'education') {
      return [];
    }
    const evidenceIds: string[] = [];
    for (const id of selection.evidenceIds ?? []) {
      if (!evidenceById.has(id) || usedEvidenceIds.has(id)) {
        continue;
      }
      usedEvidenceIds.add(id);
      evidenceIds.push(id);
    }
    return evidenceIds;
  }

  private buildSection(
    kind: 'summary' | 'experience' | 'education' | 'skills' | 'languages' | 'certifications' | 'custom',
    title: string | null,
    selection: {
      experienceIds: string[];
      educationEntryIds: string[];
      evidenceIds: string[];
      evidenceById: Map<string, typeof evidences.$inferSelect>;
      items: string[];
    },
  ): ResumeSectionInput {
    if (kind === 'custom') {
      return {
        kind,
        title,
        entries: selection.items.map((heading) => ({
          experienceId: null,
          educationEntryId: null,
          heading,
          bullets: [],
        })),
      };
    }
    if (kind === 'experience') {
      return {
        kind,
        title,
        entries: this.buildExperienceEntries(selection),
      };
    }
    if (kind === 'education') {
      return {
        kind,
        title,
        entries: this.buildEducationEntries(selection),
      };
    }
    return { kind, title, entries: [] };
  }

  private buildApprovedSection(
    kind: 'summary' | 'experience' | 'education' | 'skills' | 'languages' | 'certifications' | 'custom',
    title: string | null,
    selection: {
      entries: NonNullable<NonNullable<CreateBaseResumeRequest['sections']>[number]['entries']>;
      validExperienceIds: Set<string>;
      validEducationIds: Set<string>;
      evidenceById: Map<string, typeof evidences.$inferSelect>;
      usedEvidenceIds: Set<string>;
    },
  ): ResumeSectionInput {
    if (kind === 'skills') {
      return { kind, title, entries: [] };
    }
    const entries: ResumeEntryInput[] = [];
    for (const entry of selection.entries) {
      const experienceId =
        entry.experienceId !== undefined &&
        entry.experienceId !== null &&
        selection.validExperienceIds.has(entry.experienceId) &&
        kind === 'experience'
          ? entry.experienceId
          : null;
      const educationEntryId =
        entry.educationEntryId !== undefined &&
        entry.educationEntryId !== null &&
        selection.validEducationIds.has(entry.educationEntryId) &&
        kind === 'education'
          ? entry.educationEntryId
          : null;
      const bullets: ResumeBulletInput[] = [];
      for (const bullet of entry.bullets) {
        if (bullet.evidenceId === null) {
          bullets.push({ evidenceId: null, text: bullet.text });
          continue;
        }
        if (!selection.evidenceById.has(bullet.evidenceId)) {
          continue;
        }
        if (selection.usedEvidenceIds.has(bullet.evidenceId)) {
          continue;
        }
        selection.usedEvidenceIds.add(bullet.evidenceId);
        bullets.push({ evidenceId: bullet.evidenceId, text: bullet.text });
      }
      entries.push({ experienceId, educationEntryId, heading: null, bullets });
    }
    return { kind, title, entries };
  }

  private buildExperienceEntries(selection: {
    experienceIds: string[];
    evidenceIds: string[];
    evidenceById: Map<string, typeof evidences.$inferSelect>;
  }): ResumeEntryInput[] {
    const entries: ResumeEntryInput[] = selection.experienceIds.map((experienceId) => ({
      experienceId,
      educationEntryId: null,
      heading: null,
      bullets: [],
    }));
    const bulletsByEntry = new Map<number, ResumeBulletInput[]>();
    for (const evidenceId of selection.evidenceIds) {
      const evidence = selection.evidenceById.get(evidenceId);
      if (evidence === undefined) {
        continue;
      }
      const bullet: ResumeBulletInput = { evidenceId, text: evidence.statement };
      const entryIndex = this.findExperienceEntryIndex(entries, selection.experienceIds, evidence);
      if (entryIndex === -1) {
        this.appendToFirstOrCreate(entries, bulletsByEntry, bullet);
        continue;
      }
      const existing = bulletsByEntry.get(entryIndex) ?? [];
      existing.push(bullet);
      bulletsByEntry.set(entryIndex, existing);
    }
    return this.attachBullets(entries, bulletsByEntry);
  }

  private findExperienceEntryIndex(
    entries: readonly ResumeEntryInput[],
    experienceIds: readonly string[],
    evidence: typeof evidences.$inferSelect,
  ): number {
    if (evidence.experienceId === null) {
      return entries.length === 0 ? -1 : 0;
    }
    const index = experienceIds.indexOf(evidence.experienceId);
    if (index === -1) {
      return entries.length === 0 ? -1 : 0;
    }
    return index;
  }

  private buildEducationEntries(selection: {
    educationEntryIds: string[];
    evidenceIds: string[];
    evidenceById: Map<string, typeof evidences.$inferSelect>;
  }): ResumeEntryInput[] {
    const entries: ResumeEntryInput[] = selection.educationEntryIds.map((educationEntryId) => ({
      experienceId: null,
      educationEntryId,
      heading: null,
      bullets: [],
    }));
    const bullets: ResumeBulletInput[] = [];
    for (const evidenceId of selection.evidenceIds) {
      const evidence = selection.evidenceById.get(evidenceId);
      if (evidence === undefined) {
        continue;
      }
      bullets.push({ evidenceId, text: evidence.statement });
    }
    if (bullets.length === 0) {
      return entries;
    }
    if (entries.length === 0) {
      return [{ experienceId: null, educationEntryId: null, heading: null, bullets }];
    }
    const [first, ...rest] = entries;
    return [{ ...first!, bullets }, ...rest];
  }

  private appendToFirstOrCreate(
    entries: ResumeEntryInput[],
    bulletsByEntry: Map<number, ResumeBulletInput[]>,
    bullet: ResumeBulletInput,
  ): void {
    if (entries.length === 0) {
      entries.push({ experienceId: null, educationEntryId: null, heading: null, bullets: [] });
    }
    const existing = bulletsByEntry.get(0) ?? [];
    existing.push(bullet);
    bulletsByEntry.set(0, existing);
  }

  private attachBullets(
    entries: readonly ResumeEntryInput[],
    bulletsByEntry: Map<number, ResumeBulletInput[]>,
  ): ResumeEntryInput[] {
    return entries.map((entry, index) => ({
      ...entry,
      bullets: bulletsByEntry.get(index) ?? [],
    }));
  }
}

function parseImportSectionOrder(draft: unknown): readonly string[] | undefined {
  if (draft === null || typeof draft !== 'object' || !('sectionOrder' in draft)) {
    return undefined;
  }
  const order = (draft as { sectionOrder?: unknown }).sectionOrder;
  if (!Array.isArray(order)) {
    return undefined;
  }
  const kinds = order.filter((kind): kind is string => typeof kind === 'string');
  return kinds.length === 0 ? undefined : kinds;
}
