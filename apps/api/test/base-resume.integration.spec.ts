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
  contactDetails,
  educationEntries,
  evidences,
  experiences,
  resumeBullets,
  resumeEntries,
  resumeSections,
  resumes,
  skills,
} from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { UnrecoverableError } from 'bullmq';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import {
  AiKeyRejectedError,
  AiUnavailableError,
} from '../src/modules/ai/ai-errors';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeDocumentRepository } from '../src/modules/resume/resume-document.repository';
import { ResumeRepository } from '../src/modules/resume/resume.repository';
import { ResumeWritingProcessor } from '../src/modules/resume/writing/resume-writing.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_base_resume_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/15';

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
  async (..._args: unknown[]): Promise<{ bullets: Array<{ evidenceId: string; text: string }> }> => ({
    bullets: [],
  }),
);

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function createCareerProfileWithData(): Promise<{
  profileId: string;
  experienceId: string;
  evidenceIds: string[];
}> {
  const [profile] = await db
    .insert(careerProfiles)
    .values({ userId: LOCAL_USER_ID })
    .returning();
  const [experience] = await db
    .insert(experiences)
    .values({
      careerProfileId: profile!.id,
      company: 'Acme',
      role: 'Engineer',
      startedOn: '2020-01-01',
      endedOn: '2023-01-01',
    })
    .returning();
  const [evidenceA] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Led team of five engineers' })
    .returning();
  const [evidenceB] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Shipped checkout flow' })
    .returning();
  return { profileId: profile!.id, experienceId: experience!.id, evidenceIds: [evidenceA!.id, evidenceB!.id] };
}

function fakeJob(resumeId: string, attemptsMade: number): never {
  return {
    data: { resumeId, userId: LOCAL_USER_ID },
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: async () => undefined,
  } as never;
}

async function runWriter(resumeId: string, attemptsMade = 0): Promise<void> {
  const repository = new ResumeRepository(
    db as unknown as Database,
    new ResumeDocumentRepository(db as unknown as Database),
  );
  const processor = new ResumeWritingProcessor(
    db as unknown as Database,
    { complete: aiComplete } as unknown as AiClient,
    repository,
  );
  await processor.process(fakeJob(resumeId, attemptsMade));
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
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('POST /base-resumes', () => {
  it('should return 202, write the structure and move from generating to ready', async () => {
    const { experienceId, evidenceIds } = await createCareerProfileWithData();
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as { payload: { evidences: Array<{ id: string }> } };
      return {
        bullets: request.payload.evidences.map((evidence) => ({
          evidenceId: evidence.id,
          text: 'Led team of five engineers at Acme',
        })),
      };
    });

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Backend focus',
        language: 'en',
        sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }],
      })
      .expect(202);

    expect(createResponse.body.id).toBeDefined();
    const resumeId = createResponse.body.id as string;

    const generating = await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(200);
    expect(generating.body.generationStatus).toBe('generating');

    await runWriter(resumeId);

    const ready = await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(200);
    expect(ready.body.generationStatus).toBe('ready');
    const bullets = ready.body.sections.flatMap(
      (section: { entries: Array<{ bullets: unknown[] }> }) =>
        section.entries.flatMap((entry) => entry.bullets),
    );
    expect(bullets).toHaveLength(2);
  });

  it('should return 422 without a confirmed Career Profile', async () => {
    const response = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({ name: 'No profile' })
      .expect(422);

    expect(response.body.message).toMatch(/Career Profile/);
  });

  it('should default lengthTarget to 2 past five years and 1 otherwise', async () => {
    const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
    await db.insert(experiences).values({
      careerProfileId: profile!.id,
      company: 'Long Co',
      role: 'Engineer',
      startedOn: '2010-01-01',
      endedOn: '2020-01-01',
    });
    aiComplete.mockImplementation(async () => ({ bullets: [] }));

    const longResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({ name: 'Long career' })
      .expect(202);
    const longDoc = await request(app.getHttpServer()).get(`/resumes/${longResponse.body.id}`).expect(200);
    expect(longDoc.body.lengthTarget).toBe(2);

    await resetDatabase(pool);
    const [shortProfile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
    await db.insert(experiences).values({
      careerProfileId: shortProfile!.id,
      company: 'Short Co',
      role: 'Engineer',
      startedOn: '2022-01-01',
      endedOn: '2023-01-01',
    });

    const shortResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({ name: 'Short career' })
      .expect(202);
    const shortDoc = await request(app.getHttpServer()).get(`/resumes/${shortResponse.body.id}`).expect(200);
    expect(shortDoc.body.lengthTarget).toBe(1);
  });
});

