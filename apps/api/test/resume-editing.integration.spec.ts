import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import { careerProfiles, evidences, experiences, jobDescriptions, requirements, resumeBullets } from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeDocumentRepository } from '../src/modules/resume/resume-document.repository';
import { ResumeRepository } from '../src/modules/resume/resume.repository';
import { ResumeWritingProcessor } from '../src/modules/resume/writing/resume-writing.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_resume_editing_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/10';

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

async function createCareerWithMetric(): Promise<{ experienceId: string; evidenceId: string }> {
  const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
  const [experience] = await db
    .insert(experiences)
    .values({ careerProfileId: profile!.id, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: '2023-01-01' })
    .returning();
  const [evidence] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Increased sales by 85% in one year' })
    .returning();
  return { experienceId: experience!.id, evidenceId: evidence!.id };
}

function fakeJob(resumeId: string, name?: string, sectionId?: string, instruction = 'Make it shorter.', attemptsMade = 0): never {
  return {
    name,
    data: { resumeId, userId: LOCAL_USER_ID, sectionId, instruction },
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: async () => undefined,
  } as never;
}

async function runProcessor(resumeId: string, name?: string, sectionId?: string, instruction = 'Make it shorter.'): Promise<void> {
  const repository = new ResumeRepository(db as unknown as Database, new ResumeDocumentRepository(db as unknown as Database));
  const processor = new ResumeWritingProcessor(db as unknown as Database, { complete: aiComplete } as unknown as AiClient, repository);
  await processor.process(fakeJob(resumeId, name, sectionId, instruction));
}

function echoBullets() {
  aiComplete.mockImplementation(async (...input: unknown[]) => {
    const req = input[0] as { promptName?: string; payload: { evidences?: Array<{ id: string }> } };
    if (req.promptName === 'synthesize-section' || req.payload.evidences === undefined) {
      return { bullets: [] };
    }
    return { bullets: req.payload.evidences.map((evidence) => ({ evidenceId: evidence.id, text: 'Increased sales by 85% in one year' })) };
  });
}

async function createReadyBase(experienceId: string, evidenceId: string, extraSkills = false): Promise<string> {
  echoBullets();
  const sections: unknown[] = [{ kind: 'experience', experienceIds: [experienceId], evidenceIds: [evidenceId] }];
  if (extraSkills) {
    sections.push({ kind: 'skills', evidenceIds: [] });
  }
  const response = await request(app.getHttpServer()).post('/base-resumes').send({ name: 'Base', language: 'en', sections }).expect(202);
  await runProcessor(response.body.id as string);
  return response.body.id as string;
}

type BulletView = { id: string; text: string; evidenceId: string | null; needsReview: boolean; editedByPerson: boolean };
type SectionView = { id: string; kind: string; entries: Array<{ id: string; bullets: BulletView[] }>; comments: Array<{ id: string; text: string; resolvedAt: string | null }> };

function bulletsOf(document: { sections: SectionView[] }): BulletView[] {
  return document.sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets));
}

function sectionOf(document: { sections: SectionView[] }, kind: string): SectionView {
  const section = document.sections.find((item) => item.kind === kind);
  if (section === undefined) {
    throw new Error(`Missing ${kind} section`);
  }
  return section;
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

describe('PUT /bullets/:bulletId', () => {
  it('should edit one tailored bullet without touching the base or another resume', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const baseId = await createReadyBase(experienceId, evidenceId);
    const [job] = await db.insert(jobDescriptions).values({ userId: LOCAL_USER_ID, rawText: 'Hiring', language: 'en' }).returning();
    await db.insert(requirements).values({ jobDescriptionId: job!.id, literalTerm: 'Sales', concept: 'Sales', normalizedConcept: 'sales', kind: 'mandatory', ordinal: 0 });
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { promptName: string; payload: { evidences?: Array<{ id: string }> } };
      if (req.promptName === 'plan-adaptation') {
        const rows = await db.select().from(requirements);
        return { allocations: [{ sectionKind: 'experience', evidenceIds: [evidenceId] }], coverages: rows.map((row) => ({ requirementId: row.id, coverage: 'covered', evidenceId, gapKind: null })) };
      }
      const list = (req.payload.evidences ?? []) as Array<{ id: string }>;
      return { bullets: list.map((item) => ({ evidenceId: item.id, text: 'Increased sales by 85% in one year' })) };
    });
    const first = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: job!.id }).expect(202);
    const second = await request(app.getHttpServer()).post('/tailored-resumes').send({ baseResumeId: baseId, jobDescriptionId: job!.id }).expect(202);
    await runProcessor(first.body.id as string, 'tailor');
    await runProcessor(second.body.id as string, 'tailor');

    const before = await request(app.getHttpServer()).get(`/resumes/${first.body.id}`).expect(200);
    const target = bulletsOf(before.body)[0]!;
    const edited = await request(app.getHttpServer()).put(`/bullets/${target.id}`).send({ text: 'Edited by hand.' }).expect(200);
    expect(bulletsOf(edited.body).find((bullet) => bullet.id === target.id)?.text).toBe('Edited by hand.');
    expect(bulletsOf(edited.body).find((bullet) => bullet.id === target.id)?.editedByPerson).toBe(true);

    const baseAfter = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    expect(bulletsOf(baseAfter.body).some((bullet) => bullet.text === 'Edited by hand.')).toBe(false);
    const otherAfter = await request(app.getHttpServer()).get(`/resumes/${second.body.id}`).expect(200);
    expect(bulletsOf(otherAfter.body).some((bullet) => bullet.text === 'Edited by hand.')).toBe(false);
  });
});

