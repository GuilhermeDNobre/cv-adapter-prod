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
import { resumeDocumentResponseSchema } from 'schema/contracts/resume';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeDocumentRepository } from '../src/modules/resume/resume-document.repository';
import { ResumeRepository } from '../src/modules/resume/resume.repository';
import { ResumeWritingProcessor } from '../src/modules/resume/writing/resume-writing.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_resume_structure_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/8';

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
  }> => ({ bullets: [] }),
);

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function createCareerWithTwoEvidences(): Promise<{ experienceId: string; evidenceA: string; evidenceB: string }> {
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
  return { experienceId: experience!.id, evidenceA: evidenceA!.id, evidenceB: evidenceB!.id };
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

type BulletView = { id: string; ordinal: number; text: string; evidenceId: string | null };
type EntryView = { id: string; ordinal: number; heading: string | null; bullets: BulletView[] };
type SectionView = { id: string; kind: string; ordinal: number; entries: EntryView[] };

function sectionsOf(document: { sections: SectionView[] }): SectionView[] {
  return [...document.sections].sort((a, b) => a.ordinal - b.ordinal);
}

function bulletsOfEntry(document: { sections: SectionView[] }, sectionKind: string): BulletView[] {
  const section = document.sections.find((item) => item.kind === sectionKind);
  if (section === undefined) {
    throw new Error(`Missing ${sectionKind} section`);
  }
  const entry = section.entries[0];
  if (entry === undefined) {
    throw new Error('Missing entry');
  }
  return [...entry.bullets].sort((a, b) => a.ordinal - b.ordinal);
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

describe('DELETE /sections/:sectionId', () => {
  it('should remove the section without touching the Career Profile', async () => {
    const { experienceId, evidenceA, evidenceB } = await createCareerWithTwoEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');
    const evidencesBefore = await db.select().from(evidences);

    const removed = await request(app.getHttpServer()).delete(`/sections/${experience.id}`).expect(200);
    const parsed = resumeDocumentResponseSchema.parse(removed.body);
    expect(parsed.sections.some((section) => section.id === experience.id)).toBe(false);

    const evidencesAfter = await db.select().from(evidences);
    expect(evidencesAfter.length).toBe(evidencesBefore.length);
    expect(parsed.sections.length).toBe(before.body.sections.length - 1);
  });

  it('should answer 404 for a malformed or foreign section id', async () => {
    await request(app.getHttpServer()).delete('/sections/not-a-uuid').expect(404);
    await request(app.getHttpServer()).delete('/sections/6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01').expect(404);
  });
});

describe('PUT /resumes/:resumeId/structure', () => {
  it('should reorder sections', async () => {
    const { experienceId, evidenceA } = await createCareerWithTwoEvidences();
    echoBullets();
    const created = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Base',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experienceId], evidenceIds: [evidenceA] },
          { kind: 'custom', title: 'Talks', items: ['First talk'] },
        ],
      })
      .expect(202);
    await runProcessor(created.body.id as string);
    const before = await request(app.getHttpServer()).get(`/resumes/${created.body.id}`).expect(200);
    const ordered = sectionsOf(before.body);
    const reversed = [...ordered].reverse().map((section, index) => ({ id: section.id, ordinal: index }));

    const reordered = await request(app.getHttpServer())
      .put(`/resumes/${created.body.id}/structure`)
      .send({ sections: reversed })
      .expect(200);
    expect(sectionsOf(reordered.body)[0]!.id).toBe(ordered[1]!.id);
  });
});

describe('POST /bullets/:bulletId/move', () => {
  it('should swap the bullet with its neighbor inside the same entry', async () => {
    const { experienceId, evidenceA, evidenceB } = await createCareerWithTwoEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const bullets = bulletsOfEntry(before.body, 'experience');
    expect(bullets.length).toBe(2);
    const first = bullets[0]!;
    const second = bullets[1]!;

    const moved = await request(app.getHttpServer()).post(`/bullets/${second.id}/move`).send({ direction: 'up' }).expect(200);
    const after = bulletsOfEntry(moved.body, 'experience');
    expect(after[0]!.id).toBe(second.id);
    expect(after[1]!.id).toBe(first.id);
  });

  it('should answer 422 at the edge and 400 for an invalid body', async () => {
    const { experienceId, evidenceA, evidenceB } = await createCareerWithTwoEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const bullets = bulletsOfEntry(before.body, 'experience');

    await request(app.getHttpServer()).post(`/bullets/${bullets[0]!.id}/move`).send({ direction: 'up' }).expect(422);
    await request(app.getHttpServer()).post(`/bullets/${bullets[1]!.id}/move`).send({ direction: 'down' }).expect(422);
    await request(app.getHttpServer()).post(`/bullets/${bullets[0]!.id}/move`).send({ direction: 'sideways' }).expect(400);
    await request(app.getHttpServer()).post('/bullets/not-a-uuid/move').send({ direction: 'up' }).expect(404);
  });
});

