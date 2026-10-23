import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  evidences,
  resumeBullets,
  resumeEntries,
  resumeSections,
  resumes,
  sectionComments,
} from 'schema';
import { DATABASE, type Database } from '../database/database.provider';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface OwnedBullet {
  readonly bullet: typeof resumeBullets.$inferSelect;
  readonly resumeId: string;
}

export interface OwnedSection {
  readonly section: typeof resumeSections.$inferSelect;
  readonly resume: typeof resumes.$inferSelect;
}

export interface SectionState {
  readonly entries: ReadonlyArray<typeof resumeEntries.$inferSelect>;
  readonly bullets: ReadonlyArray<typeof resumeBullets.$inferSelect>;
}

export interface ReviewBullet {
  readonly bullet: typeof resumeBullets.$inferSelect;
  readonly sectionKind: string;
  readonly entryId: string;
  readonly entryExperienceId: string | null;
}

@Injectable()
export class ResumeEditingRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findOwnedBullet(userId: string, bulletId: string): Promise<OwnedBullet | undefined> {
    const [bullet] = await this.database.select().from(resumeBullets).where(eq(resumeBullets.id, bulletId));
    if (bullet === undefined) {
      return undefined;
    }
    const resumeId = await this.findResumeIdForEntry(userId, bullet.entryId);
    if (resumeId === undefined) {
      return undefined;
    }
    return { bullet, resumeId };
  }

  async updateBulletText(bulletId: string, text: string): Promise<void> {
    await this.database
      .update(resumeBullets)
      .set({ text, editedByPerson: true, needsReview: false })
      .where(eq(resumeBullets.id, bulletId));
  }

  async findOwnedSection(userId: string, sectionId: string): Promise<OwnedSection | undefined> {
    const [section] = await this.database.select().from(resumeSections).where(eq(resumeSections.id, sectionId));
    if (section === undefined) {
      return undefined;
    }
    const [resume] = await this.database
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, section.resumeId), eq(resumes.userId, userId)));
    if (resume === undefined) {
      return undefined;
    }
    return { section, resume };
  }

  async findOwnedResumeRow(userId: string, resumeId: string): Promise<typeof resumes.$inferSelect | undefined> {
    const [resume] = await this.database
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
    return resume;
  }

  async createSectionComment(sectionId: string, text: string): Promise<string> {
    const [row] = await this.database
      .insert(sectionComments)
      .values({ sectionId, text })
      .returning({ id: sectionComments.id });
    if (row === undefined) {
      throw new Error('Failed to create section comment');
    }
    return row.id;
  }

  async resolveSectionComment(userId: string, commentId: string): Promise<string | undefined> {
    const [comment] = await this.database.select().from(sectionComments).where(eq(sectionComments.id, commentId));
    if (comment === undefined) {
      return undefined;
    }
    const owned = await this.findOwnedSection(userId, comment.sectionId);
    if (owned === undefined) {
      return undefined;
    }
    await this.database
      .update(sectionComments)
      .set({ resolvedAt: new Date() })
      .where(eq(sectionComments.id, commentId));
    return owned.resume.id;
  }

  async readSectionState(sectionId: string): Promise<SectionState> {
    const entries = await this.database
      .select()
      .from(resumeEntries)
      .where(eq(resumeEntries.sectionId, sectionId));
    const entryIds = entries.map((entry) => entry.id);
    const bullets =
      entryIds.length === 0
        ? []
        : await this.database.select().from(resumeBullets).where(inArray(resumeBullets.entryId, entryIds));
    return { entries, bullets };
  }

  async writeUndoSnapshot(sectionId: string, state: SectionState): Promise<void> {
    await this.database
      .update(resumeSections)
      .set({ undoSnapshot: { entries: state.entries, bullets: state.bullets } })
      .where(eq(resumeSections.id, sectionId));
  }

  async readUndoSnapshot(sectionId: string): Promise<SectionState | undefined> {
    const [section] = await this.database.select().from(resumeSections).where(eq(resumeSections.id, sectionId));
    const snapshot = section?.undoSnapshot as { entries?: unknown; bullets?: unknown } | null | undefined;
    if (snapshot === null || snapshot === undefined) {
      return undefined;
    }
    if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.bullets)) {
      return undefined;
    }
    return {
      entries: snapshot.entries as SectionState['entries'],
      bullets: snapshot.bullets as SectionState['bullets'],
    };
  }

  async restoreSectionState(sectionId: string, state: SectionState): Promise<void> {
    await this.database.transaction(async (tx) => {
      await this.deleteSectionEntries(tx, sectionId);
      await this.insertSectionState(tx, sectionId, state);
      await tx.update(resumeSections).set({ undoSnapshot: null }).where(eq(resumeSections.id, sectionId));
    });
  }

  async markGenerating(resumeId: string): Promise<void> {
    await this.database
      .update(resumes)
      .set({ generationStatus: 'generating', failureReason: null, updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
  }

  async listReviewBulletsForEvidence(userId: string, evidenceId: string): Promise<ReviewBullet[]> {
    const bullets = await this.database.select().from(resumeBullets).where(eq(resumeBullets.evidenceId, evidenceId));
    return this.filterUserBullets(userId, bullets);
  }

  async listReviewBulletsForExperience(userId: string, experienceId: string): Promise<ReviewBullet[]> {
    const linkedEntries = await this.database
      .select({ id: resumeEntries.id })
      .from(resumeEntries)
      .where(eq(resumeEntries.experienceId, experienceId));
    const linkedIds = new Set(linkedEntries.map((entry) => entry.id));
    const evidenceRows = await this.database
      .select({ id: evidences.id })
      .from(evidences)
      .where(eq(evidences.experienceId, experienceId));
    const evidenceIds = evidenceRows.map((row) => row.id);
    const byEntry =
      linkedIds.size === 0
        ? []
        : await this.database.select().from(resumeBullets).where(inArray(resumeBullets.entryId, [...linkedIds]));
    const byEvidence =
      evidenceIds.length === 0
        ? []
        : await this.database.select().from(resumeBullets).where(inArray(resumeBullets.evidenceId, evidenceIds));
    const merged = new Map(byEntry.concat(byEvidence).map((bullet) => [bullet.id, bullet]));
    return this.filterUserBullets(userId, [...merged.values()]);
  }

  async markBulletsNeedingReview(bulletIds: readonly string[]): Promise<number> {
    if (bulletIds.length === 0) {
      return 0;
    }
    const updated = await this.database
      .update(resumeBullets)
      .set({ needsReview: true })
      .where(inArray(resumeBullets.id, [...bulletIds]))
      .returning({ id: resumeBullets.id });
    return updated.length;
  }

  private async findResumeIdForEntry(userId: string, entryId: string): Promise<string | undefined> {
    const [entry] = await this.database.select().from(resumeEntries).where(eq(resumeEntries.id, entryId));
    if (entry === undefined) {
      return undefined;
    }
    const [section] = await this.database.select().from(resumeSections).where(eq(resumeSections.id, entry.sectionId));
    if (section === undefined) {
      return undefined;
    }
    const [resume] = await this.database
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, section.resumeId), eq(resumes.userId, userId)));
    return resume?.id;
  }

  private async filterUserBullets(
    userId: string,
    bullets: ReadonlyArray<typeof resumeBullets.$inferSelect>,
  ): Promise<ReviewBullet[]> {
    if (bullets.length === 0) {
      return [];
    }
    const entryIds = [...new Set(bullets.map((bullet) => bullet.entryId))];
    const entries = await this.database.select().from(resumeEntries).where(inArray(resumeEntries.id, entryIds));
    const entryById = new Map(entries.map((entry) => [entry.id, entry]));
    const sectionIds = [...new Set(entries.map((entry) => entry.sectionId))];
    const sections =
      sectionIds.length === 0
        ? []
        : await this.database.select().from(resumeSections).where(inArray(resumeSections.id, sectionIds));
    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const resumeIds = [...new Set(sections.map((section) => section.resumeId))];
    const ownedResumes =
      resumeIds.length === 0
        ? []
        : await this.database
            .select({ id: resumes.id })
            .from(resumes)
            .where(and(inArray(resumes.id, resumeIds), eq(resumes.userId, userId)));
    const owned = new Set(ownedResumes.map((row) => row.id));
    const result: ReviewBullet[] = [];
    for (const bullet of bullets) {
      const entry = entryById.get(bullet.entryId);
      const section = entry === undefined ? undefined : sectionById.get(entry.sectionId);
      if (section === undefined || !owned.has(section.resumeId)) {
        continue;
      }
      result.push({
        bullet,
        sectionKind: section.kind,
        entryId: entry?.id ?? bullet.entryId,
        entryExperienceId: entry?.experienceId ?? null,
      });
    }
    return result;
  }

  private async deleteSectionEntries(tx: Transaction, sectionId: string): Promise<void> {
    const entries = await tx.select({ id: resumeEntries.id }).from(resumeEntries).where(eq(resumeEntries.sectionId, sectionId));
    const entryIds = entries.map((entry) => entry.id);
    if (entryIds.length > 0) {
      await tx.delete(resumeBullets).where(inArray(resumeBullets.entryId, entryIds));
    }
    await tx.delete(resumeEntries).where(eq(resumeEntries.sectionId, sectionId));
  }

  private async insertSectionState(tx: Transaction, sectionId: string, state: SectionState): Promise<void> {
    for (const entry of state.entries) {
      await tx.insert(resumeEntries).values({
        id: entry.id,
        sectionId,
        ordinal: entry.ordinal,
        experienceId: entry.experienceId,
        educationEntryId: entry.educationEntryId,
        heading: entry.heading,
      });
    }
    for (const bullet of state.bullets) {
      await tx.insert(resumeBullets).values({
        id: bullet.id,
        entryId: bullet.entryId,
        ordinal: bullet.ordinal,
        text: bullet.text,
        evidenceId: bullet.evidenceId,
        status: bullet.status,
        suggestionQuestion: bullet.suggestionQuestion,
        requirementId: bullet.requirementId,
        gapKind: bullet.gapKind,
        needsReview: bullet.needsReview,
        editedByPerson: bullet.editedByPerson,
      });
    }
  }
}