describe('POST /sections/:sectionId/rewrite', () => {
  it('should answer 400 without a body or with an empty or too long instruction', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const baseId = await createReadyBase(experienceId, evidenceId);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = sectionOf(before.body, 'experience');
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({}).expect(400);
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: '' }).expect(400);
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: '   ' }).expect(400);
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: 'a'.repeat(501) }).expect(400);
  });

  it('should answer 202 in generating and rewrite only its own section', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    echoBullets();
    const created = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Base',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experienceId], evidenceIds: [evidenceId] },
          { kind: 'skills', evidenceIds: [] },
          { kind: 'custom', title: 'Talks', items: ['First talk'] },
        ],
      })
      .expect(202);
    const baseId = created.body.id as string;
    await runProcessor(baseId);
    await request(app.getHttpServer()).post(`/sections/${sectionOf((await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200)).body, 'experience').id}/comments`).send({ text: 'Shorter.' }).expect(201);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = sectionOf(before.body, 'experience');
    const untouchedBefore = JSON.stringify(
      before.body.sections.filter((section: SectionView) => section.id !== experience.id),
    );
    aiComplete.mockImplementation(async () => ({ bullets: [{ evidenceId, text: 'Rewritten with 85% intact.' }] }));
    const rewriting = await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: 'Make it shorter.' }).expect(202);
    expect(rewriting.body.generationStatus).toBe('generating');
    await runProcessor(baseId, 'rewrite-section', experience.id, 'Make it shorter.');
    const after = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    expect(after.body.generationStatus).toBe('ready');
    expect(JSON.stringify(after.body.sections.filter((section: SectionView) => section.id !== experience.id))).toBe(untouchedBefore);
    expect(bulletsOf(after.body).some((bullet) => bullet.text === 'Rewritten with 85% intact.')).toBe(true);
  });

  it('should send the instruction to the rewrite prompt and ignore open comments', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const baseId = await createReadyBase(experienceId, evidenceId);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = sectionOf(before.body, 'experience');
    await request(app.getHttpServer()).post(`/sections/${experience.id}/comments`).send({ text: 'Keep it short.' }).expect(201);
    const seen: Array<{ instruction?: unknown; openComments?: unknown }> = [];
    aiComplete.mockImplementation(async (...input: unknown[]) => {
      const req = input[0] as { payload: { instruction: string; openComments: string[]; evidences: Array<{ id: string }> } };
      seen.push({ instruction: req.payload.instruction, openComments: req.payload.openComments });
      return { bullets: req.payload.evidences.map((item) => ({ evidenceId: item.id, text: 'Increased sales by 85% in one year' })) };
    });
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: 'Highlight Git and Docker.' }).expect(202);
    await runProcessor(baseId, 'rewrite-section', experience.id, 'Highlight Git and Docker.');
    expect(seen[0]?.instruction).toBe('Highlight Git and Docker.');
    expect(seen[0]?.openComments).toEqual([]);
  });

  it('should undo to the previous state including a hand edit', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const baseId = await createReadyBase(experienceId, evidenceId);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = sectionOf(before.body, 'experience');
    const target = bulletsOf(before.body)[0]!;
    await request(app.getHttpServer()).put(`/bullets/${target.id}`).send({ text: 'Hand edit with 85%.' }).expect(200);
    aiComplete.mockImplementation(async () => ({ bullets: [{ evidenceId, text: 'AI rewrite with 85%.' }] }));
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: 'Rewrite it.' }).expect(202);
    await runProcessor(baseId, 'rewrite-section', experience.id, 'Rewrite it.');
    const rewritten = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    expect(bulletsOf(rewritten.body).some((bullet) => bullet.text === 'AI rewrite with 85%.')).toBe(true);
    const undone = await request(app.getHttpServer()).post(`/sections/${experience.id}/undo-rewrite`).expect(200);
    expect(bulletsOf(undone.body).some((bullet) => bullet.text === 'Hand edit with 85%.')).toBe(true);
  });

  it('should clear the hand edit flag when the AI rewrites the bullet', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const baseId = await createReadyBase(experienceId, evidenceId);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = sectionOf(before.body, 'experience');
    const target = bulletsOf(before.body)[0]!;
    await request(app.getHttpServer()).put(`/bullets/${target.id}`).send({ text: 'Hand edit with 85%.' }).expect(200);
    aiComplete.mockImplementation(async () => ({ bullets: [{ evidenceId, text: 'AI rewrite with 85%.' }] }));
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: 'Rewrite it.' }).expect(202);
    await runProcessor(baseId, 'rewrite-section', experience.id, 'Rewrite it.');
    const rewritten = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const rewrittenBullet = bulletsOf(rewritten.body).find((bullet) => bullet.text === 'AI rewrite with 85%.')!;
    expect(rewrittenBullet.editedByPerson).toBe(false);
  });
});