describe('Base Resume bullets', () => {
  it('should write one bullet per evidence with no evidence in two sections', async () => {
    const { experienceId, evidenceIds } = await createCareerProfileWithData();
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as { promptName?: string; payload: { evidences?: Array<{ id: string }> } };
      if (request.promptName === 'synthesize-section' || request.payload.evidences === undefined) {
        return { bullets: [] };
      }
      return {
        bullets: request.payload.evidences.map((evidence) => ({
          evidenceId: evidence.id,
          text: 'Led team of five engineers at Acme',
        })),
      };
    });

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Dedup check',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experienceId], evidenceIds },
          { kind: 'skills', evidenceIds },
        ],
      })
      .expect(202);

    await runWriter(createResponse.body.id as string);

    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    const bullets = doc.body.sections.flatMap(
      (section: { entries: Array<{ bullets: Array<{ evidenceId: string }> }> }) =>
        section.entries.flatMap((entry) => entry.bullets),
    );
    expect(bullets).toHaveLength(2);
    const evidenceIdList = bullets.map((bullet: { evidenceId: string }) => bullet.evidenceId);
    expect(new Set(evidenceIdList).size).toBe(2);
  });

  it('should turn text with an unsupported number into a suggestion', async () => {
    const { experienceId, evidenceIds } = await createCareerProfileWithData();
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as { payload: { evidences: Array<{ id: string }> } };
      return {
        bullets: request.payload.evidences.map((evidence) => ({
          evidenceId: evidence.id,
          text: 'Reduced latency by 30% tuning queries',
        })),
      };
    });

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Claim check',
        language: 'en',
        sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }],
      })
      .expect(202);

    await runWriter(createResponse.body.id as string);

    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    const bullets = doc.body.sections.flatMap(
      (section: { entries: Array<{ bullets: Array<{ status: string; gapKind: string; suggestionQuestion: string }> }> }) =>
        section.entries.flatMap((entry) => entry.bullets),
    );
    expect(bullets).toHaveLength(2);
    for (const bullet of bullets) {
      expect(bullet.status).toBe('suggestion');
      expect(bullet.gapKind).toBe('detail');
      expect(bullet.suggestionQuestion).toContain('30%');
    }
  });
});

