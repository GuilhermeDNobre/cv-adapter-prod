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
  educationEntries,
  evaluations,
  evidences,
  experiences,
  jobDescriptions,
  requirementCoverages,
  requirements,
  resumeBullets,
  resumes,
} from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { resumeDocumentResponseSchema } from 'schema/contracts/resume';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import { AiUnavailableError } from '../src/modules/ai/ai-errors';
import { detectTextLanguage } from '../src/modules/resume/writing/language-detector';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeDocumentRepository } from '../src/modules/resume/resume-document.repository';
import { ResumeRepository } from '../src/modules/resume/resume.repository';
import { ResumeWritingProcessor } from '../src/modules/resume/writing/resume-writing.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_tailored_resume_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/13';

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

async function createCareerData(): Promise<{ experienceId: string; evidenceIds: string[] }> {
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
  return { experienceId: experience!.id, evidenceIds: [evidenceA!.id, evidenceB!.id] };
}

async function createJob(language: string, terms: Array<{ literalTerm: string; kind: 'mandatory' | 'desirable' }>): Promise<{ jobId: string; requirementIds: string[] }> {
  const [job] = await db
    .insert(jobDescriptions)
    .values({ userId: LOCAL_USER_ID, rawText: 'Hiring engineers', language })
    .returning();
  const rows = await db
    .insert(requirements)
    .values(
      terms.map((term, index) => ({
        jobDescriptionId: job!.id,
        literalTerm: term.literalTerm,
        concept: term.literalTerm,
        normalizedConcept: term.literalTerm.toLowerCase(),
        kind: term.kind,
        ordinal: index,
      })),
    )
    .returning();
  return { jobId: job!.id, requirementIds: rows.map((row) => row.id) };
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

async function runProcessor(resumeId: string, name?: string, attemptsMade = 0): Promise<void> {
  const repository = new ResumeRepository(db as unknown as Database, new ResumeDocumentRepository(db as unknown as Database));
  const processor = new ResumeWritingProcessor(db as unknown as Database, { complete: aiComplete } as unknown as AiClient, repository);
  await processor.process(fakeJob(resumeId, name, attemptsMade));
}

async function createReadyBase(sections: unknown[]): Promise<string> {
  aiComplete.mockImplementation(async (...input: unknown[]) => {
    const req = input[0] as { promptName?: string; payload: { evidences?: Array<{ id: string }> } };
    if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary') || req.payload.evidences === undefined) {
      return { bullets: [] };
    }
    return { bullets: req.payload.evidences.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
  });
  const response = await request(app.getHttpServer()).post('/base-resumes').send({ name: 'Base', language: 'en', sections }).expect(202);
  await runProcessor(response.body.id as string);
  return response.body.id as string;
}

async function createPortugueseBase(): Promise<{ baseId: string; evidenceIds: string[] }> {
  const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
  const [experience] = await db
    .insert(experiences)
    .values({ careerProfileId: profile!.id, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: '2023-01-01' })
    .returning();
  const [evidenceA] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Liderei uma equipe de cinco pessoas na empresa' })
    .returning();
  const [evidenceB] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Entreguei o novo fluxo de pagamento com a equipe' })
    .returning();
  const evidenceIds = [evidenceA!.id, evidenceB!.id];
  const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experience!.id], evidenceIds }]);
  await db.update(resumes).set({ language: 'pt' }).where(eq(resumes.id, baseId));
  return { baseId, evidenceIds };
}

function mockEnglishTailoring(evidenceIds: string[], requirementIds: string[]): void {
  aiComplete.mockImplementation(async (...input: unknown[]) => {
    const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
    if (req.promptName === 'plan-adaptation') {
      return {
        allocations: [{ sectionKind: 'experience', evidenceIds }],
        coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }],
      };
    }
    if (req.promptName === 'write-section') {
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led a team of engineers at the company' })) };
    }
    return { suggestions: [] };
  });
}

