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
import { careerProfiles, evidences, experiences } from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import { AiKeyRejectedError, AiUnavailableError } from '../src/modules/ai/ai-errors';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeDocumentRepository } from '../src/modules/resume/resume-document.repository';
import { ResumeRepository } from '../src/modules/resume/resume.repository';
import { ResumeWritingProcessor } from '../src/modules/resume/writing/resume-writing.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_item_refinement_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/12';

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
  async (..._args: unknown[]): Promise<unknown> => ({ bullets: [], refined: 'Refined mock.' }),
);

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function createCareerWithExperience(): Promise<{ experienceId: string; evidenceId: string }> {
  const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
  const [experience] = await db
    .insert(experiences)
    .values({ careerProfileId: profile!.id, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: '2023-01-01' })
    .returning();
  const [evidence] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Led team of five engineers' })
    .returning();
  return { experienceId: experience!.id, evidenceId: evidence!.id };
}

function fakeJob(resumeId: string, attemptsMade = 0): never {
  return {
    data: { resumeId, userId: LOCAL_USER_ID },
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: async () => undefined,
  } as never;
}

async function runProcessor(resumeId: string): Promise<void> {
  const repository = new ResumeRepository(db as unknown as Database, new ResumeDocumentRepository(db as unknown as Database));
  const processor = new ResumeWritingProcessor(db as unknown as Database, { complete: aiComplete } as unknown as AiClient, repository);
  await processor.process(fakeJob(resumeId));
}

function echoBullets(): void {
  aiComplete.mockImplementation(async (...input: unknown[]) => {
    const req = input[0] as { promptName?: string; payload: { evidences?: Array<{ id: string }> } };
    if (req.promptName === 'refine-item') {
      return { refined: 'Refined by AI.' };
    }
    if (req.promptName === 'synthesize-section' || req.payload.evidences === undefined) {
      return { bullets: [] };
    }
    return { bullets: req.payload.evidences.map((evidence) => ({ evidenceId: evidence.id, text: 'Led team of five engineers' })) };
  });
}

async function createReadyBase(experienceId: string, evidenceIds: string[]): Promise<string> {
  echoBullets();
  const response = await request(app.getHttpServer())
    .post('/base-resumes')
    .send({ name: 'Base', language: 'en', sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }] })
    .expect(202);
  await runProcessor(response.body.id as string);
  return response.body.id as string;
}

type BulletView = { id: string; ordinal: number; text: string; evidenceId: string | null; status: string; editedByPerson: boolean };
type EntryView = { id: string; ordinal: number; heading: string | null; experienceId: string | null; bullets: BulletView[] };
type SectionView = { id: string; kind: string; ordinal: number; entries: EntryView[] };

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
  aiComplete.mockImplementation(async () => ({ bullets: [], refined: 'Refined mock.' }));
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

