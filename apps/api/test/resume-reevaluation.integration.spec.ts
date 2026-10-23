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
  evaluations,
  evidences,
  jobDescriptions,
  requirementCoverages,
  requirements,
  resumeBullets,
  resumeEntries,
  resumeSectionSkills,
  resumeSections,
  resumeSkillProposals,
  resumes,
  skills,
} from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import type { Database } from '../src/modules/database/database.provider';
import { EvaluationProcessor } from '../src/modules/evaluation/evaluation.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_resume_reevaluation_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/6';

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
  coverages: [],
}));

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

function singleRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected exactly one row');
  }
  return row;
}

async function createJobWithRequirements(): Promise<{ jobId: string; kubernetesId: string; typescriptId: string }> {
  const job = singleRow(
    await db
      .insert(jobDescriptions)
      .values({ userId: LOCAL_USER_ID, rawText: 'Hiring backend engineers', language: 'en' })
      .returning(),
  );
  const rows = await db
    .insert(requirements)
    .values([
      {
        jobDescriptionId: job.id,
        literalTerm: 'Kubernetes',
        concept: 'Container orchestration',
        normalizedConcept: 'kubernetes',
        kind: 'mandatory',
        ordinal: 0,
      },
      {
        jobDescriptionId: job.id,
        literalTerm: 'TypeScript',
        concept: 'TypeScript programming',
        normalizedConcept: 'typescript',
        kind: 'desirable',
        ordinal: 1,
      },
    ])
    .returning();
  return { jobId: job.id, kubernetesId: rows[0]!.id, typescriptId: rows[1]!.id };
}

async function createProfileWithEvidence(statement: string): Promise<{ profileId: string; evidenceId: string }> {
  const profile = singleRow(await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning());
  const evidence = singleRow(
    await db.insert(evidences).values({ careerProfileId: profile.id, statement }).returning(),
  );
  return { profileId: profile.id, evidenceId: evidence.id };
}

async function createBaseResume(): Promise<string> {
  const base = singleRow(
    await db
      .insert(resumes)
      .values({
        userId: LOCAL_USER_ID,
        kind: 'base',
        name: 'Base',
        language: 'en',
        template: 'comfortable',
        lengthTarget: 1,
        writingMethod: 'xyz',
        tone: 'direct',
        generationStatus: 'ready',
      })
      .returning(),
  );
  return base.id;
}

async function createTailoredResumeWithDocument(input: {
  baseId: string;
  jobId: string;
  profileId: string;
}): Promise<{ resumeId: string; skillNames: string[]; bulletTexts: string[] }> {
  const tailored = singleRow(
    await db
      .insert(resumes)
      .values({
        userId: LOCAL_USER_ID,
        kind: 'tailored',
        name: 'Tailored',
        language: 'en',
        template: 'comfortable',
        lengthTarget: 1,
        writingMethod: 'xyz',
        tone: 'direct',
        baseResumeId: input.baseId,
        jobDescriptionId: input.jobId,
        generationStatus: 'ready',
      })
      .returning(),
  );
  const experienceSection = singleRow(
    await db.insert(resumeSections).values({ resumeId: tailored.id, kind: 'experience', ordinal: 0 }).returning(),
  );
  const experienceEntry = singleRow(
    await db.insert(resumeEntries).values({ sectionId: experienceSection.id, ordinal: 0 }).returning(),
  );
  const bulletTexts = ['Built TypeScript APIs with Node', 'Summary: backend developer focused on delivery'];
  for (let index = 0; index < bulletTexts.length; index += 1) {
    await db.insert(resumeBullets).values({
      entryId: experienceEntry.id,
      ordinal: index,
      text: bulletTexts[index]!,
      status: 'assumed',
    });
  }
  await db.insert(resumeBullets).values({
    entryId: experienceEntry.id,
    ordinal: bulletTexts.length,
    text: 'Pending suggestion that never reaches the PDF',
    status: 'suggestion',
  });
  const skillA = singleRow(
    await db.insert(skills).values({ careerProfileId: input.profileId, name: 'TypeScript' }).returning(),
  );
  const skillSection = singleRow(
    await db.insert(resumeSections).values({ resumeId: tailored.id, kind: 'skills', ordinal: 1 }).returning(),
  );
  await db.insert(resumeSectionSkills).values({ sectionId: skillSection.id, skillId: skillA.id, ordinal: 0 });
  const proposal = singleRow(
    await db
      .insert(resumeSkillProposals)
      .values({ sectionId: skillSection.id, kind: 'addition', name: 'Docker', status: 'accepted', ordinal: 1 })
      .returning(),
  );
  void proposal;
  return { resumeId: tailored.id, skillNames: ['TypeScript', 'Docker'], bulletTexts };
}

