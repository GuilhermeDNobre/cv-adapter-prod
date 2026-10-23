import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import {
  careerProfiles,
  deniedRequirements,
  evaluations,
  evidences,
  jobDescriptions,
  requirements,
  requirementCoverages,
} from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { UnrecoverableError } from 'bullmq';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyRejectedError,
  AiUnavailableError,
} from '../src/modules/ai/ai-errors';
import type { Database } from '../src/modules/database/database.provider';
import { EvaluationProcessor } from '../src/modules/evaluation/evaluation.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_evaluation_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/14';

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

const aiComplete = vi.fn(async (): Promise<{ coverages: Array<{ requirementId: string; coverage: string; evidenceId: string | null; rationale: string }> }> => ({
  coverages: [
    {
      requirementId: 'placeholder',
      coverage: 'covered',
      evidenceId: 'placeholder',
      rationale: 'Strong match',
    },
  ],
}));

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function createJobDescription(): Promise<string> {
  const [jd] = await db
    .insert(jobDescriptions)
    .values({
      userId: LOCAL_USER_ID,
      rawText: 'Looking for a Kubernetes expert',
      language: 'en',
    })
    .returning();
  await db.insert(requirements).values([
    {
      jobDescriptionId: jd!.id,
      literalTerm: 'Kubernetes',
      concept: 'Container orchestration',
      normalizedConcept: 'kubernetes',
      kind: 'mandatory',
      ordinal: 0,
    },
    {
      jobDescriptionId: jd!.id,
      literalTerm: 'TypeScript',
      concept: 'TypeScript programming',
      normalizedConcept: 'typescript',
      kind: 'desirable',
      ordinal: 1,
    },
  ]);
  return jd!.id;
}

async function createCareerProfile(): Promise<string> {
  const [cp] = await db
    .insert(careerProfiles)
    .values({ userId: LOCAL_USER_ID })
    .returning();
  return cp!.id;
}

async function createEvidence(careerProfileId: string, statement: string): Promise<string> {
  const [ev] = await db
    .insert(evidences)
    .values({ careerProfileId, statement })
    .returning();
  return ev!.id;
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
});

beforeEach(async () => {
  await queueRedis.flushdb();
  await resetDatabase(pool);
});

