import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import { careerProfiles, evidences, experiences, jobDescriptions, requirements, resumeBullets, resumes } from 'schema';
import { eq } from 'drizzle-orm';
import { LOCAL_USER_ID } from 'schema/local-user';
import { resumeDocumentResponseSchema } from 'schema/contracts/resume';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeDocumentRepository } from '../src/modules/resume/resume-document.repository';
import { ResumeRepository } from '../src/modules/resume/resume.repository';
import { ResumeWritingProcessor } from '../src/modules/resume/writing/resume-writing.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_adaptation_review_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/7';

function urlWithDatabase(database: string): string {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  url.pathname = database;
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

const aiComplete = vi.fn(
  async (..._args: unknown[]): Promise<{
    bullets?: Array<{ evidenceId: string; text: string }>;
    allocations?: Array<{ sectionKind: string; evidenceIds: string[] }>;
    coverages?: Array<{ requirementId: string; coverage: string; evidenceId: string | null; gapKind: string | null }>;
    suggestions?: Array<{ requirementId: string; gapKind: string; question: string; draftBullet: string }>;
  }> => ({ bullets: [] }),
);

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function createCareerWithThreeEvidences(): Promise<{ experienceId: string; evidenceA: string; evidenceB: string; evidenceC: string }> {
  const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
  const [experience] = await db
    .insert(experiences)
    .values({ careerProfileId: profile!.id, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: '2023-01-01' })
    .returning();
  const [evidenceA] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Led team of five engineers' })
    .returning();
  const [evidenceB] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Shipped checkout flow' })
    .returning();
  const [evidenceC] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Migrated to Kubernetes' })
    .returning();
  return { experienceId: experience!.id, evidenceA: evidenceA!.id, evidenceB: evidenceB!.id, evidenceC: evidenceC!.id };
}

function fakeJob(resumeId: string, name?: string, attemptsMade = 0): never {
  return {
    name,
    data: { resumeId, userId: LOCAL_USER_ID },
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: async () => undefined,
  } as never;
}

async function runProcessor(resumeId: string, name?: string): Promise<void> {
  const repository = new ResumeRepository(db as unknown as Database, new ResumeDocumentRepository(db as unknown as Database));
  const processor = new ResumeWritingProcessor(db as unknown as Database, { complete: aiComplete } as unknown as AiClient, repository);
  await processor.process(fakeJob(resumeId, name));
}

async function createReadyBase(experienceId: string, evidenceIds: string[]): Promise<string> {
  aiComplete.mockImplementation(async (...input: unknown[]) => {
    const req = input[0] as { promptName?: string; payload: { evidences?: Array<{ id: string }> } };
    if (req.promptName === 'synthesize-section' || req.payload.evidences === undefined) {
      return { bullets: [] };
    }
    return { bullets: req.payload.evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Base bullet ${evidence.id.slice(0, 8)}` })) };
  });
  const response = await request(app.getHttpServer())
    .post('/base-resumes')
    .send({ name: 'Base', language: 'en', sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }] })
    .expect(202);
  await runProcessor(response.body.id as string);
  return response.body.id as string;
}

async function createTailoredWithPlan(baseId: string, evidenceIds: { added: string[]; removed: string[] }): Promise<{ tailoredId: string; jobId: string }> {
  const [job] = await db
    .insert(jobDescriptions)
    .values({ userId: LOCAL_USER_ID, rawText: 'Hiring engineers', language: 'en' })
    .returning();
  const [requirement] = await db
    .insert(requirements)
    .values({
      jobDescriptionId: job!.id,
      literalTerm: 'Leadership',
      concept: 'Leadership',
      normalizedConcept: 'leadership',
      kind: 'mandatory',
      ordinal: 0,
    })
    .returning();
  aiComplete.mockImplementation(async (...input: unknown[]) => {
    const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
    if (req.promptName === 'plan-adaptation') {
      return {
        allocations: [{ sectionKind: 'experience', evidenceIds: evidenceIds.added }],
        coverages: [{ requirementId: requirement!.id, coverage: 'covered', evidenceId: evidenceIds.added[0] ?? null, gapKind: null }],
      };
    }
    if (req.promptName === 'draft-suggestions') {
      return { suggestions: [] };
    }
    if (req.promptName === 'synthesize-section') {
      return { bullets: [] };
    }
    const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
    return { bullets: list.map((item) => ({ evidenceId: item.id, text: `Tailored bullet ${item.id.slice(0, 8)}` })) };
  });
  const createResponse = await request(app.getHttpServer())
    .post('/tailored-resumes')
    .send({ baseResumeId: baseId, jobDescriptionId: job!.id })
    .expect(202);
  const tailoredId = createResponse.body.id as string;
  await runProcessor(tailoredId, 'tailor');
  return { tailoredId, jobId: job!.id };
}

function allBulletsOf(document: {
  sections: Array<{
    entries: Array<{
      id: string;
      bullets: Array<{
        id: string;
        ordinal: number;
        text: string;
        evidenceId: string | null;
        editedByPerson?: boolean;
        needsReview?: boolean;
      }>;
    }>;
  }>;
}) {
  return document.sections.flatMap((section) =>
    section.entries.flatMap((entry) => entry.bullets.map((bullet) => ({ ...bullet, entryId: entry.id })) as Array<{
      id: string;
      ordinal: number;
      text: string;
      evidenceId: string | null;
      editedByPerson?: boolean;
      needsReview?: boolean;
      entryId: string;
    }>),
  );
}

beforeAll(async () => {
  process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  });
  process.env.DATABASE_URL = urlWithDatabase(`/${TEST_DATABASE}`);
  process.env.REDIS_URL = TEST_REDIS_URL;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  queueRedis = new Redis(TEST_REDIS_URL);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_CLIENT)
    .useValue({ complete: aiComplete } as unknown as AiClient)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
}, 120_000);

afterEach(() => {
  aiComplete.mockClear();
  aiComplete.mockImplementation(async () => ({ bullets: [] }));
});

beforeEach(async () => {
  await queueRedis.flushdb();
  await resetDatabase(pool);
});

afterAll(async () => {
  await app.close();
  await queueRedis.quit();
  await pool.end();
  await withAdminClient((client) => client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`));
});

describe('POST /resumes/:resumeId/adaptation-review', () => {
  it('should reject, undo, restore and undo via HTTP while keeping the base intact', async () => {
    const { experienceId, evidenceA, evidenceB, evidenceC } = await createCareerWithThreeEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const baseBefore = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const baseHash = JSON.stringify(baseBefore.body.sections);
    const { tailoredId } = await createTailoredWithPlan(baseId, { added: [evidenceB, evidenceC], removed: [evidenceA] });
    const tailoredBefore = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const addedIds = tailoredBefore.body.adaptationChanges.addedEvidences.map((item: { id: string }) => item.id);
    expect(addedIds).toContain(evidenceC);
    const removedIds = tailoredBefore.body.adaptationChanges.removedEvidences.map((item: { id: string }) => item.id);
    expect(removedIds).toContain(evidenceA);

    const bulletsBefore = allBulletsOf(tailoredBefore.body);
    const targetAdded = bulletsBefore.find((bullet) => bullet.evidenceId === evidenceC);
    expect(targetAdded).toBeDefined();
    const rejectedOrdinal = targetAdded!.ordinal;
    const rejectedText = targetAdded!.text;

    const rejected = await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: evidenceC, decision: 'rejected' })
      .expect(200);
    const rejectedDoc = resumeDocumentResponseSchema.parse(rejected.body);
    expect(rejectedDoc.adaptationReview[evidenceC]).toBe('rejected');
    const afterReject = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(allBulletsOf(afterReject.body).some((bullet) => bullet.evidenceId === evidenceC)).toBe(false);
    expect(afterReject.body.adaptationChanges.addedEvidences.map((item: { id: string }) => item.id)).toContain(evidenceC);

    const undoneReject = await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review/undo`)
      .send({ evidenceId: evidenceC })
      .expect(200);
    const undoneDoc = resumeDocumentResponseSchema.parse(undoneReject.body);
    expect(undoneDoc.adaptationReview[evidenceC]).toBeUndefined();
    const afterUndoReject = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const restoredBullet = allBulletsOf(afterUndoReject.body).find((bullet) => bullet.evidenceId === evidenceC);
    expect(restoredBullet).toBeDefined();
    expect(restoredBullet!.text).toBe(rejectedText);
    expect(restoredBullet!.ordinal).toBe(rejectedOrdinal);

    const restored = await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: evidenceA, decision: 'restored' })
      .expect(200);
    const restoredDoc = resumeDocumentResponseSchema.parse(restored.body);
    expect(restoredDoc.adaptationReview[evidenceA]).toBe('restored');
    const afterRestore = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(afterRestore.body.adaptationChanges.removedEvidences.map((item: { id: string }) => item.id)).not.toContain(evidenceA);
    expect(allBulletsOf(afterRestore.body).some((bullet) => bullet.evidenceId === evidenceA)).toBe(true);

    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review/undo`)
      .send({ evidenceId: evidenceA })
      .expect(200);
    const afterUndoRestore = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(allBulletsOf(afterUndoRestore.body).some((bullet) => bullet.evidenceId === evidenceA)).toBe(false);
    expect(afterUndoRestore.body.adaptationChanges.removedEvidences.map((item: { id: string }) => item.id)).toContain(evidenceA);

    const evidencesRows = await db.select().from(evidences);
    expect(evidencesRows).toHaveLength(3);
    const baseAfter = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    expect(JSON.stringify(baseAfter.body.sections)).toBe(baseHash);
    const remainingBullets = await db.select().from(resumeBullets);
    expect(remainingBullets.length).toBeGreaterThan(0);
  });

  it('should answer 400 for a malformed body, 404 for unknown ids and 422 for invalid decisions', async () => {
    const { experienceId, evidenceA, evidenceB, evidenceC } = await createCareerWithThreeEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const { tailoredId } = await createTailoredWithPlan(baseId, { added: [evidenceB, evidenceC], removed: [evidenceA] });

    await request(app.getHttpServer()).post(`/resumes/${tailoredId}/adaptation-review`).send({ decision: 'rejected' }).expect(400);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: 'not-a-uuid', decision: 'rejected' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: evidenceC, decision: 'ignored' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/resumes/${randomUUID()}/adaptation-review`)
      .send({ evidenceId: evidenceC, decision: 'rejected' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: randomUUID(), decision: 'rejected' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: evidenceA, decision: 'rejected' })
      .expect(422);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: evidenceC, decision: 'restored' })
      .expect(422);
    await request(app.getHttpServer())
      .post(`/resumes/${baseId}/adaptation-review`)
      .send({ evidenceId: evidenceA, decision: 'accepted' })
      .expect(422);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review/undo`)
      .send({ evidenceId: evidenceC })
      .expect(422);
  });

  it('should answer 422 when the tailored resume is still generating', async () => {
    const { experienceId, evidenceA, evidenceB } = await createCareerWithThreeEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    aiComplete.mockImplementation(async () => ({ bullets: [] }));
    const [job] = await db
      .insert(jobDescriptions)
      .values({ userId: LOCAL_USER_ID, rawText: 'Hiring', language: 'en' })
      .returning();
    const creating = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseId, jobDescriptionId: job!.id })
      .expect(202);
    await request(app.getHttpServer())
      .post(`/resumes/${creating.body.id}/adaptation-review`)
      .send({ evidenceId: evidenceA, decision: 'accepted' })
      .expect(422);
  });

  it('should not overwrite an invalid review record and keep reading', async () => {
    const { experienceId, evidenceA, evidenceB, evidenceC } = await createCareerWithThreeEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const { tailoredId } = await createTailoredWithPlan(baseId, { added: [evidenceB, evidenceC], removed: [evidenceA] });
    const invalid = { x: 1 };
    await db.update(resumes).set({ adaptationReview: invalid }).where(eq(resumes.id, tailoredId));
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: evidenceC, decision: 'rejected' })
      .expect(500);
    const [afterDecide] = await db.select({ review: resumes.adaptationReview }).from(resumes).where(eq(resumes.id, tailoredId));
    expect(afterDecide?.review).toEqual(invalid);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review/undo`)
      .send({ evidenceId: evidenceC })
      .expect(500);
    const [afterUndo] = await db.select({ review: resumes.adaptationReview }).from(resumes).where(eq(resumes.id, tailoredId));
    expect(afterUndo?.review).toEqual(invalid);
    await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
  });

  it('should restore editedByPerson and needsReview on undo and read old snapshots', async () => {
    const { experienceId, evidenceA, evidenceB, evidenceC } = await createCareerWithThreeEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const { tailoredId } = await createTailoredWithPlan(baseId, { added: [evidenceB, evidenceC], removed: [evidenceA] });
    const before = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const target = allBulletsOf(before.body).find((bullet) => bullet.evidenceId === evidenceC);
    expect(target).toBeDefined();
    await db.update(resumeBullets).set({ editedByPerson: true, needsReview: true }).where(eq(resumeBullets.id, target!.id));
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review`)
      .send({ evidenceId: evidenceC, decision: 'rejected' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review/undo`)
      .send({ evidenceId: evidenceC })
      .expect(200);
    const afterUndo = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const restored = allBulletsOf(afterUndo.body).find((bullet) => bullet.evidenceId === evidenceC);
    expect(restored?.editedByPerson).toBe(true);
    expect(restored?.needsReview).toBe(true);
    const legacySnapshot = [
      { entryId: restored!.entryId, ordinal: restored!.ordinal, text: restored!.text, bulletId: restored!.id },
    ];
    await db.delete(resumeBullets).where(eq(resumeBullets.id, restored!.id));
    await db
      .update(resumes)
      .set({
        adaptationReview: {
          [evidenceC]: { decision: 'rejected', decidedAt: new Date().toISOString(), snapshot: legacySnapshot },
        },
      })
      .where(eq(resumes.id, tailoredId));
    await request(app.getHttpServer())
      .post(`/resumes/${tailoredId}/adaptation-review/undo`)
      .send({ evidenceId: evidenceC })
      .expect(200);
    const afterLegacyUndo = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const legacyRestored = allBulletsOf(afterLegacyUndo.body).find((bullet) => bullet.evidenceId === evidenceC);
    expect(legacyRestored?.editedByPerson).toBe(false);
    expect(legacyRestored?.needsReview).toBe(false);
  });
});
