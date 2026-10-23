import { eq } from 'drizzle-orm';
import { careerProfiles, educationEntries, evidences, experiences } from 'schema';
import type { Database } from '../../database/database.provider';

export interface ResumeCareerMaps {
  readonly evidenceById: Map<string, typeof evidences.$inferSelect>;
  readonly experienceById: Map<string, typeof experiences.$inferSelect>;
  readonly educationById: Map<string, typeof educationEntries.$inferSelect>;
}

export async function loadResumeCareerMaps(database: Database, userId: string): Promise<ResumeCareerMaps | undefined> {
  const [profile] = await database
    .select({ id: careerProfiles.id })
    .from(careerProfiles)
    .where(eq(careerProfiles.userId, userId));
  if (profile === undefined) {
    return undefined;
  }
  const evidenceRows = await database.select().from(evidences).where(eq(evidences.careerProfileId, profile.id));
  const experienceRows = await database.select().from(experiences).where(eq(experiences.careerProfileId, profile.id));
  const educationRows = await database.select().from(educationEntries).where(eq(educationEntries.careerProfileId, profile.id));
  return {
    evidenceById: new Map(evidenceRows.map((row) => [row.id, row] as const)),
    experienceById: new Map(experienceRows.map((row) => [row.id, row] as const)),
    educationById: new Map(educationRows.map((row) => [row.id, row] as const)),
  };
}
