import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  careerProfiles,
  certifications,
  contactDetails,
  educationEntries,
  experiences,
  jobDescriptions,
  languages,
  requirements,
  resumeBullets,
  resumeEntries,
  resumeExports,
  resumeSectionSkills,
  resumeSections,
  resumeSkillProposals,
  resumes,
  sectionComments,
  skills,
} from 'schema';
import { DATABASE, type Database } from '../database/database.provider';
import { ResumeDocumentRepository } from './resume-document.repository';
import { deriveJobTitle } from './job-title';
import { orderSkills } from './skill-order';
import type {
  BulletUpdate,
  CreateBaseResumeDocument,
  SynthesisReplacement,
} from './resume-document.repository';

export type {
  BulletUpdate,
  CreateBaseResumeDocument,
  ResumeBulletInput,
  ResumeEntryInput,
  ResumeSectionInput,
  SynthesisReplacement,
} from './resume-document.repository';

type FailureReason = typeof resumes.$inferInsert.failureReason;

@Injectable()
export class ResumeRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(ResumeDocumentRepository) private readonly documents: ResumeDocumentRepository,
  ) {}

  async createBaseResume(input: CreateBaseResumeDocument): Promise<string> {
    return this.documents.createBaseResume(input);
  }

  async findResumeRow(resumeId: string): Promise<{ id: string; kind: string } | undefined> {
    const [row] = await this.database
      .select({ id: resumes.id, kind: resumes.kind })
      .from(resumes)
      .where(eq(resumes.id, resumeId));
    return row;
  }

  async findDocument(resumeId: string, userId: string): Promise<ResumeDocument | undefined> {
    const [resume] = await this.database
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
    if (resume === undefined) {
      return undefined;
    }
    const sections = await this.database
      .select()
      .from(resumeSections)
      .where(eq(resumeSections.resumeId, resume.id))
      .orderBy(asc(resumeSections.ordinal));
    const sectionIds = sections.map((section) => section.id);
    const entries =
      sectionIds.length === 0
        ? []
        : await this.database
            .select()
            .from(resumeEntries)
            .where(inArray(resumeEntries.sectionId, sectionIds))
            .orderBy(asc(resumeEntries.ordinal));
    const entryIds = entries.map((entry) => entry.id);
    const bullets =
      entryIds.length === 0
        ? []
        : await this.database
            .select()
            .from(resumeBullets)
            .where(inArray(resumeBullets.entryId, entryIds))
            .orderBy(asc(resumeBullets.ordinal));
    const comments =
      sectionIds.length === 0
        ? []
        : await this.database
            .select()
            .from(sectionComments)
            .where(inArray(sectionComments.sectionId, sectionIds));
    const sectionSkills =
      sectionIds.length === 0
        ? []
        : await this.database
            .select()
            .from(resumeSectionSkills)
            .where(inArray(resumeSectionSkills.sectionId, sectionIds));
    const skillIds = [...new Set(sectionSkills.map((row) => row.skillId))];
    const skillRows =
      skillIds.length === 0
        ? []
        : await this.database.select().from(skills).where(inArray(skills.id, skillIds));
    const skillProposals = await this.findSkillProposals(sectionIds);
    const exports = await this.database
      .select({ id: resumeExports.id, resumeId: resumeExports.resumeId, pageCount: resumeExports.pageCount, createdAt: resumeExports.createdAt })
      .from(resumeExports)
      .where(eq(resumeExports.resumeId, resume.id));
    return { resume, sections, entries, bullets, comments, sectionSkills, skills: skillRows, skillProposals, exports };
  }

  private async findSkillProposals(sectionIds: readonly string[]): Promise<ResumeSkillProposalWithNames[]> {
    if (sectionIds.length === 0) {
      return [];
    }
    const rows = await this.database
      .select()
      .from(resumeSkillProposals)
      .where(inArray(resumeSkillProposals.sectionId, [...sectionIds]))
      .orderBy(asc(resumeSkillProposals.ordinal));
    if (rows.length === 0) {
      return [];
    }
    const replacesIds = [...new Set(rows.map((row) => row.replacesSkillId).filter((id): id is string => id !== null))];
    const requirementIds = [...new Set(rows.map((row) => row.requirementId).filter((id): id is string => id !== null))];
    const replacesRows =
      replacesIds.length === 0
        ? []
        : await this.database.select().from(skills).where(inArray(skills.id, replacesIds));
    const requirementRows =
      requirementIds.length === 0
        ? []
        : await this.database.select().from(requirements).where(inArray(requirements.id, requirementIds));
    const replacesById = new Map(replacesRows.map((row) => [row.id, row.name] as const));
    const literalById = new Map(requirementRows.map((row) => [row.id, row.literalTerm] as const));
    return rows.map((row) => ({
      id: row.id,
      sectionId: row.sectionId,
      kind: row.kind,
      name: row.name,
      group: row.group,
      replacesSkillId: row.replacesSkillId,
      replacesSkillName: row.replacesSkillId === null ? null : (replacesById.get(row.replacesSkillId) ?? null),
      requirementId: row.requirementId,
      literalTerm: row.requirementId === null ? null : (literalById.get(row.requirementId) ?? null),
      status: row.status,
      ordinal: row.ordinal,
    }));
  }

  async findDisplayDetails(userId: string): Promise<ResumeDisplayDetails> {
    const [profile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (profile === undefined) {
      return { contact: undefined, experiences: [], educationEntries: [], skills: [], languages: [], certifications: [] };
    }
    const [contact] = await this.database
      .select()
      .from(contactDetails)
      .where(eq(contactDetails.careerProfileId, profile.id));
    const experienceRows = await this.database
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profile.id));
    const educationRows = await this.database
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, profile.id));
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
    return {
      contact,
      experiences: experienceRows,
      educationEntries: educationRows,
      skills: orderSkillsByGroupThenCreation(skillRows),
      languages: languageRows,
      certifications: certificationRows,
    };
  }

  async listByUser(userId: string): Promise<ResumeListRow[]> {
    const rows = await this.database
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(asc(resumes.createdAt));
    const resumeIds = rows.map((row) => row.id);
    const exportRows =
      resumeIds.length === 0
        ? []
        : await this.database
            .select({ id: resumeExports.id, resumeId: resumeExports.resumeId, pageCount: resumeExports.pageCount, createdAt: resumeExports.createdAt })
            .from(resumeExports)
            .where(inArray(resumeExports.resumeId, resumeIds));
    const jobIds = [...new Set(rows.map((row) => row.jobDescriptionId).filter((id): id is string => id !== null))];
    const jobRows =
      jobIds.length === 0
        ? []
        : await this.database
            .select({ id: jobDescriptions.id, rawText: jobDescriptions.rawText })
            .from(jobDescriptions)
            .where(inArray(jobDescriptions.id, jobIds));
    const jobTitleById = new Map(jobRows.map((row) => [row.id, deriveJobTitle(row.rawText)] as const));
    return rows.map((row) => ({
      resume: row,
      exports: exportRows.filter((item) => item.resumeId === row.id),
      jobTitle: row.jobDescriptionId === null ? null : (jobTitleById.get(row.jobDescriptionId) ?? null),
    }));
  }

  async updateSettings(
    resumeId: string,
    userId: string,
    settings: Partial<{
      name: string;
      language: 'pt' | 'en';
      template: 'comfortable' | 'dense';
      lengthTarget: 1 | 2;
      writingMethod: 'star' | 'xyz' | 'car' | 'apr' | 'free';
      tone: 'formal' | 'direct' | 'technical';
    }>,
  ): Promise<boolean> {
    const updated = await this.database
      .update(resumes)
      .set({ ...settings, updatedAt: new Date() })
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .returning({ id: resumes.id });
    return updated.length > 0;
  }

  async updateStructure(
    resumeId: string,
    userId: string,
    sections: ReadonlyArray<{ id: string; ordinal: number }>,
  ): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [resume] = await tx
        .select({ id: resumes.id })
        .from(resumes)
        .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
      if (resume === undefined) {
        return false;
      }
      const existing = await tx
        .select({ id: resumeSections.id })
        .from(resumeSections)
        .where(eq(resumeSections.resumeId, resumeId));
      const existingIds = new Set(existing.map((section) => section.id));
      for (const section of sections) {
        if (!existingIds.has(section.id)) {
          return false;
        }
      }
      for (const section of sections) {
        await tx
          .update(resumeSections)
          .set({ ordinal: section.ordinal })
          .where(eq(resumeSections.id, section.id));
      }
      const keepIds = new Set(sections.map((section) => section.id));
      const removeIds = existing.map((section) => section.id).filter((id) => !keepIds.has(id));
      for (const id of removeIds) {
        await tx.delete(resumeSections).where(eq(resumeSections.id, id));
      }
      await tx
        .update(resumes)
        .set({ updatedAt: new Date() })
        .where(eq(resumes.id, resumeId));
      return true;
    });
  }

  async createSection(
    resumeId: string,
    userId: string,
    input: {
      kind: 'summary' | 'experience' | 'education' | 'skills' | 'languages' | 'certifications' | 'custom';
      title: string | null;
      ordinal: number;
      items: readonly string[];
    },
  ): Promise<string | undefined> {
    const [resume] = await this.database
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
    if (resume === undefined) {
      return undefined;
    }
    const [section] = await this.database
      .insert(resumeSections)
      .values({
        resumeId,
        kind: input.kind,
        title: input.title,
        ordinal: input.ordinal,
      })
      .returning({ id: resumeSections.id });
    if (section !== undefined && input.kind === 'custom') {
      for (let index = 0; index < input.items.length; index += 1) {
        await this.database.insert(resumeEntries).values({
          sectionId: section.id,
          ordinal: index,
          experienceId: null,
          educationEntryId: null,
          heading: input.items[index],
        });
      }
    }
    await this.database
      .update(resumes)
      .set({ updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
    return section?.id;
  }

  async deleteResume(resumeId: string, userId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .returning({ id: resumes.id });
    return deleted.length > 0;
  }

  async updateBulletsAndMarkReady(
    resumeId: string,
    updates: readonly BulletUpdate[],
  ): Promise<boolean> {
    return this.documents.updateBulletsAndMarkReady(resumeId, updates);
  }

  async replaceSynthesisAndMarkReady(input: {
    readonly resumeId: string;
    readonly synthesis: ReadonlyArray<SynthesisReplacement>;
    readonly updates: readonly BulletUpdate[];
    readonly skills?: ReadonlyArray<{ readonly sectionId: string; readonly skillIds: readonly string[] }>;
  }): Promise<boolean> {
    return this.documents.replaceSynthesisAndMarkReady(input);
  }

  async markGenerating(resumeId: string): Promise<boolean> {
    const updated = await this.database
      .update(resumes)
      .set({ generationStatus: 'generating', failureReason: null, updatedAt: new Date() })
      .where(eq(resumes.id, resumeId))
      .returning({ id: resumes.id });
    return updated.length > 0;
  }

  async markFailed(resumeId: string, failureReason: FailureReason): Promise<boolean> {
    const updated = await this.database
      .update(resumes)
      .set({ generationStatus: 'failed', failureReason, updatedAt: new Date() })
      .where(eq(resumes.id, resumeId))
      .returning({ id: resumes.id });
    return updated.length > 0;
  }

  async markReadyWithNotice(resumeId: string, failureReason: FailureReason): Promise<boolean> {
    const updated = await this.database
      .update(resumes)
      .set({ generationStatus: 'ready', failureReason, updatedAt: new Date() })
      .where(eq(resumes.id, resumeId))
      .returning({ id: resumes.id });
    return updated.length > 0;
  }
}

export interface ResumeSkillProposalWithNames {
  readonly id: string;
  readonly sectionId: string;
  readonly kind: 'addition' | 'swap';
  readonly name: string;
  readonly group: string | null;
  readonly replacesSkillId: string | null;
  readonly replacesSkillName: string | null;
  readonly requirementId: string | null;
  readonly literalTerm: string | null;
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly ordinal: number;
}

export interface ResumeDocument {
  readonly resume: typeof resumes.$inferSelect;
  readonly sections: ReadonlyArray<typeof resumeSections.$inferSelect>;
  readonly entries: ReadonlyArray<typeof resumeEntries.$inferSelect>;
  readonly bullets: ReadonlyArray<typeof resumeBullets.$inferSelect>;
  readonly comments: ReadonlyArray<typeof sectionComments.$inferSelect>;
  readonly sectionSkills: ReadonlyArray<typeof resumeSectionSkills.$inferSelect>;
  readonly skills: ReadonlyArray<typeof skills.$inferSelect>;
  readonly skillProposals: ReadonlyArray<ResumeSkillProposalWithNames>;
  readonly exports: ReadonlyArray<Pick<typeof resumeExports.$inferSelect, 'id' | 'resumeId' | 'pageCount' | 'createdAt'>>;
}

export interface ResumeDisplayDetails {
  readonly contact: typeof contactDetails.$inferSelect | undefined;
  readonly experiences: ReadonlyArray<typeof experiences.$inferSelect>;
  readonly educationEntries: ReadonlyArray<typeof educationEntries.$inferSelect>;
  readonly skills: ReadonlyArray<typeof skills.$inferSelect>;
  readonly languages: ReadonlyArray<typeof languages.$inferSelect>;
  readonly certifications: ReadonlyArray<typeof certifications.$inferSelect>;
}

export interface ResumeListRow {
  readonly resume: typeof resumes.$inferSelect;
  readonly exports: ReadonlyArray<Pick<typeof resumeExports.$inferSelect, 'id' | 'resumeId' | 'pageCount' | 'createdAt'>>;
  readonly jobTitle: string | null;
}

function orderSkillsByGroupThenCreation<
  T extends { group: string | null; ordinal?: number; createdAt: Date },
>(rows: readonly T[]): T[] {
  return orderSkills(rows);
}
