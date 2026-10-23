import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import {
  careerProfiles,
  contactDetails,
  educationEntries,
  evidences,
  experiences,
  resumeBullets,
  resumeEntries,
  resumeExports,
  resumeSectionSkills,
  resumeSections,
  resumes,
  skills,
} from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeRepository } from '../src/modules/resume/resume.repository';
import { ResumeDocumentRepository } from '../src/modules/resume/resume-document.repository';
import { PdfDocumentExtractor } from '../src/modules/resume-import/pdf-document-extractor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_resume_export_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/9';

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

const aiComplete = vi.fn(async () => ({ bullets: [] }));

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function seedResume(): Promise<{ resumeId: string; bulletId: string; suggestionText: string }> {
  const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
  await db.insert(contactDetails).values({
    careerProfileId: profile!.id,
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+5511999999999',
    links: [{ title: null, url: 'https://linkedin.com/in/ada' }],
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
  await db.insert(educationEntries).values({
    careerProfileId: profile!.id,
    institution: 'MIT',
    degree: 'BS Computer Science',
    startedOn: '2016-09-01',
    endedOn: '2020-06-15',
  });
  const [evidence] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Shipped checkout flow' })
    .returning();
  const [resume] = await db
    .insert(resumes)
    .values({
      userId: LOCAL_USER_ID,
      kind: 'base',
      name: 'Backend focus',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: null,
      generationStatus: 'ready',
      failureReason: null,
      adaptationPlan: null,
    })
    .returning();
  const [experienceSection] = await db
    .insert(resumeSections)
    .values({ resumeId: resume!.id, kind: 'experience', title: null, ordinal: 0 })
    .returning();
  const [skillsSection] = await db
    .insert(resumeSections)
    .values({ resumeId: resume!.id, kind: 'skills', title: null, ordinal: 1 })
    .returning();
  const [experienceEntry] = await db
    .insert(resumeEntries)
    .values({
      sectionId: experienceSection!.id,
      ordinal: 0,
      experienceId: experience!.id,
      educationEntryId: null,
      heading: null,
    })
    .returning();
  const [skillsEntry] = await db
    .insert(resumeEntries)
    .values({ sectionId: skillsSection!.id, ordinal: 0, experienceId: null, educationEntryId: null, heading: null })
    .returning();
  const [assumedBullet] = await db
    .insert(resumeBullets)
    .values({
      entryId: experienceEntry!.id,
      ordinal: 0,
      text: 'Shipped checkout flow',
      evidenceId: evidence!.id,
      status: 'assumed',
      suggestionQuestion: null,
      requirementId: null,
      gapKind: null,
      needsReview: false,
      editedByPerson: false,
    })
    .returning();
  const suggestionText = 'Draft suggestion text that must stay out of the pdf';
  await db.insert(resumeBullets).values({
    entryId: experienceEntry!.id,
    ordinal: 1,
    text: suggestionText,
    evidenceId: null,
    status: 'suggestion',
    suggestionQuestion: 'Do you have this experience?',
    requirementId: null,
    gapKind: null,
    needsReview: false,
    editedByPerson: false,
  });
  await db.insert(resumeBullets).values({
    entryId: skillsEntry!.id,
    ordinal: 0,
    text: 'TypeScript',
    evidenceId: evidence!.id,
    status: 'assumed',
    suggestionQuestion: null,
    requirementId: null,
    gapKind: null,
    needsReview: false,
    editedByPerson: false,
  });
  const [profileSkill] = await db
    .insert(skills)
    .values({ careerProfileId: profile!.id, name: 'TypeScript', group: null })
    .returning();
  await db.insert(resumeSectionSkills).values({
    sectionId: skillsSection!.id,
    skillId: profileSkill!.id,
    ordinal: 0,
  });
  return { resumeId: resume!.id, bulletId: assumedBullet!.id, suggestionText };
}

async function seedTwoPageResume(): Promise<{ resumeId: string }> {
  const [profile] = await db.insert(careerProfiles).values({ userId: LOCAL_USER_ID }).returning();
  await db.insert(contactDetails).values({
    careerProfileId: profile!.id,
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+5511999999999',
    links: [{ title: null, url: 'https://linkedin.com/in/ada' }],
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
  const [evidence] = await db
    .insert(evidences)
    .values({ careerProfileId: profile!.id, experienceId: experience!.id, statement: 'Shipped checkout flow' })
    .returning();
  const [resume] = await db
    .insert(resumes)
    .values({
      userId: LOCAL_USER_ID,
      kind: 'base',
      name: 'Backend focus long',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: null,
      generationStatus: 'ready',
      failureReason: null,
      adaptationPlan: null,
    })
    .returning();
  const [section] = await db
    .insert(resumeSections)
    .values({ resumeId: resume!.id, kind: 'experience', title: null, ordinal: 0 })
    .returning();
  const longText =
    'Shipped checkout flow with metrics, alerts and on-call support for a high-traffic store ';
  for (let entryIndex = 0; entryIndex < 10; entryIndex += 1) {
    const [entry] = await db
      .insert(resumeEntries)
      .values({
        sectionId: section!.id,
        ordinal: entryIndex,
        experienceId: experience!.id,
        educationEntryId: null,
        heading: null,
      })
      .returning();
    for (let bulletIndex = 0; bulletIndex < 4; bulletIndex += 1) {
      await db.insert(resumeBullets).values({
        entryId: entry!.id,
        ordinal: bulletIndex,
        text: `${longText}(${entryIndex}/${bulletIndex})`,
        evidenceId: evidence!.id,
        status: 'assumed',
        suggestionQuestion: null,
        requirementId: null,
        gapKind: null,
        needsReview: false,
        editedByPerson: false,
      });
    }
  }
  return { resumeId: resume!.id };
}

function readMediaBoxes(pdf: Buffer): Array<{ width: number; height: number }> {
  const text = pdf.toString('latin1');
  const pattern = /\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/g;
  const boxes: Array<{ width: number; height: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    boxes.push({ width: Number(match[1]), height: Number(match[2]) });
  }
  return boxes;
}

async function downloadPdf(exportId: string): Promise<{ body: Buffer; headers: Record<string, string> }> {
  const response = await request(app.getHttpServer()).get(`/exports/${exportId}/pdf`).expect(200);
  const contentType = String(response.headers['content-type'] ?? '');
  const disposition = String(response.headers['content-disposition'] ?? '');
  expect(contentType).toContain('application/pdf');
  expect(disposition).toContain('attachment');
  expect(disposition).toContain('.pdf');
  const body = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body as Uint8Array);
  expect(body.length).toBeGreaterThan(1000);
  expect(body.subarray(0, 4).toString()).toBe('%PDF');
  return { body, headers: { contentType, disposition } };
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
}, 180_000);

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

describe('POST /resumes/:resumeId/exports', () => {
  it('should export a selectable A4 pdf without unconfirmed suggestions', async () => {
    const { resumeId, suggestionText } = await seedResume();

    const response = await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(201);
    expect(response.body.exportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.pageCount).toBeGreaterThan(0);
    expect(response.body.exceedsLengthTarget).toBe(response.body.pageCount > 1);

    const { body } = await downloadPdf(response.body.exportId);
    const extractor = new PdfDocumentExtractor();
    const extracted = await extractor.extract({ content: body, filename: 'export.pdf' });
    expect(extracted.hasTextLayer).toBe(true);
    expect(extracted.pageCount).toBe(response.body.pageCount);
    expect(extracted.readingOrderText).toContain('Shipped checkout flow');
    expect(extracted.readingOrderText).toContain('Ada Lovelace');
    expect(extracted.readingOrderText).toContain('Acme');
    expect(extracted.readingOrderText).not.toContain(suggestionText);
    const experienceIndex = extracted.readingOrderText.indexOf('Professional Experience');
    const skillsIndex = extracted.readingOrderText.indexOf('Skills');
    expect(experienceIndex).toBeGreaterThan(-1);
    expect(skillsIndex).toBeGreaterThan(-1);
    expect(experienceIndex).toBeLessThan(skillsIndex);
  }, 90_000);

  it('should keep the old file byte for byte and create a second record on re-export', async () => {
    const { resumeId, bulletId } = await seedResume();

    const first = await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(201);
    const { body: firstPdf } = await downloadPdf(first.body.exportId);

    await request(app.getHttpServer()).put(`/bullets/${bulletId}`).send({ text: 'Shipped checkout flow v2' }).expect(200);

    const { body: samePdf } = await downloadPdf(first.body.exportId);
    expect(samePdf.equals(firstPdf)).toBe(true);

    const second = await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(201);
    expect(second.body.exportId).not.toBe(first.body.exportId);
    const { body: secondPdf } = await downloadPdf(second.body.exportId);
    expect(secondPdf.equals(firstPdf)).toBe(false);

    const rows = await db.select().from(resumeExports);
    expect(rows.length).toBe(2);
  }, 120_000);

  it('should answer 404 for an unknown resume', async () => {
    await request(app.getHttpServer()).post('/resumes/00000000-0000-4000-8000-000000000000/exports').expect(404);
  });
});

describe('GET /resumes export history', () => {
  it('should list exports with date and page count but never the pdf bytes', async () => {
    const { resumeId } = await seedResume();
    const exported = await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(201);

    const list = await request(app.getHttpServer()).get('/resumes').expect(200);
    const own = (list.body.resumes as Array<{ id: string; exports: Array<Record<string, unknown>> }>).find(
      (entry) => entry.id === resumeId,
    );
    expect(own).toBeDefined();
    expect(own!.exports.length).toBe(1);
    expect(own!.exports[0]).toEqual({
      id: exported.body.exportId,
      pageCount: exported.body.pageCount,
      createdAt: expect.any(String),
    });
    expect(own!.exports[0]).not.toHaveProperty('pdf');
  }, 90_000);

  it('should not load the pdf column in findDocument and listByUser', async () => {
    const { resumeId } = await seedResume();
    await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(201);
    const repository = new ResumeRepository(
      db as unknown as Database,
      new ResumeDocumentRepository(db as unknown as Database),
    );

    const document = await repository.findDocument(resumeId, LOCAL_USER_ID);
    expect(document).toBeDefined();
    expect(document!.exports.length).toBe(1);
    expect(document!.exports[0]).not.toHaveProperty('pdf');
    expect(document!.exports[0]).toHaveProperty('id');
    expect(document!.exports[0]).toHaveProperty('pageCount');
    expect(document!.exports[0]).toHaveProperty('createdAt');

    const rows = await repository.listByUser(LOCAL_USER_ID);
    expect(rows.length).toBe(1);
    expect(rows[0]!.exports.length).toBe(1);
    expect(rows[0]!.exports[0]).not.toHaveProperty('pdf');
  }, 90_000);
});

describe('GET /exports/:exportId/pdf', () => {
  it('should answer 404 for an unknown export', async () => {
    await request(app.getHttpServer()).get('/exports/00000000-0000-4000-8000-000000000000/pdf').expect(404);
  });

  it('should answer 422 when the document is generating', async () => {
    const { resumeId } = await seedResume();
    await db.update(resumes).set({ generationStatus: 'generating' }).where(eq(resumes.id, resumeId));

    await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(422);
  });

  it('should answer 422 when the document generation failed', async () => {
    const { resumeId } = await seedResume();
    await db
      .update(resumes)
      .set({ generationStatus: 'failed', failureReason: 'ai_unavailable' })
      .where(eq(resumes.id, resumeId));

    await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(422);
  });
});

describe('POST /resumes/:resumeId/exports two pages', () => {
  it('should count 2 pages like the extractor, flag the length target and keep A4', async () => {
    const { resumeId } = await seedTwoPageResume();

    const response = await request(app.getHttpServer()).post(`/resumes/${resumeId}/exports`).expect(201);
    expect(response.body.pageCount).toBe(2);
    expect(response.body.exceedsLengthTarget).toBe(true);

    const { body } = await downloadPdf(response.body.exportId);
    const extractor = new PdfDocumentExtractor();
    const extracted = await extractor.extract({ content: body, filename: 'long.pdf' });
    expect(extracted.hasTextLayer).toBe(true);
    expect(extracted.pageCount).toBe(2);
    expect(extracted.pageCount).toBe(response.body.pageCount);

    const boxes = readMediaBoxes(body);
    expect(boxes.length).toBe(response.body.pageCount);
    for (const box of boxes) {
      expect(Math.abs(box.width - 595)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.height - 842)).toBeLessThanOrEqual(1);
    }
  }, 120_000);

  it('should complete two simultaneous exports of the same resume', async () => {
    const { resumeId } = await seedResume();
    const server = app.getHttpServer();

    const [first, second] = await Promise.all([
      request(server).post(`/resumes/${resumeId}/exports`).expect(201),
      request(server).post(`/resumes/${resumeId}/exports`).expect(201),
    ]);
    expect(first.body.exportId).not.toBe(second.body.exportId);

    const [{ body: firstPdf }, { body: secondPdf }] = await Promise.all([
      downloadPdf(first.body.exportId),
      downloadPdf(second.body.exportId),
    ]);
    expect(firstPdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(secondPdf.subarray(0, 4).toString()).toBe('%PDF');
  }, 120_000);
});