function collectBulletTexts(body: {
  sections: Array<{ entries: Array<{ bullets: Array<{ text: string }> }> }>;
}): string[] {
  return body.sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.text)));
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

describe('POST /tailored-resumes', () => {
  it('should generate a ready document in the job language with the job fixed', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }>; requirements?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }],
        };
      }
      if (req.promptName === 'write-section') {
        const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
        return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
      }
      return { suggestions: [] };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    const tailoredId = createResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(doc.body.generationStatus).toBe('ready');
    expect(doc.body.language).toBe('en');
    expect(doc.body.jobDescriptionId).toBe(jobId);
    expect(doc.body.baseResumeId).toBe(baseId);
  });

  it('should generate an English document from a Portuguese base when language en is requested', async () => {
    const { baseId, evidenceIds } = await createPortugueseBase();
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    mockEnglishTailoring(evidenceIds, requirementIds);
    const createResponse = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseId, jobDescriptionId: jobId, language: 'en' })
      .expect(202);
    const tailoredId = createResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(doc.body.generationStatus).toBe('ready');
    expect(doc.body.language).toBe('en');
    const texts = collectBulletTexts(doc.body);
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(detectTextLanguage(text)).not.toBe('pt');
    }
  });

  it('should fall back to the base resume language when no language is requested', async () => {
    const { baseId, evidenceIds } = await createPortugueseBase();
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    mockEnglishTailoring(evidenceIds, requirementIds);
    const createResponse = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseId, jobDescriptionId: jobId })
      .expect(202);
    const tailoredId = createResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(doc.body.generationStatus).toBe('ready');
    expect(doc.body.language).toBe('pt');
  });

  it('should never place the same evidence in two sections even when the AI repeats it', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([
      { kind: 'experience', experienceIds: [experienceId], evidenceIds },
      { kind: 'skills', evidenceIds: [] },
    ]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [
            { sectionKind: 'experience', evidenceIds },
            { sectionKind: 'skills', evidenceIds },
          ],
          coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }],
        };
      }
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    await runProcessor(createResponse.body.id as string, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    const bullets = doc.body.sections.flatMap((section: { entries: Array<{ bullets: Array<{ evidenceId: string }> }> }) =>
      section.entries.flatMap((entry) => entry.bullets),
    );
    const ids = bullets.map((bullet: { evidenceId: string }) => bullet.evidenceId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should turn a requirement without evidence into an unconfirmed suggestion', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [
      { literalTerm: 'Leadership', kind: 'mandatory' },
      { literalTerm: 'Kubernetes', kind: 'mandatory' },
    ]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: [
            { requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null },
            { requirementId: requirementIds[1]!, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
          ],
        };
      }
      if (req.promptName === 'draft-suggestions') {
        return { suggestions: [{ requirementId: requirementIds[1]!, gapKind: 'existence', question: 'Have you worked with Kubernetes?', draftBullet: 'Assisted migration to Kubernetes.' }] };
      }
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    await runProcessor(createResponse.body.id as string, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    const bullets = doc.body.sections.flatMap((section: { entries: Array<{ bullets: Array<{ status: string }> }> }) =>
      section.entries.flatMap((entry) => entry.bullets),
    );
    const suggestion = bullets.find((bullet: { status: string }) => bullet.status === 'suggestion');
    expect(suggestion).toBeDefined();
    expect(suggestion.suggestionQuestion).toContain('Kubernetes');
    expect(suggestion.requirementId).toBe(requirementIds[1]!);
  });

  it('should keep the tailored structure frozen when the base changes', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return { allocations: [{ sectionKind: 'experience', evidenceIds }], coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }] };
      }
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    const tailoredId = createResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const before = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    await request(app.getHttpServer()).post(`/resumes/${baseId}/sections`).send({ kind: 'custom', title: 'Extra', ordinal: 5, items: ['Talk'] }).expect(201);
    const after = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(after.body.sections).toHaveLength(before.body.sections.length);
  });

  it('should generate in english with fallback for a spanish job', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('es', [{ literalTerm: 'Liderazgo', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return { allocations: [{ sectionKind: 'experience', evidenceIds }], coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }] };
      }
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    await runProcessor(createResponse.body.id as string, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    expect(doc.body.language).toBe('en');
    expect(doc.body.languageFallback).toBe(true);
  });

  it('should return coherent coverage and match score', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [
      { literalTerm: 'Leadership', kind: 'mandatory' },
      { literalTerm: 'Elixir', kind: 'desirable' },
    ]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: [
            { requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null },
            { requirementId: requirementIds[1]!, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
          ],
        };
      }
      if (req.promptName === 'draft-suggestions') {
        return { suggestions: [{ requirementId: requirementIds[1]!, gapKind: 'existence', question: 'Have you used Elixir?', draftBullet: 'Explored Elixir side projects.' }] };
      }
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    await runProcessor(createResponse.body.id as string, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    expect(doc.body.matchScore).toBe(75);
    const covered = doc.body.requirementCoverages.find((item: { requirementId: string }) => item.requirementId === requirementIds[0]!);
    expect(covered.coverage).toBe('covered');
    expect(covered.bulletId).toBeDefined();
    const gap = doc.body.requirementCoverages.find((item: { requirementId: string }) => item.requirementId === requirementIds[1]!);
    expect(gap.coverage).toBe('gap');
    expect(gap.bulletId).toBeDefined();
  });

  it('should approve a suggestion into an evidence and deny another into the evaluation', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [
      { literalTerm: 'Leadership', kind: 'mandatory' },
      { literalTerm: 'Kubernetes', kind: 'mandatory' },
      { literalTerm: 'Elixir', kind: 'desirable' },
    ]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: [
            { requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null },
            { requirementId: requirementIds[1]!, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
            { requirementId: requirementIds[2]!, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
          ],
        };
      }
      if (req.promptName === 'draft-suggestions') {
        return {
          suggestions: [
            { requirementId: requirementIds[1]!, gapKind: 'existence', question: 'Have you used Kubernetes?', draftBullet: 'Assisted Kubernetes migration.' },
            { requirementId: requirementIds[2]!, gapKind: 'existence', question: 'Have you used Elixir?', draftBullet: 'Explored Elixir.' },
          ],
        };
      }
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    const tailoredId = createResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const bullets = doc.body.sections.flatMap((section: { entries: Array<{ bullets: Array<{ id: string; status: string; requirementId: string }> }> }) =>
      section.entries.flatMap((entry) => entry.bullets),
    );
    const toApprove = bullets.find((bullet: { requirementId: string }) => bullet.requirementId === requirementIds[1]!);
    const toDeny = bullets.find((bullet: { requirementId: string }) => bullet.requirementId === requirementIds[2]!);
    const approveResponse = await request(app.getHttpServer()).post(`/bullets/${toApprove.id}/approve`).expect(200);
    const approvedDoc = resumeDocumentResponseSchema.parse(approveResponse.body);
    const approved = approvedDoc.sections
      .flatMap((section) => section.entries.flatMap((entry) => entry.bullets))
      .find((bullet) => bullet.id === toApprove.id);
    expect(approved?.status).toBe('assumed');
    expect(approved?.evidenceId).toBeDefined();
    const denyResponse = await request(app.getHttpServer()).post(`/bullets/${toDeny.id}/deny`).expect(200);
    const deniedDoc = resumeDocumentResponseSchema.parse(denyResponse.body);
    const deniedLeft = deniedDoc.sections
      .flatMap((section) => section.entries.flatMap((entry) => entry.bullets))
      .find((bullet) => bullet.id === toDeny.id);
    expect(deniedLeft).toBeUndefined();
    const remaining = await db.select().from(resumeBullets).where(eq(resumeBullets.id, toDeny.id));
    expect(remaining).toHaveLength(0);
    const deniedRows = await db.select().from(deniedRequirements);
    expect(deniedRows.length).toBeGreaterThanOrEqual(1);
    const [profile] = await db.select().from(careerProfiles).where(eq(careerProfiles.userId, LOCAL_USER_ID));
    const [evaluation] = await db
      .insert(evaluations)
      .values({ userId: LOCAL_USER_ID, jobDescriptionId: jobId, careerProfileId: profile!.id, status: 'ready', matchScore: 50 })
      .returning();
    await db.insert(requirementCoverages).values(
      requirementIds.map((requirementId, index) => ({
        evaluationId: evaluation!.id,
        requirementId,
        coverage: (index === 2 ? 'gap' : 'covered') as 'covered' | 'gap',
        evidenceId: null,
        rationale: 'test',
      })),
    );
    const evaluationResponse = await request(app.getHttpServer()).get(`/evaluations/${evaluation!.id}`).expect(200);
    const deniedCoverage = evaluationResponse.body.requirementCoverages.find((item: { requirementId: string }) => item.requirementId === requirementIds[2]!);
    expect(deniedCoverage.denied).toBe(true);
  });

  it('should allow two tailored resumes for the same job', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return { allocations: [{ sectionKind: 'experience', evidenceIds }], coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }] };
      }
      const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
    });
    const first = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    const second = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it('should mark the document failed without a half resume when the AI fails', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockRejectedValue(new AiUnavailableError(503));
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    const tailoredId = createResponse.body.id as string;
    await expect(runProcessor(tailoredId, 'tailor', 2)).rejects.toBeInstanceOf(AiUnavailableError);
    const [row] = await db.select().from(resumes).where(eq(resumes.id, tailoredId));
    expect(row?.generationStatus).toBe('failed');
    expect(row?.generationStep).toBeNull();
    const doc = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(doc.body.generationStep).toBeNull();
    const bullets = doc.body.sections.flatMap((section: { entries: Array<{ bullets: unknown[] }> }) =>
      section.entries.flatMap((entry) => entry.bullets),
    );
    expect(bullets).toHaveLength(0);
  });

  it('should pass through planning and end with null generation_step on ready', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    let stepDuringPlan: string | null | undefined;
    let pendingTailoredId = '';
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        const [row] = await db.select().from(resumes).where(eq(resumes.id, pendingTailoredId));
        stepDuringPlan = (row as { generationStep: string | null }).generationStep;
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }],
        };
      }
      if (req.promptName === 'write-section') {
        const evidencesInput = (req.payload.evidences ?? []) as Array<{ id: string }>;
        return { bullets: evidencesInput.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
      }
      return { suggestions: [] };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    pendingTailoredId = createResponse.body.id as string;
    await runProcessor(pendingTailoredId, 'tailor');
    expect(stepDuringPlan).toBe('planning');
    const [row] = await db.select().from(resumes).where(eq(resumes.id, pendingTailoredId));
    expect(row?.generationStatus).toBe('ready');
    expect(row?.generationStep).toBeNull();
    const doc = await request(app.getHttpServer()).get(`/resumes/${pendingTailoredId}`).expect(200);
    expect(doc.body.generationStep).toBeNull();
  });
});