describe('POST /sections/:sectionId/refine-item', () => {
  it('should refine without persisting and pass style and language to the prompt', async () => {
    const { experienceId, evidenceId } = await createCareerWithExperience();
    const baseId = await createReadyBase(experienceId, [evidenceId]);
    echoBullets();
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');
    const bulletsBefore = experience.entries.flatMap((entry: EntryView) => entry.bullets);

    const response = await request(app.getHttpServer())
      .post(`/sections/${experience.id}/refine-item`)
      .send({ text: 'did stuff with team' })
      .expect(200);
    expect(response.body).toEqual({ refined: 'Refined by AI.' });

    const refineCall = aiComplete.mock.calls.find(
      (call) => (call[0] as { promptName?: string }).promptName === 'refine-item',
    );
    expect(refineCall).toBeDefined();
    expect((refineCall?.[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      text: 'did stuff with team',
      sectionKind: 'experience',
      language: 'en',
    });

    const after = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experienceAfter = after.body.sections.find((section: SectionView) => section.kind === 'experience');
    const bulletsAfter = experienceAfter.entries.flatMap((entry: EntryView) => entry.bullets);
    expect(bulletsAfter.length).toBe(bulletsBefore.length);
  });

  it('should answer 404 for a malformed or foreign section id', async () => {
    await request(app.getHttpServer()).post('/sections/not-a-uuid/refine-item').send({ text: 'x' }).expect(404);
    await request(app.getHttpServer())
      .post('/sections/6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01/refine-item')
      .send({ text: 'x' })
      .expect(404);
  });

  it('should answer 400 for empty or too long text', async () => {
    const { experienceId, evidenceId } = await createCareerWithExperience();
    const baseId = await createReadyBase(experienceId, [evidenceId]);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');

    await request(app.getHttpServer()).post(`/sections/${experience.id}/refine-item`).send({ text: '' }).expect(400);
    await request(app.getHttpServer()).post(`/sections/${experience.id}/refine-item`).send({ text: 'a'.repeat(1001) }).expect(400);
  });

  it('should map AI errors to the current codes', async () => {
    const { experienceId, evidenceId } = await createCareerWithExperience();
    const baseId = await createReadyBase(experienceId, [evidenceId]);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');

    aiComplete.mockRejectedValue(new AiKeyRejectedError());
    const rejected = await request(app.getHttpServer()).post(`/sections/${experience.id}/refine-item`).send({ text: 'x' }).expect(422);
    expect(rejected.body.code).toBe('ai_key_rejected');

    aiComplete.mockRejectedValue(new AiUnavailableError(503));
    const unavailable = await request(app.getHttpServer()).post(`/sections/${experience.id}/refine-item`).send({ text: 'x' }).expect(503);
    expect(unavailable.body.code).toBe('ai_unavailable');
  });
});

describe('POST /sections/:sectionId/items with createEvidence', () => {
  it('should append a bullet with evidence linked to the entry experience', async () => {
    const { experienceId, evidenceId } = await createCareerWithExperience();
    const baseId = await createReadyBase(experienceId, [evidenceId]);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');
    const entry = experience.entries[0] as EntryView;
    const evidencesBefore = await db.select().from(evidences);

    const added = await request(app.getHttpServer())
      .post(`/sections/${experience.id}/items`)
      .send({ text: 'Shipped checkout flow', createEvidence: true, entryId: entry.id })
      .expect(200);
    const after = added.body.sections.find((section: SectionView) => section.id === experience.id);
    const bullets = (after.entries[0] as EntryView).bullets;
    const created = bullets.find((bullet) => bullet.text === 'Shipped checkout flow');
    expect(created).toBeDefined();
    expect(created?.status).toBe('assumed');
    expect(created?.editedByPerson).toBe(true);
    expect(created?.evidenceId).not.toBeNull();

    const evidencesAfter = await db.select().from(evidences);
    expect(evidencesAfter.length).toBe(evidencesBefore.length + 1);
    const stored = evidencesAfter.find((row) => row.id === created?.evidenceId);
    expect(stored?.statement).toBe('Shipped checkout flow');
    expect(stored?.experienceId).toBe(entry.experienceId);
  });

  it('should answer 404 when the entry belongs to another section', async () => {
    const { experienceId, evidenceId } = await createCareerWithExperience();
    echoBullets();
    const created = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Base',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experienceId], evidenceIds: [evidenceId] },
          { kind: 'custom', title: 'Talks', items: ['First talk'] },
        ],
      })
      .expect(202);
    await runProcessor(created.body.id as string);
    const before = await request(app.getHttpServer()).get(`/resumes/${created.body.id}`).expect(200);
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');
    const custom = before.body.sections.find((section: SectionView) => section.kind === 'custom');
    const foreignEntry = (custom.entries[0] as EntryView).id;

    await request(app.getHttpServer())
      .post(`/sections/${experience.id}/items`)
      .send({ text: 'Nope', entryId: foreignEntry })
      .expect(404);
  });
});