async function createBaselineEvaluation(input: {
  jobId: string;
  profileId: string;
  kubernetesId: string;
  typescriptId: string;
  evidenceId: string;
}): Promise<string> {
  const row = singleRow(
    await db
      .insert(evaluations)
      .values({
        userId: LOCAL_USER_ID,
        jobDescriptionId: input.jobId,
        careerProfileId: input.profileId,
        status: 'ready',
        matchScore: 75,
      })
      .returning(),
  );
  await db.insert(requirementCoverages).values([
    {
      evaluationId: row.id,
      requirementId: input.kubernetesId,
      coverage: 'covered',
      evidenceId: input.evidenceId,
      rationale: 'Strong Kubernetes experience',
    },
    {
      evaluationId: row.id,
      requirementId: input.typescriptId,
      coverage: 'gap',
      evidenceId: null,
      rationale: 'No TypeScript experience',
    },
  ]);
  return row.id;
}

function fakeJob(evaluationId: string, jobId: string, profileId: string, resumeId: string): never {
  return {
    data: { evaluationId, userId: LOCAL_USER_ID, jobDescriptionId: jobId, careerProfileId: profileId, resumeId },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateProgress: async () => undefined,
  } as never;
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
  await withAdminClient((client) => client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`));
});

describe('POST /resumes/:resumeId/evaluations', () => {
  it('should create an evaluation linked to the tailored resume', async () => {
    const job = await createJobWithRequirements();
    const profile = await createProfileWithEvidence('Evidence only statement XYZ');
    const baseId = await createBaseResume();
    const tailored = await createTailoredResumeWithDocument({ baseId, jobId: job.jobId, profileId: profile.profileId });
    const response = await request(app.getHttpServer()).post(`/resumes/${tailored.resumeId}/evaluations`).expect(202);
    expect(response.body.id).toBeDefined();
    expect(response.body.status).toBe('queued');
    expect(response.body.resumeId).toBe(tailored.resumeId);
    const rows = await db.select().from(evaluations).where(eq(evaluations.resumeId, tailored.resumeId));
    expect(rows).toHaveLength(1);
  });
  it('should return 422 for a base resume', async () => {
    const baseId = await createBaseResume();
    await request(app.getHttpServer()).post(`/resumes/${baseId}/evaluations`).expect(422);
  });
  it('should return 404 for a missing resume', async () => {
    await request(app.getHttpServer())
      .post('/resumes/11111111-1111-4111-8111-111111111111/evaluations')
      .expect(404);
  });
  it('should return 404 for an invalid resume id', async () => {
    await request(app.getHttpServer()).post('/resumes/not-a-uuid/evaluations').expect(404);
  });
  it('should return 404 for a resume owned by someone else', async () => {
    const otherId = '22222222-2222-4222-8222-222222222222';
    await db.insert(schema.users).values({ id: otherId });
    const job = singleRow(
      await db
        .insert(jobDescriptions)
        .values({ userId: otherId, rawText: 'Other job', language: 'en' })
        .returning(),
    );
    const otherResume = singleRow(
      await db
        .insert(resumes)
        .values({
          userId: otherId,
          kind: 'tailored',
          name: 'Other tailored',
          language: 'en',
          template: 'comfortable',
          lengthTarget: 1,
          writingMethod: 'xyz',
          tone: 'direct',
          jobDescriptionId: job.id,
          generationStatus: 'ready',
        })
        .returning(),
    );
    await request(app.getHttpServer()).post(`/resumes/${otherResume.id}/evaluations`).expect(404);
  });
});

describe('processor uses the document text', () => {
  it('should send bullets, skills and summary instead of evidences', async () => {
    const job = await createJobWithRequirements();
    const profile = await createProfileWithEvidence('Evidence only statement XYZ');
    const baseId = await createBaseResume();
    const tailored = await createTailoredResumeWithDocument({ baseId, jobId: job.jobId, profileId: profile.profileId });
    let captured: { evidences: Array<{ statement: string }> } | null = null;
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const call = args[0] as { payload: { requirements: Array<{ id: string }>; evidences: Array<{ id: string; statement: string }> } };
      captured = { evidences: call.payload.evidences };
      return {
        coverages: call.payload.requirements.map((requirement) => ({
          requirementId: requirement.id,
          coverage: 'gap',
          evidenceId: null,
          rationale: 'No match in the document',
        })),
      };
    });
    const created = await request(app.getHttpServer()).post(`/resumes/${tailored.resumeId}/evaluations`).expect(202);
    const evaluationId = created.body.id as string;
    const processor = new EvaluationProcessor(db as unknown as Database, {
      complete: aiComplete,
    } as unknown as AiClient);
    await processor.process(fakeJob(evaluationId, job.jobId, profile.profileId, tailored.resumeId));
    expect(captured).not.toBeNull();
    const statements = (captured as unknown as { evidences: Array<{ statement: string }> }).evidences.map((item) => item.statement);
    for (const text of tailored.bulletTexts) {
      expect(statements).toContain(text);
    }
    for (const name of tailored.skillNames) {
      expect(statements).toContain(name);
    }
    expect(statements).not.toContain('Evidence only statement XYZ');
    expect(statements).not.toContain('Pending suggestion that never reaches the PDF');
  });
  it('should persist null evidence ids without downgrading coverage', async () => {
    const job = await createJobWithRequirements();
    const profile = await createProfileWithEvidence('Evidence only statement XYZ');
    const baseId = await createBaseResume();
    const tailored = await createTailoredResumeWithDocument({ baseId, jobId: job.jobId, profileId: profile.profileId });
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const call = args[0] as { payload: { requirements: Array<{ id: string }>; evidences: Array<{ id: string }> } };
      const [first, second] = call.payload.requirements;
      const [evidence] = call.payload.evidences;
      return {
        coverages: [
          { requirementId: first!.id, coverage: 'covered', evidenceId: evidence!.id, rationale: 'Document covers it' },
          { requirementId: second!.id, coverage: 'partial', evidenceId: evidence!.id, rationale: 'Document partly covers it' },
        ],
      };
    });
    const created = await request(app.getHttpServer()).post(`/resumes/${tailored.resumeId}/evaluations`).expect(202);
    const evaluationId = created.body.id as string;
    const processor = new EvaluationProcessor(db as unknown as Database, {
      complete: aiComplete,
    } as unknown as AiClient);
    await processor.process(fakeJob(evaluationId, job.jobId, profile.profileId, tailored.resumeId));
    const rows = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId));
    expect(singleRow(rows).status).toBe('ready');
    expect(singleRow(rows).matchScore).toBe(88);
    const coverages = await db.select().from(requirementCoverages).where(eq(requirementCoverages.evaluationId, evaluationId));
    expect(coverages).toHaveLength(2);
    for (const coverage of coverages) {
      expect(coverage.evidenceId).toBeNull();
    }
  });
});

describe('GET /resumes/:resumeId/evaluations/latest', () => {
  it('should return the reevaluation with baseline and improved', async () => {
    const job = await createJobWithRequirements();
    const profile = await createProfileWithEvidence('Managed Kubernetes clusters for 3 years');
    const baseId = await createBaseResume();
    const tailored = await createTailoredResumeWithDocument({ baseId, jobId: job.jobId, profileId: profile.profileId });
    await createBaselineEvaluation({
      jobId: job.jobId,
      profileId: profile.profileId,
      kubernetesId: job.kubernetesId,
      typescriptId: job.typescriptId,
      evidenceId: profile.evidenceId,
    });
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const call = args[0] as { payload: { requirements: Array<{ id: string }> } };
      const [first, second] = call.payload.requirements;
      return {
        coverages: [
          { requirementId: first!.id, coverage: 'covered', evidenceId: null, rationale: 'Still covered' },
          { requirementId: second!.id, coverage: 'covered', evidenceId: null, rationale: 'Document now covers TypeScript' },
        ],
      };
    });
    const created = await request(app.getHttpServer()).post(`/resumes/${tailored.resumeId}/evaluations`).expect(202);
    const evaluationId = created.body.id as string;
    const processor = new EvaluationProcessor(db as unknown as Database, {
      complete: aiComplete,
    } as unknown as AiClient);
    await processor.process(fakeJob(evaluationId, job.jobId, profile.profileId, tailored.resumeId));
    const response = await request(app.getHttpServer()).get(`/resumes/${tailored.resumeId}/evaluations/latest`).expect(200);
    expect(response.body.id).toBe(evaluationId);
    expect(response.body.resumeId).toBe(tailored.resumeId);
    expect(response.body.matchScore).toBe(100);
    expect(response.body.baseline.matchScore).toBe(75);
    expect(response.body.baseline.requirementCoverages).toHaveLength(2);
    const comparisons = response.body.comparisons as Array<{
      requirementId: string;
      literalTerm: string;
      kind: string;
      coverageBefore: string | null;
      coverageAfter: string;
      improved: boolean;
    }>;
    expect(comparisons).toHaveLength(2);
    const kubernetes = comparisons.find((item) => item.literalTerm === 'Kubernetes');
    const typescript = comparisons.find((item) => item.literalTerm === 'TypeScript');
    expect(kubernetes?.coverageBefore).toBe('covered');
    expect(kubernetes?.coverageAfter).toBe('covered');
    expect(kubernetes?.improved).toBe(false);
    expect(typescript?.coverageBefore).toBe('gap');
    expect(typescript?.coverageAfter).toBe('covered');
    expect(typescript?.improved).toBe(true);
    expect(typescript?.kind).toBe('desirable');
  });
  it('should return 404 when there is no reevaluation yet', async () => {
    const job = await createJobWithRequirements();
    const profile = await createProfileWithEvidence('Some evidence');
    const baseId = await createBaseResume();
    const tailored = await createTailoredResumeWithDocument({ baseId, jobId: job.jobId, profileId: profile.profileId });
    void profile;
    await request(app.getHttpServer()).get(`/resumes/${tailored.resumeId}/evaluations/latest`).expect(404);
  });
  it('should return 422 for a base resume', async () => {
    const baseId = await createBaseResume();
    await request(app.getHttpServer()).get(`/resumes/${baseId}/evaluations/latest`).expect(422);
  });
});