describe('BUG-02 custom items', () => {
  it('should create one entry per item and skip an empty custom section', async () => {
    await createCareerData();
    aiComplete.mockImplementation(async () => ({ bullets: [] }));
    const response = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Custom items',
        sections: [
          { kind: 'custom', title: 'Talks', items: ['First talk', 'Second talk'] },
          { kind: 'custom', title: 'Empty' },
        ],
      })
      .expect(202);
    const doc = await request(app.getHttpServer()).get(`/resumes/${response.body.id}`).expect(200);
    expect(doc.body.sections).toHaveLength(1);
    expect(doc.body.sections[0].entries).toHaveLength(2);
  });
});

describe('BUG-15 tailored inherits education entries', () => {
  it('should copy both education entries in the same order', async () => {
    const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
    const [experience] = await db
      .insert(experiences)
      .values({ careerProfileId: profile!.id, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: '2023-01-01' })
      .returning();
    const [evidence] = await db
      .insert(evidences)
      .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Led team of five engineers' })
      .returning();
    const [educationA] = await db
      .insert(educationEntries)
      .values({ careerProfileId: profile!.id, institution: 'USP', degree: 'Computer Science', startedOn: '2016-01-01', endedOn: '2019-12-31' })
      .returning();
    const [educationB] = await db
      .insert(educationEntries)
      .values({ careerProfileId: profile!.id, institution: 'MIT', degree: 'MSc', startedOn: '2020-01-01', endedOn: '2021-12-31' })
      .returning();
    const baseId = await createReadyBase([
      { kind: 'experience', experienceIds: [experience!.id], evidenceIds: [evidence!.id] },
      { kind: 'education', educationEntryIds: [educationA!.id, educationB!.id], evidenceIds: [] },
    ]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds: [evidence!.id] }],
          coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidence!.id, gapKind: null }],
        };
      }
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseId, jobDescriptionId: jobId })
      .expect(202);
    await runProcessor(createResponse.body.id as string, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    const educationSection = doc.body.sections.find((section: { kind: string }) => section.kind === 'education');
    expect(educationSection).toBeDefined();
    expect(educationSection.entries).toHaveLength(2);
    expect(educationSection.entries[0].educationEntryId).toBe(educationA!.id);
    expect(educationSection.entries[1].educationEntryId).toBe(educationB!.id);
  });
});