describe('BUG-13 summary and skills synthesis', () => {
  it('should write experience per evidence with the summary from the career and skills from the profile', async () => {
    const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
    const [experience] = await db
      .insert(experiences)
      .values({
        careerProfileId: profile!.id,
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2020-01-01',
        endedOn: '2023-01-01',
      })
      .returning();
    const [evidenceA] = await db
      .insert(evidences)
      .values({
        careerProfileId: profile!.id,
        experienceId: experience!.id,
        statement: 'Led team of five engineers using TypeScript',
      })
      .returning();
    const [evidenceB] = await db
      .insert(evidences)
      .values({
        careerProfileId: profile!.id,
        experienceId: experience!.id,
        statement: 'Shipped checkout flow with React',
      })
      .returning();
    const evidenceIds = [evidenceA!.id, evidenceB!.id];
    const [skillTypeScript] = await db
      .insert(skills)
      .values({ careerProfileId: profile!.id, name: 'TypeScript', group: null })
      .returning();
    const [skillReact] = await db
      .insert(skills)
      .values({ careerProfileId: profile!.id, name: 'React', group: 'Front-end' })
      .returning();
    const seenPrompts: Array<{ promptName: string; sectionKind?: string }> = [];
    aiComplete.mockImplementation((async (...args: unknown[]) => {
      const request = args[0] as {
        promptName: string;
        payload: { evidences?: Array<{ id: string }>; sectionKind?: string };
      };
      seenPrompts.push({ promptName: request.promptName, sectionKind: request.payload.sectionKind });
      if (request.promptName === 'write-profile-summary') {
        return {
          bullets: [
            { text: 'Experienced engineer working with modern stacks.' },
            { text: 'Focused on delivery and collaboration.' },
          ],
        };
      }
      const evidencesInput = (request.payload.evidences ?? []) as Array<{ id: string }>;
      return {
        bullets: evidencesInput.map((evidence) => ({
          evidenceId: evidence.id,
          text: evidence.id === evidenceA!.id ? 'Led team of five engineers using TypeScript' : 'Shipped checkout flow with React',
        })),
      };
    }) as never);

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Synthesis check',
        language: 'en',
        sections: [
          { kind: 'summary', evidenceIds },
          { kind: 'experience', experienceIds: [experience!.id], evidenceIds },
          { kind: 'skills', skillIds: [skillTypeScript!.id, skillReact!.id] },
        ],
      })
      .expect(202);

    await runWriter(createResponse.body.id as string);

    expect(seenPrompts.map((call) => call.promptName)).toContain('write-profile-summary');
    expect(seenPrompts.map((call) => call.promptName)).not.toContain('synthesize-section');
    for (const call of seenPrompts) {
      expect(call.sectionKind).not.toBe('skills');
    }
    const doc = await request(app.getHttpServer()).get(`/resumes/${createResponse.body.id}`).expect(200);
    const experienceSection = doc.body.sections.find((section: { kind: string }) => section.kind === 'experience');
    const experienceBullets = experienceSection.entries.flatMap(
      (entry: { bullets: Array<{ evidenceId: string | null }> }) => entry.bullets,
    );
    expect(experienceBullets).toHaveLength(2);
    for (const bullet of experienceBullets) {
      expect(bullet.evidenceId).not.toBeNull();
    }
    const experienceIds = experienceBullets.map((bullet: { evidenceId: string }) => bullet.evidenceId);
    expect(new Set(experienceIds).size).toBe(2);
    const summarySection = doc.body.sections.find((section: { kind: string }) => section.kind === 'summary');
    const summaryBullets = summarySection.entries.flatMap(
      (entry: { bullets: Array<{ evidenceId: string | null; text: string }> }) => entry.bullets,
    );
    expect(summaryBullets.length).toBeGreaterThanOrEqual(2);
    for (const bullet of summaryBullets) {
      expect(bullet.evidenceId).toBeNull();
    }
    const skillsSection = doc.body.sections.find((section: { kind: string }) => section.kind === 'skills');
    const skillTexts = skillsSection.entries.flatMap(
      (entry: { bullets: Array<{ evidenceId: string | null; text: string }> }) => entry.bullets,
    ).map((bullet: { text: string }) => bullet.text);
    expect(skillTexts).toContain('TypeScript');
    expect(skillTexts).toContain('React');
    expect(skillTexts).not.toContain('Operated Kubernetes clusters');
  });
});

