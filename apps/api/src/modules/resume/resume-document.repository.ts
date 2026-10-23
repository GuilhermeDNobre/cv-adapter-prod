import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { resumeBullets, resumeEntries, resumeSectionSkills, resumeSections, resumes } from 'schema';
import { DATABASE, type Database } from '../database/database.provider';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ResumeSectionInput {
  readonly kind: 'summary' | 'experience' | 'education' | 'skills' | 'languages' | 'certifications' | 'custom';
  readonly title: string | null;
  readonly entries: readonly ResumeEntryInput[];
  readonly skillIds?: readonly string[];
}

export interface ResumeEntryInput {
  readonly experienceId: string | null;
  readonly educationEntryId: string | null;
  readonly heading: string | null;
  readonly bullets: readonly ResumeBulletInput[];
}

export interface ResumeBulletInput {
  readonly evidenceId: string | null;
  readonly text: string;
}

export interface CreateBaseResumeDocument {
  readonly userId: string;
  readonly name: string;
  readonly language: 'pt' | 'en';
  readonly template: 'comfortable' | 'dense';
  readonly lengthTarget: 1 | 2;
  readonly writingMethod: 'star' | 'xyz' | 'car' | 'apr' | 'free';
  readonly tone: 'formal' | 'direct' | 'technical';
  readonly sections: readonly ResumeSectionInput[];
}

export interface BulletUpdate {
  readonly id: string;
  readonly text: string;
  readonly status: 'assumed' | 'suggestion';
  readonly suggestionQuestion: string | null;
  readonly gapKind: 'detail' | null;
}

export interface SynthesisBullet {
  readonly text: string;
  readonly editedByPerson: boolean;
}

export interface SynthesisReplacement {
  readonly sectionId: string;
  readonly bullets: ReadonlyArray<SynthesisBullet>;
}

function isSynthesisBullet(bullet: typeof resumeBullets.$inferSelect): boolean {
  return bullet.evidenceId === null && bullet.status === 'assumed' && bullet.gapKind === null && bullet.requirementId === null;
}