describe('DELETE /bullets/:bulletId', () => {
  it('should remove the bullet without touching its evidence', async () => {
    const { experienceId, evidenceA, evidenceB } = await createCareerWithTwoEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA, evidenceB]);
    const before = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    const target = bulletsOfEntry(before.body, 'experience')[0]!;
    const evidencesBefore = await db.select().from(evidences);

    const removed = await request(app.getHttpServer()).delete(`/bullets/${target.id}`).expect(200);
    const parsed = resumeDocumentResponseSchema.parse(removed.body);
    const remaining = parsed.sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets));
    expect(remaining.some((bullet) => bullet.id === target.id)).toBe(false);

    const evidencesAfter = await db.select().from(evidences);
    expect(evidencesAfter.length).toBe(evidencesBefore.length);
    expect(evidencesAfter.some((row) => row.id === target.evidenceId)).toBe(true);
  });

  it('should answer 404 for a malformed or foreign bullet id', async () => {
    await request(app.getHttpServer()).delete('/bullets/not-a-uuid').expect(404);
    await request(app.getHttpServer()).delete('/bullets/6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01').expect(404);
  });
});

describe('POST /sections/:sectionId/items', () => {
  it('should add a custom entry and reject a typed section with 422', async () => {
    const { experienceId, evidenceA } = await createCareerWithTwoEvidences();
    echoBullets();
    const created = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Base',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experienceId], evidenceIds: [evidenceA] },
          { kind: 'custom', title: 'Talks', items: ['First talk'] },
        ],
      })
      .expect(202);
    await runProcessor(created.body.id as string);
    const before = await request(app.getHttpServer()).get(`/resumes/${created.body.id}`).expect(200);
    const custom = before.body.sections.find((section: SectionView) => section.kind === 'custom');
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');

    const added = await request(app.getHttpServer()).post(`/sections/${custom.id}/items`).send({ text: 'Second talk' }).expect(200);
    const customAfter = added.body.sections.find((section: SectionView) => section.id === custom.id);
    expect(customAfter.entries.some((entry: EntryView) => entry.heading === 'Second talk')).toBe(true);

    await request(app.getHttpServer()).post(`/sections/${experience.id}/items`).send({ text: 'Nope' }).expect(422);
    await request(app.getHttpServer()).post(`/sections/${custom.id}/items`).send({ text: '' }).expect(400);
    await request(app.getHttpServer()).post('/sections/not-a-uuid/items').send({ text: 'x' }).expect(404);
  });
});

describe('DELETE /entries/:entryId', () => {
  it('should remove a custom entry and reject a typed entry with 422', async () => {
    const { experienceId, evidenceA } = await createCareerWithTwoEvidences();
    echoBullets();
    const created = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Base',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experienceId], evidenceIds: [evidenceA] },
          { kind: 'custom', title: 'Talks', items: ['First talk', 'Second talk'] },
        ],
      })
      .expect(202);
    await runProcessor(created.body.id as string);
    const before = await request(app.getHttpServer()).get(`/resumes/${created.body.id}`).expect(200);
    const custom = before.body.sections.find((section: SectionView) => section.kind === 'custom');
    const experience = before.body.sections.find((section: SectionView) => section.kind === 'experience');
    const customEntry = custom.entries[0];
    const typedEntry = experience.entries[0];

    const removed = await request(app.getHttpServer()).delete(`/entries/${customEntry.id}`).expect(200);
    const customAfter = removed.body.sections.find((section: SectionView) => section.id === custom.id);
    expect(customAfter.entries.some((entry: EntryView) => entry.id === customEntry.id)).toBe(false);

    await request(app.getHttpServer()).delete(`/entries/${typedEntry.id}`).expect(422);
    await request(app.getHttpServer()).delete('/entries/not-a-uuid').expect(404);
  });
});

describe('POST /resumes/:resumeId/sections', () => {
  it('should create a custom section and return its id', async () => {
    const { experienceId, evidenceA } = await createCareerWithTwoEvidences();
    const baseId = await createReadyBase(experienceId, [evidenceA]);

    const created = await request(app.getHttpServer())
      .post(`/resumes/${baseId}/sections`)
      .send({ kind: 'custom', title: 'Awards', ordinal: 5, items: ['Best talk'] })
      .expect(201);
    expect(typeof created.body.id).toBe('string');

    const after = await request(app.getHttpServer()).get(`/resumes/${baseId}`).expect(200);
    expect(after.body.sections.some((section: SectionView) => section.id === created.body.id)).toBe(true);
  });
});