describe('PUT /evidences/:id and PUT /experiences/:id', () => {
  it('should require resumeId and return that document after marking', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const baseId = await createReadyBase(experienceId, evidenceId);
    await request(app.getHttpServer()).put(`/evidences/${evidenceId}`).send({ statement: 'x' }).expect(400);
    await request(app.getHttpServer()).put(`/evidences/${evidenceId}?resumeId=not-a-uuid`).send({ statement: 'x' }).expect(400);
    await request(app.getHttpServer()).put(`/evidences/${evidenceId}?resumeId=6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01`).send({ statement: 'x' }).expect(404);

    const corrected = await request(app.getHttpServer())
      .put(`/evidences/${evidenceId}?resumeId=${baseId}`)
      .send({ statement: 'Increased sales by 70% in one year' })
      .expect(200);
    expect(corrected.body.id).toBe(baseId);
  });

  it('should mark bullets citing the old metric in every resume without rewriting', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const firstBase = await createReadyBase(experienceId, evidenceId);
    const secondBase = await createReadyBase(experienceId, evidenceId);

    const corrected = await request(app.getHttpServer())
      .put(`/evidences/${evidenceId}?resumeId=${firstBase}`)
      .send({ statement: 'Increased sales by 70% in one year' })
      .expect(200);
    const marked = bulletsOf(corrected.body).filter((bullet) => bullet.evidenceId === evidenceId);
    expect(marked.length).toBeGreaterThan(0);
    for (const bullet of marked) {
      expect(bullet.needsReview).toBe(true);
      expect(bullet.text).toContain('85%');
    }
    const other = await request(app.getHttpServer()).get(`/resumes/${secondBase}`).expect(200);
    const otherMarked = bulletsOf(other.body).filter((bullet) => bullet.evidenceId === evidenceId);
    expect(otherMarked.length).toBeGreaterThan(0);
    for (const bullet of otherMarked) {
      expect(bullet.needsReview).toBe(true);
    }
    const rows = await db.select().from(resumeBullets);
    expect(rows.every((row) => row.text.includes('85%') || row.text.includes('Increased sales'))).toBe(true);
  });

  it('should answer 422 for an invalid experience period', async () => {
    const { experienceId } = await createCareerWithMetric();
    echoBullets();
    const base = await createReadyBase(experienceId, (await db.select().from(evidences))[0]!.id);
    await request(app.getHttpServer())
      .put(`/experiences/${experienceId}?resumeId=${base}`)
      .send({ startedOn: '13/2020' })
      .expect(422);
  });
});

describe('invalid bodies and ids', () => {
  it('should answer 400 for an invalid body on every editing and correction endpoint', async () => {
    const { experienceId, evidenceId } = await createCareerWithMetric();
    const baseId = await createReadyBase(experienceId, evidenceId);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = sectionOf(before.body, 'experience');
    const target = bulletsOf(before.body)[0]!;
    await request(app.getHttpServer()).put(`/bullets/${target.id}`).send({ text: '' }).expect(400);
    await request(app.getHttpServer()).post(`/sections/${experience.id}/comments`).send({ text: '' }).expect(400);
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({}).expect(400);
    await request(app.getHttpServer()).post(`/sections/${experience.id}/rewrite`).send({ instruction: '' }).expect(400);
    await request(app.getHttpServer())
      .put(`/evidences/${evidenceId}?resumeId=${baseId}`)
      .send({ statement: '' })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/experiences/${experienceId}?resumeId=${baseId}`)
      .send({ company: '' })
      .expect(400);
  });

  it('should keep answering 404 for a malformed id', async () => {
    await request(app.getHttpServer()).put('/bullets/not-a-uuid').send({ text: 'x' }).expect(404);
    await request(app.getHttpServer()).post('/sections/not-a-uuid/comments').send({ text: 'x' }).expect(404);
    await request(app.getHttpServer()).post('/comments/not-a-uuid/resolve').expect(404);
    await request(app.getHttpServer()).post('/sections/not-a-uuid/rewrite').send({ instruction: 'Rewrite it.' }).expect(404);
    await request(app.getHttpServer()).post('/sections/not-a-uuid/undo-rewrite').expect(404);
  });
});
