import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import { resumeImports } from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { UnrecoverableError } from 'bullmq';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyRejectedError,
  AiUnavailableError,
} from '../src/modules/ai/ai-errors';
import { OBJECT_STORAGE } from '../src/modules/storage/object-storage';
import { InMemoryObjectStorage } from '../src/modules/storage/in-memory-object-storage';
import type { Database } from '../src/modules/database/database.provider';
import { ResumeImportProcessor } from '../src/modules/resume-import/resume-import.processor';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_resume_import_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/13';

const PDF_HEADER = Buffer.from('%PDF-1.4 test pdf content');
const LATEX_CONTENT = Buffer.from('\\documentclass{article}\\begin{document}Resume\\end{document}');
const HTML_CONTENT = Buffer.from('<!DOCTYPE html><html><body>Resume</body></html>');
const DOCX_CONTENT = Buffer.from('PK\x03\x04 fake docx');

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

const aiComplete = vi.fn(async () => ({
  isJobDescription: true,
  language: 'en',
  requirements: [{ literalTerm: 'Kubernetes', concept: 'Kubernetes', kind: 'mandatory' }],
}));
let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;
let storage: InMemoryObjectStorage;

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
  storage = new InMemoryObjectStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_CLIENT)
    .useValue({ complete: aiComplete } as unknown as AiClient)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
}, 120_000);

afterEach(() => {
  aiComplete.mockClear();
  aiComplete.mockImplementation(async () => ({
    isJobDescription: true,
    language: 'en',
    requirements: [{ literalTerm: 'Kubernetes', concept: 'Kubernetes', kind: 'mandatory' }],
  }));
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

describe('POST /resume-imports', () => {
  it('should accept a valid PDF, create a row with status queued, store the object, and enqueue a job', async () => {
    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .attach('file', PDF_HEADER, 'resume.pdf')
      .expect(202);

    expect(response.body.id).toBeDefined();
    expect(response.body.status).toBe('queued');
    expect(response.body.failureReason).toBeNull();

    const [row] = await db
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, response.body.id));
    expect(row).toBeDefined();
    expect(row?.status).toBe('queued');
    expect(row?.storageKey).toBeDefined();
    expect(row?.storageKey).toContain('source-documents/');
  });

  it('should accept a valid LaTeX file', async () => {
    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .attach('file', LATEX_CONTENT, 'resume.tex')
      .expect(202);

    expect(response.body.status).toBe('queued');
  });

  it('should accept a valid HTML file', async () => {
    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .attach('file', HTML_CONTENT, 'resume.html')
      .expect(202);

    expect(response.body.status).toBe('queued');
  });

  it('should reject a .docx file with 400 naming accepted formats', async () => {
    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .attach('file', DOCX_CONTENT, 'resume.docx')
      .expect(400);

    expect(response.body.message).toMatch(/Unsupported file format|PDF.*LaTeX.*HTML/);
  });

  it('should reject an unsupported format without creating row, object, or job', async () => {
    const beforeRows = await db.select({ id: resumeImports.id }).from(resumeImports);

    await request(app.getHttpServer())
      .post('/resume-imports')
      .attach('file', DOCX_CONTENT, 'resume.docx')
      .expect(400);

    const afterRows = await db.select({ id: resumeImports.id }).from(resumeImports);
    expect(afterRows).toHaveLength(beforeRows.length);
  });
});