describe('BUG-21 adaptation changes', () => {
  it('should list added and removed evidences with statements', async () => {
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
    const baseId = await createReadyBase([
      { kind: 'experience', experienceIds: [experience!.id], evidenceIds: [evidenceA!.id, evidenceB!.id] },
    ]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds: [evidenceB!.id, evidenceC!.id] }],
          coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceB!.id, gapKind: null }],
        };
      }
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseId, jobDescriptionId: jobId })
      .expect(202);
    await runProcessor(createResponse.body.id as string, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    expect(doc.body.adaptationChanges).toBeDefined();
    const addedIds = doc.body.adaptationChanges.addedEvidences.map((item: { id: string }) => item.id);
    const removedIds = doc.body.adaptationChanges.removedEvidences.map((item: { id: string }) => item.id);
    expect(addedIds).toContain(evidenceC!.id);
    expect(removedIds).toContain(evidenceA!.id);
    const addedStatements = doc.body.adaptationChanges.addedEvidences.map((item: { statement: string }) => item.statement);
    expect(addedStatements).toContain('Migrated to Kubernetes');
    const baseDoc = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    expect(baseDoc.body.adaptationChanges).toBeNull();
    await db.delete(evidences).where(eq(evidences.id, evidenceC!.id));
    const afterDelete = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    const addedAfter = afterDelete.body.adaptationChanges.addedEvidences.map((item: { id: string }) => item.id);
    expect(addedAfter).not.toContain(evidenceC!.id);
  });
});