afterAll(async () => {
  await app.close();
  await queueRedis.quit();
  await pool.end();
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('POST /evaluations', () => {
  it('should return 202 with evaluation id when user has a career profile', async () => {
    await createCareerProfile();
    const jdId = await createJobDescription();

    const response = await request(app.getHttpServer())
      .post('/evaluations')
      .send({ jobDescriptionId: jdId })
      .expect(202);

    expect(response.body.id).toBeDefined();
    expect(response.body.status).toBe('queued');
  });

  it('should return 422 when user has no career profile', async () => {
    const jdId = await createJobDescription();

    const response = await request(app.getHttpServer())
      .post('/evaluations')
      .send({ jobDescriptionId: jdId })
      .expect(422);

    expect(response.body.message).toMatch(/Career Profile/);
  });

  it('should allow a user with career profile to evaluate a new job without re-importing (RF-27)', async () => {
    await createCareerProfile();
    const jdId1 = await createJobDescription();

    const response1 = await request(app.getHttpServer())
      .post('/evaluations')
      .send({ jobDescriptionId: jdId1 })
      .expect(202);

    expect(response1.body.id).toBeDefined();
    expect(response1.body.status).toBe('queued');
  });

  it('should accept a second evaluation for another job description', async () => {
    await createCareerProfile();
    const jdId1 = await createJobDescription();
    const jdId2 = await createJobDescription();

    await request(app.getHttpServer())
      .post('/evaluations')
      .send({ jobDescriptionId: jdId1 })
      .expect(202);

    await request(app.getHttpServer())
      .post('/evaluations')
      .send({ jobDescriptionId: jdId2 })
      .expect(202);

    const rows = await db
      .select()
      .from(evaluations)
      .where(eq(evaluations.userId, LOCAL_USER_ID));
    expect(rows).toHaveLength(2);
  });
});

describe('GET /evaluations/:evaluationId', () => {
  it('should return evaluation state for the owner', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();
    const evidenceId = await createEvidence(cpId, 'Managed Kubernetes clusters for 3 years');

    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as { payload: { requirements: Array<{ id: string }> } };
      const reqs = request.payload.requirements;
      return {
        coverages: reqs.map((r: { id: string }, i: number) => ({
          requirementId: r.id,
          coverage: i === 0 ? ('covered' as const) : ('gap' as const),
          evidenceId: i === 0 ? evidenceId : null,
          rationale: i === 0 ? 'Strong Kubernetes experience' : 'No TypeScript experience',
        })),
      };
    });

    const createResponse = await request(app.getHttpServer())
      .post('/evaluations')
      .send({ jobDescriptionId: jdId })
      .expect(202);

    const getResponse = await request(app.getHttpServer())
      .get(`/evaluations/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body.id).toBe(createResponse.body.id);
    expect(getResponse.body.status).toBeDefined();
  });

  it('should return the statement of the Evidence behind each covered requirement (RF-23)', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();
    const statement = 'Managed Kubernetes clusters for 3 years';
    const evidenceId = await createEvidence(cpId, statement);

    const [evalRow] = await db
      .insert(evaluations)
      .values({
        userId: LOCAL_USER_ID,
        jobDescriptionId: jdId,
        careerProfileId: cpId,
        status: 'ready',
        matchScore: 75,
      })
      .returning();
    const reqRows = await db
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, jdId));
    await db.insert(requirementCoverages).values(
      reqRows.map((r, i) => ({
        evaluationId: evalRow!.id,
        requirementId: r.id,
        coverage: (i === 0 ? 'covered' : 'gap') as 'covered' | 'gap',
        evidenceId: i === 0 ? evidenceId : null,
        rationale: i === 0 ? 'Strong Kubernetes experience' : 'No TypeScript experience',
      })),
    );

    const getResponse = await request(app.getHttpServer())
      .get(`/evaluations/${evalRow!.id}`)
      .expect(200);

    const covered = getResponse.body.requirementCoverages.find(
      (c: { coverage: string }) => c.coverage === 'covered',
    );
    const gap = getResponse.body.requirementCoverages.find(
      (c: { coverage: string }) => c.coverage === 'gap',
    );
    expect(covered.evidenceId).toBe(evidenceId);
    expect(covered.evidenceStatement).toBe(statement);
    expect(gap.evidenceStatement).toBeNull();
  });

  it('should return failureReason ai_key_rejected for an evaluation that failed with a rejected key', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();

    const [evalRow] = await db
      .insert(evaluations)
      .values({
        userId: LOCAL_USER_ID,
        jobDescriptionId: jdId,
        careerProfileId: cpId,
        status: 'failed',
        matchScore: null,
        failureReason: 'ai_key_rejected',
      })
      .returning();

    const getResponse = await request(app.getHttpServer())
      .get(`/evaluations/${evalRow!.id}`)
      .expect(200);

    expect(getResponse.body.failureReason).toBe('ai_key_rejected');
  });

  it('should return 404 for a non-existent evaluation', async () => {
    await request(app.getHttpServer())
      .get('/evaluations/11111111-1111-4111-8111-111111111111')
      .expect(404);
  });
});

describe('POST /evaluations/:evaluationId/deny-gap', () => {
  async function createEvaluationWithCoverages(
    careerProfileId: string,
    jobDescriptionId: string,
    options: { gapIndex?: number } = {},
  ): Promise<{ evalId: string; gapRequirementId: string }> {
    const gapIndex = options.gapIndex ?? 1;
    const [evalRow] = await db
      .insert(evaluations)
      .values({
        userId: LOCAL_USER_ID,
        jobDescriptionId,
        careerProfileId,
        status: 'ready',
        matchScore: 50,
      })
      .returning();

    const reqRows = await db
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, jobDescriptionId));

    const coverageValues = reqRows.map((r, i) => ({
      evaluationId: evalRow!.id,
      requirementId: r.id,
      coverage: (i === gapIndex ? 'gap' : 'covered') as 'covered' | 'gap',
      evidenceId: null as string | null,
      rationale: i === gapIndex ? 'No experience' : 'Strong experience',
    }));
    await db.insert(requirementCoverages).values(coverageValues);

    const gapReq = reqRows[gapIndex]!;
    return { evalId: evalRow!.id, gapRequirementId: gapReq.id };
  }

  it('should deny a gap and return the normalized concept', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();

    const { evalId, gapRequirementId } = await createEvaluationWithCoverages(cpId, jdId);

    const denyResponse = await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/deny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    expect(denyResponse.body.denied).toBe(true);
    expect(denyResponse.body.normalizedConcept).toBe('typescript');
  });

  it('should not change match_score after denying a gap (RF-25)', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();

    const { evalId, gapRequirementId } = await createEvaluationWithCoverages(cpId, jdId);

    const beforeDeny = await request(app.getHttpServer())
      .get(`/evaluations/${evalId}`)
      .expect(200);

    const scoreBefore = beforeDeny.body.matchScore;

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/deny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    const afterDeny = await request(app.getHttpServer())
      .get(`/evaluations/${evalId}`)
      .expect(200);

    expect(afterDeny.body.matchScore).toBe(scoreBefore);

    const gapCoverage = afterDeny.body.requirementCoverages.find(
      (c: { coverage: string }) => c.coverage === 'gap',
    );
    expect(gapCoverage).toBeDefined();
    expect(gapCoverage.denied).toBe(true);
  });

  it('should be idempotent when denying the same concept twice', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();

    const { evalId, gapRequirementId } = await createEvaluationWithCoverages(cpId, jdId);

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/deny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/deny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    const deniedRows = await db
      .select()
      .from(deniedRequirements)
      .where(eq(deniedRequirements.careerProfileId, cpId));
    expect(deniedRows.length).toBe(1);
  });

  it('should deny "Kubernetes" in one job and show as denied in another job requesting "kubernetes" (concept-based key)', async () => {
    const cpId = await createCareerProfile();
    const jdId1 = await createJobDescription();

    const { evalId: evalId1, gapRequirementId: gapReqId1 } =
      await createEvaluationWithCoverages(cpId, jdId1, { gapIndex: 0 });

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId1}/deny-gap`)
      .send({ requirementId: gapReqId1 })
      .expect(200);

    const [jd2] = await db
      .insert(jobDescriptions)
      .values({ userId: LOCAL_USER_ID, rawText: 'Looking for kubernetes expert', language: 'en' })
      .returning();
    await db.insert(requirements).values({
      jobDescriptionId: jd2!.id,
      literalTerm: 'kubernetes',
      concept: 'Container orchestration',
      normalizedConcept: 'kubernetes',
      kind: 'mandatory',
      ordinal: 0,
    });

    const [eval2] = await db
      .insert(evaluations)
      .values({
        userId: LOCAL_USER_ID,
        jobDescriptionId: jd2!.id,
        careerProfileId: cpId,
        status: 'ready',
        matchScore: 0,
      })
      .returning();

    const [req2] = await db
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, jd2!.id));

    await db.insert(requirementCoverages).values({
      evaluationId: eval2!.id,
      requirementId: req2!.id,
      coverage: 'gap',
      evidenceId: null,
      rationale: 'No kubernetes experience',
    });

    const getResponse2 = await request(app.getHttpServer())
      .get(`/evaluations/${eval2!.id}`)
      .expect(200);

    const kubernetesCoverage = getResponse2.body.requirementCoverages.find(
      (c: { concept: string }) => c.concept === 'Container orchestration',
    );
    expect(kubernetesCoverage).toBeDefined();
    expect(kubernetesCoverage.denied).toBe(true);
  });
});