describe('ResumeWritingProcessor failure policy', () => {
  it('should mark ai_key_rejected without retry when the key is rejected', async () => {
    const { experienceId, evidenceIds } = await createCareerProfileWithData();
    aiComplete.mockImplementation(async () => ({ bullets: [] }));
    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Key rejected',
        language: 'en',
        sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }],
      })
      .expect(202);
    const resumeId = createResponse.body.id as string;
    aiComplete.mockRejectedValue(new AiKeyRejectedError());
    const repository = new ResumeRepository(
      db as unknown as Database,
      new ResumeDocumentRepository(db as unknown as Database),
    );
    const processor = new ResumeWritingProcessor(
      db as unknown as Database,
      { complete: aiComplete } as unknown as AiClient,
      repository,
    );

    await expect(processor.process(fakeJob(resumeId, 0))).rejects.toBeInstanceOf(UnrecoverableError);

    const [row] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
    expect(row?.generationStatus).toBe('failed');
    expect(row?.failureReason).toBe('ai_key_rejected');
  });

  it('should retry transient failures and mark ai_unavailable only on the last attempt', async () => {
    const { experienceId, evidenceIds } = await createCareerProfileWithData();
    aiComplete.mockImplementation(async () => ({ bullets: [] }));
    const firstResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Transient first',
        language: 'en',
        sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }],
      })
      .expect(202);
    const firstId = firstResponse.body.id as string;
    aiComplete.mockRejectedValue(new AiUnavailableError(503));
    const repository = new ResumeRepository(
      db as unknown as Database,
      new ResumeDocumentRepository(db as unknown as Database),
    );
    const firstProcessor = new ResumeWritingProcessor(
      db as unknown as Database,
      { complete: aiComplete } as unknown as AiClient,
      repository,
    );

    await expect(firstProcessor.process(fakeJob(firstId, 0))).rejects.toBeInstanceOf(AiUnavailableError);
    const [firstRow] = await db.select().from(resumes).where(eq(resumes.id, firstId));
    expect(firstRow?.generationStatus).toBe('generating');

    const secondResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Transient last',
        language: 'en',
        sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }],
      })
      .expect(202);
    const lastId = secondResponse.body.id as string;
    const lastProcessor = new ResumeWritingProcessor(
      db as unknown as Database,
      { complete: aiComplete } as unknown as AiClient,
      repository,
    );

    await expect(lastProcessor.process(fakeJob(lastId, 2))).rejects.toBeInstanceOf(AiUnavailableError);
    const [lastRow] = await db.select().from(resumes).where(eq(resumes.id, lastId));
    expect(lastRow?.generationStatus).toBe('failed');
    expect(lastRow?.failureReason).toBe('ai_unavailable');
  });
});

describe('PUT /resumes/:resumeId/structure and settings', () => {
  it('should reorder and remove sections without touching the Career Profile', async () => {
    const { profileId, experienceId, evidenceIds } = await createCareerProfileWithData();
    await db.insert(educationEntries).values({
      careerProfileId: profileId,
      institution: 'MIT',
      degree: 'BS',
      startedOn: '2015',
      endedOn: '2019',
    });
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as { promptName?: string; payload: { evidences?: Array<{ id: string }> } };
      if (request.promptName === 'synthesize-section' || request.payload.evidences === undefined) {
        return { bullets: [] };
      }
      return {
        bullets: request.payload.evidences.map((evidence) => ({
          evidenceId: evidence.id,
          text: 'Led team of five engineers at Acme',
        })),
      };
    });

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Structure check',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experienceId], evidenceIds },
          { kind: 'skills', evidenceIds: [] },
        ],
      })
      .expect(202);
    const resumeId = createResponse.body.id as string;
    await runWriter(resumeId);

    const before = await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(200);
    expect(before.body.sections).toHaveLength(2);
    const keepId = before.body.sections[1].id as string;

    const updated = await request(app.getHttpServer())
      .put(`/resumes/${resumeId}/structure`)
      .send({ sections: [{ id: keepId, ordinal: 0 }] })
      .expect(200);
    expect(updated.body.sections).toHaveLength(1);
    expect(updated.body.sections[0].id).toBe(keepId);

    const evidencesAfter = await db.select().from(evidences).where(eq(evidences.careerProfileId, profileId));
    expect(evidencesAfter).toHaveLength(2);
    const experiencesAfter = await db.select().from(experiences).where(eq(experiences.careerProfileId, profileId));
    expect(experiencesAfter).toHaveLength(1);
  });

  it('should update settings', async () => {
    await createCareerProfileWithData();
    aiComplete.mockImplementation(async () => ({ bullets: [] }));
    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({ name: 'Settings check' })
      .expect(202);
    const resumeId = createResponse.body.id as string;

    const updated = await request(app.getHttpServer())
      .put(`/resumes/${resumeId}/settings`)
      .send({ template: 'dense', tone: 'technical' })
      .expect(200);
    expect(updated.body.template).toBe('dense');
    expect(updated.body.tone).toBe('technical');
  });

  it('should list resumes and create a section', async () => {
    await createCareerProfileWithData();
    aiComplete.mockImplementation(async () => ({ bullets: [] }));
    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({ name: 'List check' })
      .expect(202);

    const list = await request(app.getHttpServer()).get('/resumes').expect(200);
    expect(list.body.resumes.length).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .post(`/resumes/${createResponse.body.id}/sections`)
      .send({ kind: 'custom', title: 'Publications', ordinal: 0 })
      .expect(201);
  });
});