@Injectable()
export class ResumeDocumentRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async createBaseResume(input: CreateBaseResumeDocument): Promise<string> {
    const resumeId = await this.database.transaction(async (tx) => {
      const [resume] = await tx
        .insert(resumes)
        .values({
          userId: input.userId,
          kind: 'base',
          name: input.name,
          language: input.language,
          template: input.template,
          lengthTarget: input.lengthTarget,
          writingMethod: input.writingMethod,
          tone: input.tone,
          baseResumeId: null,
          jobDescriptionId: null,
          generationStatus: 'generating',
          failureReason: null,
          adaptationPlan: null,
        })
        .returning({ id: resumes.id });
      if (resume === undefined) {
        throw new Error('Failed to create resume row');
      }
      await this.insertSections(tx, resume.id, input.sections);
      return resume.id;
    });
    return resumeId;
  }

  async updateBulletsAndMarkReady(resumeId: string, updates: readonly BulletUpdate[]): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      for (const update of updates) {
        await this.applyBulletUpdate(tx, update);
      }
      const claimed = await tx
        .update(resumes)
        .set({ generationStatus: 'ready', failureReason: null, updatedAt: new Date() })
        .where(eq(resumes.id, resumeId))
        .returning({ id: resumes.id });
      return claimed.length > 0;
    });
  }

  async replaceSynthesisAndMarkReady(input: {
    readonly resumeId: string;
    readonly synthesis: ReadonlyArray<SynthesisReplacement>;
    readonly updates: readonly BulletUpdate[];
    readonly skills?: ReadonlyArray<{ readonly sectionId: string; readonly skillIds: readonly string[] }>;
  }): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      for (const section of input.synthesis) {
        await this.replaceSectionSynthesis(tx, section);
      }
      for (const replacement of input.skills ?? []) {
        await this.replaceSectionSkills(tx, replacement.sectionId, replacement.skillIds);
      }
      for (const update of input.updates) {
        await this.applyBulletUpdate(tx, update);
      }
      const claimed = await tx
        .update(resumes)
        .set({ generationStatus: 'ready', failureReason: null, updatedAt: new Date() })
        .where(eq(resumes.id, input.resumeId))
        .returning({ id: resumes.id });
      return claimed.length > 0;
    });
  }

  private async replaceSectionSkills(
    tx: Transaction,
    sectionId: string,
    skillIds: readonly string[],
  ): Promise<void> {
    await tx.delete(resumeSectionSkills).where(eq(resumeSectionSkills.sectionId, sectionId));
    for (let index = 0; index < skillIds.length; index += 1) {
      await tx.insert(resumeSectionSkills).values({
        sectionId,
        skillId: skillIds[index]!,
        ordinal: index,
      });
    }
  }

  private async replaceSectionSynthesis(tx: Transaction, section: SynthesisReplacement): Promise<void> {
    const candidates = await tx
      .select({ id: resumeEntries.id })
      .from(resumeEntries)
      .where(
        and(
          eq(resumeEntries.sectionId, section.sectionId),
          isNull(resumeEntries.experienceId),
          isNull(resumeEntries.educationEntryId),
        ),
      );
    const synthesisIds = await this.collectSynthesisIds(tx, candidates.map((entry) => entry.id));
    if (synthesisIds.length > 0) {
      await tx.delete(resumeEntries).where(inArray(resumeEntries.id, synthesisIds));
    }
    if (section.bullets.length === 0) {
      return;
    }
    const [entry] = await tx
      .insert(resumeEntries)
      .values({ sectionId: section.sectionId, ordinal: 0, experienceId: null, educationEntryId: null, heading: null })
      .returning({ id: resumeEntries.id });
    if (entry === undefined) {
      throw new Error('Failed to create synthesis entry');
    }
    for (let index = 0; index < section.bullets.length; index += 1) {
      const bullet = section.bullets[index]!;
      await tx.insert(resumeBullets).values({
        entryId: entry.id,
        ordinal: index,
        text: bullet.text,
        evidenceId: null,
        status: 'assumed',
        suggestionQuestion: null,
        requirementId: null,
        gapKind: null,
        needsReview: false,
        editedByPerson: bullet.editedByPerson,
      });
    }
  }

  private async collectSynthesisIds(tx: Transaction, entryIds: readonly string[]): Promise<string[]> {
    if (entryIds.length === 0) {
      return [];
    }
    const bullets = await tx.select().from(resumeBullets).where(inArray(resumeBullets.entryId, [...entryIds]));
    const byEntry = new Map<string, typeof bullets>();
    for (const bullet of bullets) {
      const existing = byEntry.get(bullet.entryId) ?? [];
      existing.push(bullet);
      byEntry.set(bullet.entryId, existing);
    }
    return entryIds.filter((entryId) => (byEntry.get(entryId) ?? []).every(isSynthesisBullet));
  }

  private async applyBulletUpdate(tx: Transaction, update: BulletUpdate): Promise<void> {
    await tx
      .update(resumeBullets)
      .set({
        text: update.text,
        status: update.status,
        suggestionQuestion: update.suggestionQuestion,
        gapKind: update.gapKind,
        editedByPerson: false,
      })
      .where(eq(resumeBullets.id, update.id));
  }

  private async insertSections(
    tx: Transaction,
    resumeId: string,
    sections: readonly ResumeSectionInput[],
  ): Promise<void> {
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex]!;
      const [sectionRow] = await tx
        .insert(resumeSections)
        .values({
          resumeId,
          kind: section.kind,
          title: section.title,
          ordinal: sectionIndex,
        })
        .returning({ id: resumeSections.id });
      if (sectionRow === undefined) {
        throw new Error('Failed to create resume section');
      }
      await this.insertEntries(tx, sectionRow.id, section.entries);
      await this.insertSectionSkills(tx, sectionRow.id, section.skillIds ?? []);
    }
  }

  private async insertEntries(
    tx: Transaction,
    sectionId: string,
    entries: readonly ResumeEntryInput[],
  ): Promise<void> {
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex]!;
      const [entryRow] = await tx
        .insert(resumeEntries)
        .values({
          sectionId,
          ordinal: entryIndex,
          experienceId: entry.experienceId,
          educationEntryId: entry.educationEntryId,
          heading: entry.heading,
        })
        .returning({ id: resumeEntries.id });
      if (entryRow === undefined) {
        throw new Error('Failed to create resume entry');
      }
      await this.insertBullets(tx, entryRow.id, entry.bullets);
    }
  }

  private async insertBullets(
    tx: Transaction,
    entryId: string,
    bullets: readonly ResumeBulletInput[],
  ): Promise<void> {
    for (let bulletIndex = 0; bulletIndex < bullets.length; bulletIndex += 1) {
      const bullet = bullets[bulletIndex]!;
      await tx.insert(resumeBullets).values({
        entryId,
        ordinal: bulletIndex,
        text: bullet.text,
        evidenceId: bullet.evidenceId,
        status: 'assumed',
        suggestionQuestion: null,
        requirementId: null,
        gapKind: null,
        needsReview: false,
        editedByPerson: false,
      });
    }
  }

  private async insertSectionSkills(
    tx: Transaction,
    sectionId: string,
    skillIds: readonly string[],
  ): Promise<void> {
    for (let index = 0; index < skillIds.length; index += 1) {
      await tx.insert(resumeSectionSkills).values({
        sectionId,
        skillId: skillIds[index]!,
        ordinal: index,
      });
    }
  }
}