describe('GET /resume-imports/:resumeImportId', () => {
  it('should return the import state for the owner', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/resume-imports')
      .attach('file', PDF_HEADER, 'resume.pdf')
      .expect(202);

    const getResponse = await request(app.getHttpServer())
      .get(`/resume-imports/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body.id).toBe(createResponse.body.id);
    expect(getResponse.body.status).toBe('queued');
  });

  it('should return 404 for a non-existent import', async () => {
    await request(app.getHttpServer())
      .get('/resume-imports/11111111-1111-4111-8111-111111111111')
      .expect(404);
  });
});

describe('ResumeImportProcessor failure policy', () => {
  const LONG_TEXT = 'Backend developer with eight years of Python experience at Northwind. '.repeat(5);

  function fakeExtractor() {
    return {
      extract: async () => ({
        hasTextLayer: true,
        readingOrderText: LONG_TEXT,
        pageCount: 1,
      }),
    };
  }

  function fakeJob(resumeImportId: string, attemptsMade: number) {
    return {
      data: { resumeImportId, userId: LOCAL_USER_ID },
      attemptsMade,
      opts: { attempts: 3 },
      updateProgress: async () => undefined,
    } as never;
  }

  async function createStoredImport(): Promise<{ id: string; storageKey: string }> {
    const storageKey = await storage.putSourceDocument({
      userId: LOCAL_USER_ID,
      content: PDF_HEADER,
      extension: '.pdf',
    });
    const [row] = await db
      .insert(resumeImports)
      .values({ userId: LOCAL_USER_ID, storageKey, status: 'queued' })
      .returning({ id: resumeImports.id });
    return { id: row!.id, storageKey };
  }

  async function readImport(id: string) {
    const [row] = await db.select().from(resumeImports).where(eq(resumeImports.id, id));
    return row;
  }

  it('should mark ai_key_rejected, remove the file, and not retry when the key is rejected', async () => {
    const { id, storageKey } = await createStoredImport();
    const processor = new ResumeImportProcessor(
      db as unknown as Database,
      storage,
      fakeExtractor() as never,
      { complete: async () => { throw new AiKeyRejectedError(); } } as unknown as AiClient,
    );

    await expect(processor.process(fakeJob(id, 0))).rejects.toBeInstanceOf(UnrecoverableError);

    const row = await readImport(id);
    expect(row?.status).toBe('failed');
    expect(row?.failureReason).toBe('ai_key_rejected');
    expect(row?.storageKey).toBeNull();
    await expect(storage.getSourceDocument(storageKey)).rejects.toThrow();
  });

  it('should mark ai_balance_exhausted and remove the file without retry', async () => {
    const { id, storageKey } = await createStoredImport();
    const processor = new ResumeImportProcessor(
      db as unknown as Database,
      storage,
      fakeExtractor() as never,
      { complete: async () => { throw new AiBalanceExhaustedError(); } } as unknown as AiClient,
    );

    await expect(processor.process(fakeJob(id, 0))).rejects.toBeInstanceOf(UnrecoverableError);

    const row = await readImport(id);
    expect(row?.status).toBe('failed');
    expect(row?.failureReason).toBe('ai_balance_exhausted');
    expect(row?.storageKey).toBeNull();
    await expect(storage.getSourceDocument(storageKey)).rejects.toThrow();
  });

  it('should keep the import queued on the first transient failure and mark ai_unavailable on the last', async () => {
    const first = await createStoredImport();
    const firstProcessor = new ResumeImportProcessor(
      db as unknown as Database,
      storage,
      fakeExtractor() as never,
      { complete: async () => { throw new AiUnavailableError(503); } } as unknown as AiClient,
    );

    await expect(firstProcessor.process(fakeJob(first.id, 0))).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    const firstRow = await readImport(first.id);
    expect(firstRow?.status).toBe('queued');

    const last = await createStoredImport();
    const lastProcessor = new ResumeImportProcessor(
      db as unknown as Database,
      storage,
      fakeExtractor() as never,
      { complete: async () => { throw new AiUnavailableError(503); } } as unknown as AiClient,
    );

    await expect(lastProcessor.process(fakeJob(last.id, 2))).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    const lastRow = await readImport(last.id);
    expect(lastRow?.status).toBe('failed');
    expect(lastRow?.failureReason).toBe('ai_unavailable');
    expect(lastRow?.storageKey).toBeNull();
    await expect(storage.getSourceDocument(last.storageKey)).rejects.toThrow();
  });

  it('should carry the extracted city in the draft', async () => {
    const textWithCity = [
      'Mariana Quartz',
      'Quixadá, CE',
      '',
      'Summary',
      'Backend developer focused on Python services for eight years.',
      '',
      'Experience',
      'Lead Engineer at Northwind Software from 2020 to 2024 with Python.',
    ].join('\n');
    const cityExtractor = {
      extract: async () => ({
        hasTextLayer: true,
        readingOrderText: textWithCity,
        pageCount: 1,
      }),
    };
    const cityAi = {
      complete: async (request: { promptName: string }) => {
        if (request.promptName === 'detect-writing-style') {
          return { writingMethod: 'xyz', tone: 'direct', averageBulletWords: 12 };
        }
        return {
          evidences: [{ statement: 'Backend developer with 8 years of Python experience' }],
          experiences: [
            { company: 'Northwind Software', role: 'Lead Engineer', startedOn: '2020', endedOn: '2024' },
          ],
          education: [],
        };
      },
    };
    const stored = await createStoredImport();
    const processor = new ResumeImportProcessor(
      db as unknown as Database,
      storage,
      cityExtractor as never,
      cityAi as unknown as AiClient,
    );

    await processor.process(fakeJob(stored.id, 0));

    const row = await readImport(stored.id);
    expect(row?.status).toBe('ready_for_review');
    const draft = row?.draft as unknown as {
      contactDetails: { city: string | null; fullName: string | null };
    };
    expect(draft.contactDetails.city).toBe('Quixadá, CE');
    expect(draft.contactDetails.fullName).toBe('Mariana Quartz');
  });

  it('should save detected writing style and extraction skills, languages and certifications', async () => {
    const textWithSections = [
      'Mariana Quartz',
      'Quixadá, CE',
      '',
      'Summary',
      'Backend developer focused on Python services for eight years.',
      '',
      'Experience',
      'Lead Engineer at Northwind Software from 2020 to 2024 with Python.',
      '',
      'Skills',
      'Node.js, React',
    ].join('\n');
    const extractor = {
      extract: async () => ({
        hasTextLayer: true,
        readingOrderText: textWithSections,
        pageCount: 1,
      }),
    };
    const fakeAi = {
      complete: async (request: { promptName: string }) => {
        if (request.promptName === 'detect-writing-style') {
          return { writingMethod: 'xyz', tone: 'technical', averageBulletWords: 15 };
        }
        return {
          evidences: [{ statement: 'Backend developer with 8 years of Python experience' }],
          experiences: [
            { company: 'Northwind Software', role: 'Lead Engineer', startedOn: '2020', endedOn: '2024' },
          ],
          education: [],
          skills: [
            { name: 'Node.js', group: null },
            { name: 'React', group: null },
          ],
          languages: [{ name: 'English', level: 'Advanced' }],
          certifications: [{ name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' }],
          sectionOrder: ['summary', 'experience', 'skills', 'languages', 'certifications'],
        };
      },
    };
    const stored = await createStoredImport();
    const processor = new ResumeImportProcessor(
      db as unknown as Database,
      storage,
      extractor as never,
      fakeAi as unknown as AiClient,
    );

    await processor.process(fakeJob(stored.id, 0));

    const row = await readImport(stored.id);
    expect(row?.status).toBe('ready_for_review');
    const writingStyle = row?.writingStyle as unknown as {
      writingMethod: string;
      tone: string;
      averageBulletWords: number;
    };
    expect(writingStyle).toEqual({ writingMethod: 'xyz', tone: 'technical', averageBulletWords: 15 });
    const draft = row?.draft as unknown as {
      skills: Array<{ name: string }>;
      languages: Array<{ name: string }>;
      certifications: Array<{ name: string }>;
    };
    expect(draft.skills.map((skill) => skill.name)).toEqual(['Node.js', 'React']);
    expect(draft.languages).toHaveLength(1);
    expect(draft.certifications).toHaveLength(1);
  });

  it('should fall back to free and direct writing style when detection fails', async () => {
    const textWithCity = [
      'Mariana Quartz',
      'Quixadá, CE',
      '',
      'Summary',
      'Backend developer focused on Python services for eight years.',
      '',
      'Experience',
      'Lead Engineer at Northwind Software from 2020 to 2024 with Python.',
    ].join('\n');
    const fallbackExtractor = {
      extract: async () => ({
        hasTextLayer: true,
        readingOrderText: textWithCity,
        pageCount: 1,
      }),
    };
    const fallbackAi = {
      complete: async (request: { promptName: string }) => {
        if (request.promptName === 'detect-writing-style') {
          throw new AiUnavailableError(503);
        }
        return {
          evidences: [{ statement: 'Backend developer with 8 years of Python experience' }],
          experiences: [
            { company: 'Northwind Software', role: 'Lead Engineer', startedOn: '2020', endedOn: '2024' },
          ],
          education: [],
        };
      },
    };
    const stored = await createStoredImport();
    const processor = new ResumeImportProcessor(
      db as unknown as Database,
      storage,
      fallbackExtractor as never,
      fallbackAi as unknown as AiClient,
    );

    await processor.process(fakeJob(stored.id, 0));

    const row = await readImport(stored.id);
    expect(row?.status).toBe('ready_for_review');
    const writingStyle = row?.writingStyle as unknown as {
      writingMethod: string;
      tone: string;
      averageBulletWords: number;
    };
    expect(writingStyle.writingMethod).toBe('free');
    expect(writingStyle.tone).toBe('direct');
    expect(writingStyle.averageBulletWords).toBeGreaterThan(0);
  });
});
