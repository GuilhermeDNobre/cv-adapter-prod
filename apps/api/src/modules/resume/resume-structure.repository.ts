import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { careerProfiles, evidences, resumeBullets, resumeEntries, resumeSections, resumes } from 'schema';
import { DATABASE, type Database } from '../database/database.provider';

export interface OwnedStructureSection {
  readonly section: typeof resumeSections.$inferSelect;
  readonly resume: typeof resumes.$inferSelect;
}

export interface OwnedStructureBullet {
  readonly bullet: typeof resumeBullets.$inferSelect;
  readonly entry: typeof resumeEntries.$inferSelect;
  readonly section: typeof resumeSections.$inferSelect;
  readonly resumeId: string;
}

export interface OwnedStructureEntry {
  readonly entry: typeof resumeEntries.$inferSelect;
  readonly section: typeof resumeSections.$inferSelect;
  readonly resumeId: string;
}

@Injectable()
export class ResumeStructureRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findOwnedSection(userId: string, sectionId: string): Promise<OwnedStructureSection | undefined> {
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

  async findOwnedBullet(userId: string, bulletId: string): Promise<OwnedStructureBullet | undefined> {
    const [bullet] = await this.database.select().from(resumeBullets).where(eq(resumeBullets.id, bulletId));
    if (bullet === undefined) {
      return undefined;
    }
    const [entry] = await this.database.select().from(resumeEntries).where(eq(resumeEntries.id, bullet.entryId));
    if (entry === undefined) {
      return undefined;
    }
    const owned = await this.findOwnedSection(userId, entry.sectionId);
    if (owned === undefined) {
      return undefined;
    }
    return { bullet, entry, section: owned.section, resumeId: owned.resume.id };
  }

  async findOwnedEntry(userId: string, entryId: string): Promise<OwnedStructureEntry | undefined> {
    const [entry] = await this.database.select().from(resumeEntries).where(eq(resumeEntries.id, entryId));
    if (entry === undefined) {
      return undefined;
    }
    const owned = await this.findOwnedSection(userId, entry.sectionId);
    if (owned === undefined) {
      return undefined;
    }
    return { entry, section: owned.section, resumeId: owned.resume.id };
  }

  async deleteSection(sectionId: string): Promise<void> {
    await this.database.delete(resumeSections).where(eq(resumeSections.id, sectionId));
  }

  async listEntryBullets(entryId: string): Promise<ReadonlyArray<typeof resumeBullets.$inferSelect>> {
    return this.database
      .select()
      .from(resumeBullets)
      .where(eq(resumeBullets.entryId, entryId))
      .orderBy(asc(resumeBullets.ordinal));
  }

  async swapBulletOrdinals(input: {
    readonly firstId: string;
    readonly firstOrdinal: number;
    readonly secondId: string;
    readonly secondOrdinal: number;
  }): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.update(resumeBullets).set({ ordinal: input.secondOrdinal }).where(eq(resumeBullets.id, input.firstId));
      await tx.update(resumeBullets).set({ ordinal: input.firstOrdinal }).where(eq(resumeBullets.id, input.secondId));
    });
  }

  async deleteBullet(bulletId: string): Promise<void> {
    await this.database.delete(resumeBullets).where(eq(resumeBullets.id, bulletId));
  }

  async listSectionEntries(sectionId: string): Promise<ReadonlyArray<typeof resumeEntries.$inferSelect>> {
    return this.database
      .select()
      .from(resumeEntries)
      .where(eq(resumeEntries.sectionId, sectionId))
      .orderBy(asc(resumeEntries.ordinal));
  }

  async createCustomEntry(input: { readonly sectionId: string; readonly heading: string }): Promise<string> {
    const entries = await this.listSectionEntries(input.sectionId);
    const nextOrdinal = entries.reduce((max, entry) => Math.max(max, entry.ordinal + 1), 0);
    const [row] = await this.database
      .insert(resumeEntries)
      .values({ sectionId: input.sectionId, ordinal: nextOrdinal, experienceId: null, educationEntryId: null, heading: input.heading })
      .returning({ id: resumeEntries.id });
    if (row === undefined) {
      throw new Error('Failed to create custom entry');
    }
    return row.id;
  }

  async deleteEntry(entryId: string): Promise<void> {
    await this.database.delete(resumeEntries).where(eq(resumeEntries.id, entryId));
  }

  async createEntry(input: { readonly sectionId: string; readonly heading: string | null }): Promise<string> {
    const entries = await this.listSectionEntries(input.sectionId);
    const nextOrdinal = entries.reduce((max, entry) => Math.max(max, entry.ordinal + 1), 0);
    const [row] = await this.database
      .insert(resumeEntries)
      .values({ sectionId: input.sectionId, ordinal: nextOrdinal, experienceId: null, educationEntryId: null, heading: input.heading })
      .returning({ id: resumeEntries.id });
    if (row === undefined) {
      throw new Error('Failed to create entry');
    }
    return row.id;
  }

  async createBullet(input: { readonly entryId: string; readonly text: string; readonly evidenceId: string | null }): Promise<string> {
    const bullets = await this.listEntryBullets(input.entryId);
    const nextOrdinal = bullets.reduce((max, bullet) => Math.max(max, bullet.ordinal + 1), 0);
    const [row] = await this.database
      .insert(resumeBullets)
      .values({
        entryId: input.entryId,
        ordinal: nextOrdinal,
        text: input.text,
        evidenceId: input.evidenceId,
        status: 'assumed',
        suggestionQuestion: null,
        requirementId: null,
        gapKind: null,
        needsReview: false,
        editedByPerson: true,
      })
      .returning({ id: resumeBullets.id });
    if (row === undefined) {
      throw new Error('Failed to create bullet');
    }
    return row.id;
  }

  async findCareerProfileId(userId: string): Promise<string | undefined> {
    const [profile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    return profile?.id;
  }

  async createEvidence(input: { readonly careerProfileId: string; readonly experienceId: string | null; readonly statement: string }): Promise<string> {
    const [row] = await this.database
      .insert(evidences)
      .values({ careerProfileId: input.careerProfileId, experienceId: input.experienceId, statement: input.statement })
      .returning({ id: evidences.id });
    if (row === undefined) {
      throw new Error('Failed to create evidence');
    }
    return row.id;
  }

  async touchResume(resumeId: string): Promise<void> {
    await this.database.update(resumes).set({ updatedAt: new Date() }).where(eq(resumes.id, resumeId));
  }
}