describe('POST /evaluations/:evaluationId/undeny-gap', () => {
  async function createEvaluationWithCoverages(
    careerProfileId: string,
    jobDescriptionId: string,
    options: { gapIndex?: number } = {},
  ): Promise<{ evalId: string; gapRequirementId: string }> {
    const gapIndex = options.gapIndex ?? 1;
    const [evalRow] = await db
      .insert(evaluations)
      .values({
        userId: LOCAL_USER_ID,
        jobDescriptionId,
        careerProfileId,
        status: 'ready',
        matchScore: 50,
      })
      .returning();

    const reqRows = await db
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, jobDescriptionId));

    const coverageValues = reqRows.map((r, i) => ({
      evaluationId: evalRow!.id,
      requirementId: r.id,
      coverage: (i === gapIndex ? 'gap' : 'covered') as 'covered' | 'gap',
      evidenceId: null as string | null,
      rationale: i === gapIndex ? 'No experience' : 'Strong experience',
    }));
    await db.insert(requirementCoverages).values(coverageValues);

    const gapReq = reqRows[gapIndex]!;
    return { evalId: evalRow!.id, gapRequirementId: gapReq.id };
  }

  it('should undeny a denied gap and return the updated evaluation with the gap open', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();

    const { evalId, gapRequirementId } = await createEvaluationWithCoverages(cpId, jdId);

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/deny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    const undenyResponse = await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/undeny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    expect(undenyResponse.body.id).toBe(evalId);
    expect(undenyResponse.body.matchScore).toBe(50);
    const gapCoverage = undenyResponse.body.requirementCoverages.find(
      (c: { requirementId: string }) => c.requirementId === gapRequirementId,
    );
    expect(gapCoverage).toBeDefined();
    expect(gapCoverage.coverage).toBe('gap');
    expect(gapCoverage.denied).toBe(false);
  });

  it('should be idempotent when the gap was not denied', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();

    const { evalId, gapRequirementId } = await createEvaluationWithCoverages(cpId, jdId);

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/undeny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/undeny-gap`)
      .send({ requirementId: gapRequirementId })
      .expect(200);

    const getResponse = await request(app.getHttpServer())
      .get(`/evaluations/${evalId}`)
      .expect(200);
    const gapCoverage = getResponse.body.requirementCoverages.find(
      (c: { requirementId: string }) => c.requirementId === gapRequirementId,
    );
    expect(gapCoverage.denied).toBe(false);
  });

  it('should return 404 when the evaluation does not exist', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();
    const reqRows = await db
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, jdId));
    void cpId;

    await request(app.getHttpServer())
      .post('/evaluations/11111111-1111-4111-8111-111111111111/undeny-gap')
      .send({ requirementId: reqRows[0]!.id })
      .expect(404);
  });

  it('should return 400 when the requirement id is invalid', async () => {
    const cpId = await createCareerProfile();
    const jdId = await createJobDescription();

    const { evalId } = await createEvaluationWithCoverages(cpId, jdId);

    await request(app.getHttpServer())
      .post(`/evaluations/${evalId}/undeny-gap`)
      .send({ requirementId: 'not-a-uuid' })
      .expect(400);
  });
});

describe('EvaluationProcessor failure policy', () => {
  function fakeJob(evaluationId: string, jobDescriptionId: string, careerProfileId: string, attemptsMade: number) {
    return {
      data: { evaluationId, userId: LOCAL_USER_ID, jobDescriptionId, careerProfileId },
      attemptsMade,
      opts: { attempts: 3 },
      updateProgress: async () => undefined,
    } as never;
  }

  async function createQueuedEvaluation(): Promise<{ evaluationId: string; jobDescriptionId: string; careerProfileId: string }> {
    const jobDescriptionId = await createJobDescription();
    const careerProfileId = await createCareerProfile();
    const [row] = await db
      .insert(evaluations)
      .values({ userId: LOCAL_USER_ID, jobDescriptionId, careerProfileId, status: 'queued' })
      .returning({ id: evaluations.id });
    return { evaluationId: row!.id, jobDescriptionId, careerProfileId };
  }

  async function readEvaluation(id: string) {
    const [row] = await db.select().from(evaluations).where(eq(evaluations.id, id));
    return row;
  }

  it('should mark ai_key_rejected without retry when the key is rejected', async () => {
    const { evaluationId, jobDescriptionId, careerProfileId } = await createQueuedEvaluation();
    const processor = new EvaluationProcessor(db as unknown as Database, {
      complete: async () => { throw new AiKeyRejectedError(); },
    } as unknown as AiClient);

    await expect(
      processor.process(fakeJob(evaluationId, jobDescriptionId, careerProfileId, 0)),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const row = await readEvaluation(evaluationId);
    expect(row?.status).toBe('failed');
    expect(row?.failureReason).toBe('ai_key_rejected');
  });

  it('should mark ai_balance_exhausted without retry when the balance is gone', async () => {
    const { evaluationId, jobDescriptionId, careerProfileId } = await createQueuedEvaluation();
    const processor = new EvaluationProcessor(db as unknown as Database, {
      complete: async () => { throw new AiBalanceExhaustedError(); },
    } as unknown as AiClient);

    await expect(
      processor.process(fakeJob(evaluationId, jobDescriptionId, careerProfileId, 0)),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const row = await readEvaluation(evaluationId);
    expect(row?.status).toBe('failed');
    expect(row?.failureReason).toBe('ai_balance_exhausted');
  });

  it('should keep the evaluation queued on the first transient failure and mark ai_unavailable on the last', async () => {
    const jobDescriptionId = await createJobDescription();
    const careerProfileId = await createCareerProfile();
    async function createQueuedEvaluationOnSameProfile(): Promise<string> {
      const [row] = await db
        .insert(evaluations)
        .values({ userId: LOCAL_USER_ID, jobDescriptionId, careerProfileId, status: 'queued' })
        .returning({ id: evaluations.id });
      return row!.id;
    }
    const firstEvaluationId = await createQueuedEvaluationOnSameProfile();
    const firstProcessor = new EvaluationProcessor(db as unknown as Database, {
      complete: async () => { throw new AiUnavailableError(503); },
    } as unknown as AiClient);

    await expect(
      firstProcessor.process(fakeJob(firstEvaluationId, jobDescriptionId, careerProfileId, 0)),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    const firstRow = await readEvaluation(firstEvaluationId);
    expect(firstRow?.status).toBe('queued');

    const lastEvaluationId = await createQueuedEvaluationOnSameProfile();
    const lastProcessor = new EvaluationProcessor(db as unknown as Database, {
      complete: async () => { throw new AiUnavailableError(503); },
    } as unknown as AiClient);

    await expect(
      lastProcessor.process(fakeJob(lastEvaluationId, jobDescriptionId, careerProfileId, 2)),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    const lastRow = await readEvaluation(lastEvaluationId);
    expect(lastRow?.status).toBe('failed');
    expect(lastRow?.failureReason).toBe('ai_unavailable');
  });
});