describe('DELETE /resumes/:resumeId', () => {
  it('should delete the whole document by cascade and keep the Career Profile', async () => {
    const { profileId, experienceId, evidenceIds } = await createCareerProfileWithData();
    aiComplete.mockImplementation(async (...args: unknown[]) => {
      const request = args[0] as { payload: { evidences: Array<{ id: string }> } };
      return {
        bullets: request.payload.evidences.map((evidence) => ({
          evidenceId: evidence.id,
          text: 'Led team of five engineers at Acme',
        })),
      };
    });

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Delete check',
        language: 'en',
        sections: [{ kind: 'experience', experienceIds: [experienceId], evidenceIds }],
      })
      .expect(202);
    const resumeId = createResponse.body.id as string;
    await runWriter(resumeId);

    await request(app.getHttpServer()).delete(`/resumes/${resumeId}`).expect(200);
    await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(404);

    const resumeRows = await db.select().from(resumes).where(eq(resumes.id, resumeId));
    const sectionRows = await db.select().from(resumeSections).where(eq(resumeSections.resumeId, resumeId));
    expect(resumeRows).toHaveLength(0);
    expect(sectionRows).toHaveLength(0);
    const entryRows = await db.select().from(resumeEntries);
    const bulletRows = await db.select().from(resumeBullets);
    expect(entryRows).toHaveLength(0);
    expect(bulletRows).toHaveLength(0);

    const profileRows = await db.select().from(careerProfiles).where(eq(careerProfiles.id, profileId));
    expect(profileRows).toHaveLength(1);
    const evidenceRows = await db.select().from(evidences).where(eq(evidences.careerProfileId, profileId));
    expect(evidenceRows).toHaveLength(2);
  });
});

describe('GET /resumes/:id document rendering fields', () => {
  it('should return profile contact and resolved experience and education entries', async () => {
    const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
    await db.insert(contactDetails).values({
      careerProfileId: profile!.id,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      links: null,
    });
    const [experience] = await db
      .insert(experiences)
      .values({
        careerProfileId: profile!.id,
        company: 'Acme',
        role: 'Engineer',
        startedOn: '2020-01-01',
        endedOn: '2023-01-01',
      })
      .returning();
    const [education] = await db
      .insert(educationEntries)
      .values({
        careerProfileId: profile!.id,
        institution: 'USP',
        degree: 'Computer Science',
        startedOn: '2016-01-01',
        endedOn: '2019-12-31',
      })
      .returning();
    aiComplete.mockImplementation(async () => ({ bullets: [] }));

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Backend focus',
        language: 'en',
        sections: [
          { kind: 'experience', experienceIds: [experience!.id], evidenceIds: [] },
          { kind: 'education', educationEntryIds: [education!.id], evidenceIds: [] },
        ],
      })
      .expect(202);
    const resumeId = createResponse.body.id as string;
    await runWriter(resumeId);

    const document = await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(200);
    expect(document.body.name).toBe('Backend focus');
    expect(document.body.contact.name).toBe('Ada Lovelace');
    expect(document.body.contact.name).not.toBe(document.body.name);
    expect(document.body.contact.email).toBe('ada@example.com');
    const experienceSection = document.body.sections.find(
      (section: { kind: string }) => section.kind === 'experience',
    );
    const experienceEntry = experienceSection.entries[0];
    expect(experienceEntry.company).toBe('Acme');
    expect(experienceEntry.role).toBe('Engineer');
    expect(experienceEntry.period).toBe('2020-01-01 – 2023-01-01');
    const educationSection = document.body.sections.find(
      (section: { kind: string }) => section.kind === 'education',
    );
    const educationEntry = educationSection.entries[0];
    expect(educationEntry.institution).toBe('USP');
    expect(educationEntry.degree).toBe('Computer Science');
    expect(educationEntry.period).toBe('2016-01-01 – 2019-12-31');
  });

  it('should return null contact details when the profile has no phone or links', async () => {
    const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
    await db.insert(contactDetails).values({
      careerProfileId: profile!.id,
      fullName: 'Ada Lovelace',
      email: null,
      phone: null,
      links: null,
    });
    aiComplete.mockImplementation(async () => ({ bullets: [] }));

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({ name: 'Minimal contact' })
      .expect(202);
    const document = await request(app.getHttpServer())
      .get(`/resumes/${createResponse.body.id}`)
      .expect(200);
    expect(document.body.contact.name).toBe('Ada Lovelace');
    expect(document.body.contact.phone).toBeNull();
    expect(document.body.contact.links).toBeNull();
  });
});