describe('BUG-25 job title and tailored name', () => {
  it('should derive the job title from the first non-empty line and name the tailored resume', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const [job] = await db
      .insert(jobDescriptions)
      .values({ userId: LOCAL_USER_ID, rawText: '\n  Senior Full Stack Developer  \n\nWe are hiring engineers.', language: 'en' })
      .returning();
    await db.insert(requirements).values({
      jobDescriptionId: job!.id,
      literalTerm: 'Leadership',
      concept: 'Leadership',
      normalizedConcept: 'leadership',
      kind: 'mandatory',
      ordinal: 0,
    });
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        const rows = await db.select().from(requirements);
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: rows.map((row) => ({ requirementId: row.id, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null })),
        };
      }
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Led team of five engineers' })) };
    });
    const createResponse = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseId, jobDescriptionId: job!.id })
      .expect(202);
    await runProcessor(createResponse.body.id as string, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    expect(doc.body.name).toBe('Base — Senior Full Stack Developer');
    const list = await request(app.getHttpServer()).get('/resumes').expect(200);
    const tailoredItem = list.body.resumes.find((item: { id: string }) => item.id === createResponse.body.id);
    expect(tailoredItem.jobTitle).toBe('Senior Full Stack Developer');
    const baseItem = list.body.resumes.find((item: { id: string }) => item.id === baseId);
    expect(baseItem.jobTitle).toBeNull();
  });

  it('should cut a long job title at 120 characters', async () => {
    await createCareerData();
    const longTitle = `A${'a'.repeat(200)}`;
    const [job] = await db
      .insert(jobDescriptions)
      .values({ userId: LOCAL_USER_ID, rawText: `${longTitle}\nBody`, language: 'en' })
      .returning();
    const baseResponse = await request(app.getHttpServer()).post('/base-resumes').send({ name: 'Base' }).expect(202);
    const tailoredResponse = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseResponse.body.id, jobDescriptionId: job!.id })
      .expect(202);
    const list = await request(app.getHttpServer()).get('/resumes').expect(200);
    const tailoredItem = list.body.resumes.find((item: { id: string }) => item.id === tailoredResponse.body.id);
    expect(tailoredItem.jobTitle).toHaveLength(120);
    expect(tailoredItem.name.length).toBeLessThanOrEqual(200);
  });
});

