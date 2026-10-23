import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import { resumeImports, sourceDocuments } from 'schema';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_request_origin_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/12';

const PDF_HEADER = Buffer.from('%PDF-1.4 test pdf content');
const EVIL_ORIGIN = 'https://evil.example';
const LOCAL_ORIGIN = 'http://localhost:3000';

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

async function countRows(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<{ imports: number; documents: number }> {
  const importRows = await db.select({ id: resumeImports.id }).from(resumeImports);
  const documentRows = await db.select({ key: sourceDocuments.storageKey }).from(sourceDocuments);
  return { imports: importRows.length, documents: documentRows.length };
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
let previousCorsOrigins: string | undefined;

beforeAll(async () => {
  process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
  previousCorsOrigins = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = `${LOCAL_ORIGIN},http://127.0.0.1:3000`;

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
  if (previousCorsOrigins === undefined) {
    delete process.env.CORS_ORIGINS;
  } else {
    process.env.CORS_ORIGINS = previousCorsOrigins;
  }
});

describe('request origin guard', () => {
  it('should reject POST /resume-imports with a foreign Origin and store nothing', async () => {
    const before = await countRows(db);

    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .set('Origin', EVIL_ORIGIN)
      .attach('file', PDF_HEADER, 'resume.pdf')
      .expect(403);

    expect(response.body.code).toBe('request_origin_rejected');
    const after = await countRows(db);
    expect(after).toEqual(before);
  });

  it('should reject POST /resume-imports with a foreign Host even with a valid Origin', async () => {
    const before = await countRows(db);

    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .set('Host', 'evil.example')
      .set('Origin', LOCAL_ORIGIN)
      .attach('file', PDF_HEADER, 'resume.pdf')
      .expect(403);

    expect(response.body.code).toBe('request_origin_rejected');
    const after = await countRows(db);
    expect(after).toEqual(before);
  });

  it('should reject POST /resume-imports with the null Origin', async () => {
    const before = await countRows(db);

    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .set('Origin', 'null')
      .attach('file', PDF_HEADER, 'resume.pdf')
      .expect(403);

    expect(response.body.code).toBe('request_origin_rejected');
    const after = await countRows(db);
    expect(after).toEqual(before);
  });

  it('should reject GET /health with a foreign Host', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Host', 'evil.example')
      .set('Origin', LOCAL_ORIGIN)
      .expect(403);

    expect(response.body.code).toBe('request_origin_rejected');
  });

  it('should keep GET /health working with a loopback Host and no Origin', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('should not reject GET with a foreign Origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', EVIL_ORIGIN)
      .expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('should accept POST /resume-imports with the local Origin', async () => {
    const response = await request(app.getHttpServer())
      .post('/resume-imports')
      .set('Origin', LOCAL_ORIGIN)
      .attach('file', PDF_HEADER, 'resume.pdf')
      .expect(202);

    expect(response.body.id).toBeDefined();
    const after = await countRows(db);
    expect(after.imports).toBe(1);
    expect(after.documents).toBe(1);
  });
});
