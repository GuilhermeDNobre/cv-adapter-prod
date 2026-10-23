import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from 'schema';
import { careerProfiles, experiences, jobDescriptions, requirements, resumeBullets, resumeEntries, resumeSections, resumeSkillProposals, resumes, skills, users } from 'schema';
import { saveTailoredDocument } from './tailored-document-writer';
import type { Database } from '../../database/database.provider';

const TEST_DATABASE = 'cv_adapter_skill_proposals_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';

function urlWithDatabase(pathname: string): string {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  url.pathname = pathname;
  return url.toString();
}

async function withAdminClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: urlWithDatabase('/postgres') });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

let pool: Pool;
let db: NodePgDatabase<typeof schema>;

beforeAll(async () => {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  });
  pool = new Pool({ connectionString: urlWithDatabase(`/${TEST_DATABASE}`) });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}, 120_000);

afterAll(async () => {
  await pool.end();
  await withAdminClient((client) => client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`));
});

describe('saveTailoredDocument skill proposals', () => {
  it('should persist accepted additions and pending swaps with ordinals for a skills section', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const [profile] = await db.insert(careerProfiles).values({ userId: ownerId }).returning();
    const [skill] = await db
      .insert(skills)
      .values({ careerProfileId: profile!.id, name: 'Jest', group: 'Testes' })
      .returning();
    const [job] = await db.insert(jobDescriptions).values({ userId: ownerId, rawText: 'Hiring', language: 'en' }).returning();
    const [fastifyReq] = await db
      .insert(requirements)
      .values({
        jobDescriptionId: job!.id,
        literalTerm: 'Fastify',
        concept: 'Fastify',
        normalizedConcept: 'fastify',
        kind: 'mandatory',
        ordinal: 0,
      })
      .returning();
    const [vitestReq] = await db
      .insert(requirements)
      .values({
        jobDescriptionId: job!.id,
        literalTerm: 'Vitest',
        concept: 'Vitest',
        normalizedConcept: 'vitest',
        kind: 'desirable',
        ordinal: 1,
      })
      .returning();
    const [tailored] = await db
      .insert(resumes)
      .values({
        userId: ownerId,
        kind: 'tailored',
        name: 'Tailored',
        language: 'en',
        template: 'comfortable',
        lengthTarget: 1,
        writingMethod: 'xyz',
        tone: 'direct',
        baseResumeId: null,
        jobDescriptionId: job!.id,
        generationStatus: 'generating',
      })
      .returning();
    const [skillsSection] = await db
      .insert(resumeSections)
      .values({ resumeId: tailored!.id, kind: 'skills', title: null, ordinal: 0 })
      .returning();

    await saveTailoredDocument({ database: db as unknown as Database }, {
      document: { sections: [{ id: skillsSection!.id, kind: 'skills', ordinal: 0 }] },
      tailored: { id: tailored!.id },
      plan: { allocations: [], coverages: [], addedEvidenceIds: [], removedEvidenceIds: [], baseEvidenceIds: [] },
      written: [],
      suggestions: [],
      base: undefined,
      career: { evidenceById: new Map(), experienceById: new Map() },
      skills: [],
      skillProposals: [
        { kind: 'addition', name: 'Fastify', group: 'Back-end', replacesSkillId: null, requirementId: fastifyReq!.id, ordinal: 0 },
        { kind: 'swap', name: 'Vitest', group: 'Testes', replacesSkillId: skill!.id, requirementId: vitestReq!.id, ordinal: 1 },
      ],
    });

    const rows = await db.select().from(resumeSkillProposals).where(eq(resumeSkillProposals.sectionId, skillsSection!.id));
    expect(rows).toHaveLength(2);
    const byName = new Map(rows.map((row) => [row.name, row]));
    expect(byName.get('Fastify')?.status).toBe('accepted');
    expect(byName.get('Fastify')?.ordinal).toBe(0);
    expect(byName.get('Fastify')?.requirementId).toBe(fastifyReq!.id);
    expect(byName.get('Vitest')?.status).toBe('pending');
    expect(byName.get('Vitest')?.replacesSkillId).toBe(skill!.id);
    expect(byName.get('Vitest')?.requirementId).toBe(vitestReq!.id);
  }, 120_000);

  it('should place a suggestion with a valid experienceId inside that experience entry', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const [job] = await db.insert(jobDescriptions).values({ userId: ownerId, rawText: 'Hiring', language: 'en' }).returning();
    const [profile] = await db.insert(careerProfiles).values({ userId: ownerId }).returning();
    const [tailored] = await db
      .insert(resumes)
      .values({
        userId: ownerId,
        kind: 'tailored',
        name: 'Tailored',
        language: 'en',
        template: 'comfortable',
        lengthTarget: 1,
        writingMethod: 'xyz',
        tone: 'direct',
        baseResumeId: null,
        jobDescriptionId: job!.id,
        generationStatus: 'generating',
      })
      .returning();
    const [experienceSection] = await db
      .insert(resumeSections)
      .values({ resumeId: tailored!.id, kind: 'experience', title: null, ordinal: 0 })
      .returning();
    const [experience] = await db
      .insert(experiences)
      .values({ careerProfileId: profile!.id, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null })
      .returning();
    const experienceId = experience!.id;
    const [gapReq] = await db
      .insert(requirements)
      .values({ jobDescriptionId: job!.id, literalTerm: 'Git', concept: 'Git', normalizedConcept: 'git', kind: 'mandatory', ordinal: 0 })
      .returning();
    const requirementId = gapReq!.id;
    await saveTailoredDocument({ database: db as unknown as Database }, {
      document: { sections: [{ id: experienceSection!.id, kind: 'experience', ordinal: 0 }] },
      tailored: { id: tailored!.id },
      plan: { allocations: [], coverages: [], addedEvidenceIds: [], removedEvidenceIds: [], baseEvidenceIds: [] },
      written: [],
      suggestions: [
        { requirementId, gapKind: 'existence', question: 'Have you used Git?', draftBullet: 'Used Git for versioning.', experienceId },
      ],
      base: undefined,
      career: { evidenceById: new Map(), experienceById: new Map([[experienceId, { startedOn: '2020-01-01' }]]) },
      skills: [],
      skillProposals: [],
    });
    const entries = await db.select().from(resumeEntries).where(eq(resumeEntries.sectionId, experienceSection!.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.experienceId).toBe(experienceId);
    const bullets = await db.select().from(resumeBullets).where(eq(resumeBullets.entryId, entries[0]!.id));
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toMatchObject({ status: 'suggestion', requirementId, text: 'Used Git for versioning.' });
  }, 120_000);

  it('should fall back to the loose entry when the experienceId is invalid', async () => {
    const ownerId = randomUUID();
    await db.insert(users).values({ id: ownerId });
    const [job] = await db.insert(jobDescriptions).values({ userId: ownerId, rawText: 'Hiring', language: 'en' }).returning();
    const [tailored] = await db
      .insert(resumes)
      .values({
        userId: ownerId,
        kind: 'tailored',
        name: 'Tailored',
        language: 'en',
        template: 'comfortable',
        lengthTarget: 1,
        writingMethod: 'xyz',
        tone: 'direct',
        baseResumeId: null,
        jobDescriptionId: job!.id,
        generationStatus: 'generating',
      })
      .returning();
    const [experienceSection] = await db
      .insert(resumeSections)
      .values({ resumeId: tailored!.id, kind: 'experience', title: null, ordinal: 0 })
      .returning();
    const [gapReq] = await db
      .insert(requirements)
      .values({ jobDescriptionId: job!.id, literalTerm: 'Git', concept: 'Git', normalizedConcept: 'git', kind: 'mandatory', ordinal: 0 })
      .returning();
    const requirementId = gapReq!.id;
    const unknownExperience = randomUUID();
    await saveTailoredDocument({ database: db as unknown as Database }, {
      document: { sections: [{ id: experienceSection!.id, kind: 'experience', ordinal: 0 }] },
      tailored: { id: tailored!.id },
      plan: { allocations: [], coverages: [], addedEvidenceIds: [], removedEvidenceIds: [], baseEvidenceIds: [] },
      written: [],
      suggestions: [
        { requirementId, gapKind: 'existence', question: 'Have you used Git?', draftBullet: 'Used Git for versioning.', experienceId: unknownExperience },
      ],
      base: undefined,
      career: { evidenceById: new Map(), experienceById: new Map() },
      skills: [],
      skillProposals: [],
    });
    const entries = await db.select().from(resumeEntries).where(eq(resumeEntries.sectionId, experienceSection!.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.experienceId).toBeNull();
    expect(entries[0]?.ordinal).toBe(999);
  }, 120_000);
});