describe('BUG-17 restyle on tone change', () => {
  it('should enqueue restyle, rewrite AI bullets, keep hand edits and leave the base untouched', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }>; sectionKind?: string } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null }],
        };
      }
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Led team of five engineers' })) };
    });
    const tailoredResponse = await request(app.getHttpServer())
      .post('/tailored-resumes')
      .send({ baseResumeId: baseId, jobDescriptionId: jobId })
      .expect(202);
    const tailoredId = tailoredResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const beforeTailored = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const targetBullet = beforeTailored.body.sections
      .flatMap((section: { entries: Array<{ bullets: Array<{ id: string }> }> }) =>
        section.entries.flatMap((entry) => entry.bullets),
      )
      .find((bullet: { id: string }) => bullet.id !== undefined);
    await request(app.getHttpServer()).put(`/bullets/${targetBullet.id}`).send({ text: 'Edited by hand.' }).expect(200);
    const baseBefore = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const baseHash = JSON.stringify(baseBefore.body.sections);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Restyled with technical tone' })) };
    });
    const updating = await request(app.getHttpServer())
      .put(`/resumes/${tailoredId}/settings`)
      .send({ tone: 'technical' })
      .expect(200);
    expect(updating.body.generationStatus).toBe('generating');
    await runProcessor(tailoredId, 'restyle');
    const after = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(after.body.generationStatus).toBe('ready');
    expect(after.body.tone).toBe('technical');
    const bulletsAfter = after.body.sections.flatMap(
      (section: { entries: Array<{ bullets: Array<{ id: string; text: string; editedByPerson: boolean }> }> }) =>
        section.entries.flatMap((entry) => entry.bullets),
    );
    const edited = bulletsAfter.find((bullet: { id: string }) => bullet.id === targetBullet.id);
    expect(edited.text).toBe('Edited by hand.');
    expect(edited.editedByPerson).toBe(true);
    const rewritten = bulletsAfter.filter((bullet: { id: string }) => bullet.id !== targetBullet.id);
    expect(rewritten.length).toBeGreaterThan(0);
    for (const bullet of rewritten) {
      expect(bullet.text).toBe('Restyled with technical tone');
    }
    const baseAfter = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    expect(JSON.stringify(baseAfter.body.sections)).toBe(baseHash);
  });

  it('should not rewrite when only the template changes', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([{ kind: 'experience', experienceIds: [experienceId], evidenceIds }]);
    const updated = await request(app.getHttpServer())
      .put(`/resumes/${baseId}/settings`)
      .send({ template: 'dense' })
      .expect(200);
    expect(updated.body.template).toBe('dense');
    expect(updated.body.generationStatus).toBe('ready');
  });
});