describe('BUG-28 synthesis in a single final transaction', () => {
  it('should keep a single synthesis entry when the first attempt fails and the retry succeeds', async () => {
    const { profileId, experienceId, evidenceIds } = await createCareerProfileWithData();
    await db.insert(schema.skills).values({ careerProfileId: profileId, name: 'TypeScript', group: null });
    let writeCalls = 0;
    aiComplete.mockImplementation((async (...args: unknown[]) => {
      const request = args[0] as {
        promptName: string;
        payload: { evidences?: Array<{ id: string }>; sectionKind?: string };
      };
      if (request.promptName === 'write-profile-summary') {
        return {
          bullets: [
            { text: 'Experienced engineer working with modern stacks.' },
            { text: 'Focused on delivery and collaboration.' },
          ],
        };
      }
      writeCalls += 1;
      if (writeCalls === 1) {
        throw new AiUnavailableError(503);
      }
      const list = (request.payload.evidences ?? []) as Array<{ id: string }>;
      return {
        bullets: list.map((evidence) => ({
          evidenceId: evidence.id,
          text: 'Led team of five engineers at Acme',
        })),
      };
    }) as never);

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Retry check',
        language: 'en',
        sections: [
          { kind: 'summary', evidenceIds },
          { kind: 'experience', experienceIds: [experienceId], evidenceIds },
          { kind: 'skills', evidenceIds },
        ],
      })
      .expect(202);
    const resumeId = createResponse.body.id as string;

    await expect(runWriter(resumeId, 0)).rejects.toBeInstanceOf(AiUnavailableError);
    const pending = await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(200);
    expect(pending.body.generationStatus).toBe('generating');
    const pendingSummary = pending.body.sections.find((section: { kind: string }) => section.kind === 'summary');
    expect(pendingSummary.entries).toHaveLength(0);

    await runWriter(resumeId, 1);
    const doc = await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(200);
    expect(doc.body.generationStatus).toBe('ready');
    const summary = doc.body.sections.find((section: { kind: string }) => section.kind === 'summary');
    expect(summary.entries).toHaveLength(1);
    const skills = doc.body.sections.find((section: { kind: string }) => section.kind === 'skills');
    expect(skills.entries).toHaveLength(1);
  });

  it('should write no synthesis bullets when the generation fails definitively', async () => {
    const { experienceId, evidenceIds } = await createCareerProfileWithData();
    aiComplete.mockImplementation((async (...args: unknown[]) => {
      const request = args[0] as {
        promptName: string;
        payload: { evidences?: Array<{ id: string }>; sectionKind?: string };
      };
      if (request.promptName === 'synthesize-section') {
        return { bullets: [{ text: 'Experienced engineer working with modern stacks.' }] };
      }
      throw new AiUnavailableError(503);
    }) as never);

    const createResponse = await request(app.getHttpServer())
      .post('/base-resumes')
      .send({
        name: 'Failed check',
        language: 'en',
        sections: [
          { kind: 'summary', evidenceIds },
          { kind: 'experience', experienceIds: [experienceId], evidenceIds },
          { kind: 'skills', evidenceIds },
        ],
      })
      .expect(202);
    const resumeId = createResponse.body.id as string;

    await expect(runWriter(resumeId, 2)).rejects.toBeInstanceOf(AiUnavailableError);
    const doc = await request(app.getHttpServer()).get(`/resumes/${resumeId}`).expect(200);
    expect(doc.body.generationStatus).toBe('failed');
    const summary = doc.body.sections.find((section: { kind: string }) => section.kind === 'summary');
    expect(summary.entries).toHaveLength(0);
    const skills = doc.body.sections.find((section: { kind: string }) => section.kind === 'skills');
    expect(skills.entries).toHaveLength(0);
  });
});