describe('BUG-30 restyle keeps summary suggestions', () => {
  it('should keep pending and approved suggestions when the tone changes', async () => {
    const { experienceId, evidenceIds } = await createCareerData();
    const baseId = await createReadyBase([
      { kind: 'summary', evidenceIds },
      { kind: 'experience', experienceIds: [experienceId], evidenceIds },
    ]);
    const { jobId, requirementIds } = await createJob('en', [
      { literalTerm: 'Leadership', kind: 'mandatory' },
      { literalTerm: 'Kubernetes', kind: 'mandatory' },
      { literalTerm: 'Elixir', kind: 'desirable' },
    ]);
    aiComplete.mockImplementation((async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds }],
          coverages: [
            { requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evidenceIds[0]!, gapKind: null },
            { requirementId: requirementIds[1]!, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
            { requirementId: requirementIds[2]!, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
          ],
        };
      }
      if (req.promptName === 'draft-suggestions') {
        return {
          suggestions: [
            { requirementId: requirementIds[1]!, gapKind: 'existence', question: 'Have you used Kubernetes?', draftBullet: 'Assisted Kubernetes migration.' },
            { requirementId: requirementIds[2]!, gapKind: 'existence', question: 'Have you used Elixir?', draftBullet: 'Explored Elixir side projects.' },
          ],
        };
      }
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [{ text: 'Experienced engineer working with modern stacks.' }] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Led team of five engineers' })) };
    }) as never);
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    const tailoredId = createResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const beforeTailor = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const summaryBeforeTailor = beforeTailor.body.sections.find((section: { kind: string }) => section.kind === 'summary');
    const pendingBefore = summaryBeforeTailor.entries
      .flatMap((entry: { bullets: Array<{ id: string; status: string }> }) => entry.bullets)
      .filter((bullet: { status: string }) => bullet.status === 'suggestion');
    expect(pendingBefore).toHaveLength(2);
    const toApproveId = pendingBefore[0].id as string;
    const toKeepId = pendingBefore[1].id as string;
    await request(app.getHttpServer()).post(`/bullets/${toApproveId}/approve`).expect(200);
    const afterApprove = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    const summaryAfterApprove = afterApprove.body.sections.find((section: { kind: string }) => section.kind === 'summary');
    const bulletsAfterApprove = summaryAfterApprove.entries.flatMap((entry: { bullets: Array<{ id: string }> }) => entry.bullets);
    const approvedBullet = bulletsAfterApprove.find((bullet: { id: string }) => bullet.id === toApproveId);
    const pendingBullet = bulletsAfterApprove.find((bullet: { id: string }) => bullet.id === toKeepId);
    expect(approvedBullet.status).toBe('assumed');
    expect(approvedBullet.evidenceId).toBeDefined();
    expect(pendingBullet.status).toBe('suggestion');
    aiComplete.mockImplementation((async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [{ text: 'Restyled summary with technical focus.' }] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Restyled with technical tone' })) };
    }) as never);
    const updating = await request(app.getHttpServer()).put(`/resumes/${tailoredId}/settings`).send({ tone: 'technical' }).expect(200);
    expect(updating.body.generationStatus).toBe('generating');
    await runProcessor(tailoredId, 'restyle');
    const after = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(after.body.generationStatus).toBe('ready');
    const summaryAfter = after.body.sections.find((section: { kind: string }) => section.kind === 'summary');
    const bulletsAfter = summaryAfter.entries.flatMap((entry: { bullets: Array<{ id: string }> }) => entry.bullets);
    const approvedAfter = bulletsAfter.find((bullet: { id: string }) => bullet.id === toApproveId);
    const pendingAfter = bulletsAfter.find((bullet: { id: string }) => bullet.id === toKeepId);
    expect(approvedAfter).toBeDefined();
    expect(pendingAfter).toBeDefined();
    expect(pendingAfter.text).toBe(pendingBullet.text);
    expect(pendingAfter.suggestionQuestion).toBe(pendingBullet.suggestionQuestion);
    expect(pendingAfter.requirementId).toBe(pendingBullet.requirementId);
    expect(approvedAfter.text).toBe(approvedBullet.text);
    expect(approvedAfter.evidenceId).toBe(approvedBullet.evidenceId);
    expect(approvedAfter.status).toBe('assumed');
    const textsAfter = bulletsAfter.map((bullet: { text: string }) => bullet.text);
    expect(textsAfter).toContain('Restyled summary with technical focus.');
    expect(textsAfter).not.toContain('Experienced engineer working with modern stacks.');
  });
});

describe('BUG-52 tailored keeps experience entries', () => {
  it('should create one entry per experience in base order with company, role and period', async () => {
    const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
    const [expA] = await db
      .insert(experiences)
      .values({ careerProfileId: profile!.id, company: 'Granite Corp', role: 'Data Engineer', startedOn: '2018-01-01', endedOn: '2020-01-01' })
      .returning();
    const [expB] = await db
      .insert(experiences)
      .values({ careerProfileId: profile!.id, company: 'Northwind', role: 'Senior Engineer', startedOn: '2020-06-01', endedOn: null })
      .returning();
    const [evA] = await db
      .insert(evidences)
      .values({ careerProfileId: profile!.id, experienceId: expA!.id, statement: 'Led data pipeline migration' })
      .returning();
    const [evB] = await db
      .insert(evidences)
      .values({ careerProfileId: profile!.id, experienceId: expB!.id, statement: 'Scaled API to millions' })
      .returning();
    const baseId = await createReadyBase([
      { kind: 'experience', experienceIds: [expA!.id, expB!.id], evidenceIds: [evA!.id, evB!.id] },
    ]);
    const { jobId, requirementIds } = await createJob('en', [{ literalTerm: 'Leadership', kind: 'mandatory' }]);
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        return {
          allocations: [{ sectionKind: 'experience', evidenceIds: [evB!.id, evA!.id] }],
          coverages: [{ requirementId: requirementIds[0]!, coverage: 'covered', evidenceId: evA!.id, gapKind: null }],
        };
      }
      if ((req.promptName === 'synthesize-section' || req.promptName === 'write-profile-summary')) {
        return { bullets: [] };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: `Tailored bullet for ${item.id.slice(0, 8)}` })) };
    });
    const createResponse = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: jobId }).expect(202);
    const tailoredId = createResponse.body.id as string;
    await runProcessor(tailoredId, 'tailor');
    const doc = await request(app.getHttpServer()).get(`/resumes/${tailoredId}`).expect(200);
    expect(doc.body.generationStatus).toBe('ready');
    const experienceSection = doc.body.sections.find((section: { kind: string }) => section.kind === 'experience');
    expect(experienceSection).toBeDefined();
    expect(experienceSection.entries).toHaveLength(2);
    expect(experienceSection.entries[0].experienceId).toBe(expA!.id);
    expect(experienceSection.entries[1].experienceId).toBe(expB!.id);
    expect(experienceSection.entries[0].company).toBe('Granite Corp');
    expect(experienceSection.entries[0].role).toBe('Data Engineer');
    expect(experienceSection.entries[0].period).toBe('2018-01-01 – 2020-01-01');
    expect(experienceSection.entries[1].company).toBe('Northwind');
    expect(experienceSection.entries[1].role).toBe('Senior Engineer');
    expect(experienceSection.entries[1].period).toBe('2020-06-01 – Present');
    const firstEvidenceIds = experienceSection.entries[0].bullets.map((bullet: { evidenceId: string }) => bullet.evidenceId);
    const secondEvidenceIds = experienceSection.entries[1].bullets.map((bullet: { evidenceId: string }) => bullet.evidenceId);
    expect(firstEvidenceIds).toEqual([evA!.id]);
    expect(secondEvidenceIds).toEqual([evB!.id]);
  });
});
