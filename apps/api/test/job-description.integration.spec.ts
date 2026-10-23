import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import { jobDescriptions, requirements } from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import {
  jobDescriptionResponseSchema,
  MAX_JOB_DESCRIPTION_TEXT_LENGTH,
} from 'schema/contracts/job-description';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiUnavailableError,
} from '../src/modules/ai/ai-errors';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_job_description_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/15';

const VALID_PARSE_OUTPUT = {
  isJobDescription: true,
  language: 'pt-BR',
  requirements: [
    {
      literalTerm: 'Sólida experiência com Kubernetes',
      concept: 'Strong Kubernetes experience',
      kind: 'mandatory',
    },
    {
      literalTerm: 'inglês avançado',
      concept: 'Advanced English',
      kind: 'desirable',
    },
  ],
};

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

const aiComplete = vi.fn(async () => VALID_PARSE_OUTPUT);
let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

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
  aiComplete.mockImplementation(async () => VALID_PARSE_OUTPUT);
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

describe('POST /job-descriptions', () => {
  it('should store both tables and answer 200 with requirements', async () => {
    const text = 'Vaga: sólida experiência com Kubernetes. Desejável inglês avançado.';

    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text })
      .expect(200);

    const body = jobDescriptionResponseSchema.parse(response.body);
    expect(body.language).toBe('pt-BR');
    expect(body.requirements[0]?.literalTerm).toBe('Sólida experiência com Kubernetes');
    expect(body.requirements[0]?.normalizedConcept).toBe(
      'solida experiencia com kubernetes',
    );
    expect(body.requirements[1]?.kind).toBe('desirable');

    const [job] = await db
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.rawText, text));
    expect(job?.userId).toBe(LOCAL_USER_ID);
    const requirementRows = await db
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, body.id))
      .orderBy(requirements.ordinal);
    expect(requirementRows).toHaveLength(2);
    expect(requirementRows[1]?.literalTerm).toBe('inglês avançado');
  });

  it('should answer 422 with the not-a-job message and store nothing when the verdict is negative', async () => {
    aiComplete.mockImplementation(async () => ({
      isJobDescription: false,
      language: 'pt-BR',
      requirements: [],
    }));

    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'oi, tudo bem? só passando' })
      .expect(422);

    expect(response.body.message).toMatch(/does not look like a job advertisement/);
    const [row] = await db
      .select({ value: count() })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.rawText, 'oi, tudo bem? só passando'));
    expect(row?.value).toBe(0);
  });

  it('should answer 422 with a distinct message when the extraction is empty', async () => {
    aiComplete.mockImplementation(async () => ({
      isJobDescription: true,
      language: 'pt-BR',
      requirements: [],
    }));

    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'vaga genérica sem requisitos listados' })
      .expect(422);

    expect(response.body.message).toMatch(/No requirements were found/);
    const [row] = await db
      .select({ value: count() })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.rawText, 'vaga genérica sem requisitos listados'));
    expect(row?.value).toBe(0);
  });

  it('should answer 400 naming the limit without ever calling the AI', async () => {
    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'a'.repeat(MAX_JOB_DESCRIPTION_TEXT_LENGTH + 1) })
      .expect(400);

    expect(response.body.message).toContain(String(MAX_JOB_DESCRIPTION_TEXT_LENGTH));
    expect(aiComplete).not.toHaveBeenCalled();
  });

  it('should answer 503 after exactly one AI attempt when the model is unavailable', async () => {
    aiComplete.mockImplementation(async () => {
      throw new AiUnavailableError(503);
    });

    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'qualquer vaga' })
      .expect(503);

    expect(response.body.message).toMatch(/could not be processed right now/);
    expect(response.body.code).toBe('ai_unavailable');
    expect(aiComplete).toHaveBeenCalledTimes(1);
  });

  it('should answer 422 ai_key_missing when no key is configured', async () => {
    aiComplete.mockImplementation(async () => {
      throw new AiKeyMissingError();
    });

    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'qualquer vaga' })
      .expect(422);

    expect(response.body.code).toBe('ai_key_missing');
  });

  it('should answer 422 ai_key_rejected when the key is rejected', async () => {
    aiComplete.mockImplementation(async () => {
      throw new AiKeyRejectedError();
    });

    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'qualquer vaga' })
      .expect(422);

    expect(response.body.code).toBe('ai_key_rejected');
  });

  it('should answer 422 ai_balance_exhausted when the balance is gone', async () => {
    aiComplete.mockImplementation(async () => {
      throw new AiBalanceExhaustedError();
    });

    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'qualquer vaga' })
      .expect(422);

    expect(response.body.code).toBe('ai_balance_exhausted');
  });
});

describe('GET /job-descriptions/:jobDescriptionId', () => {
  async function createJobDescription(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/job-descriptions')
      .send({ text: 'Vaga para ler depois' });
    const body = jobDescriptionResponseSchema.parse(response.body);
    return body.id;
  }

  it('should return the job description for a valid id', async () => {
    const id = await createJobDescription();

    const response = await request(app.getHttpServer())
      .get(`/job-descriptions/${id}`)
      .expect(200);
    expect(jobDescriptionResponseSchema.parse(response.body).id).toBe(id);
  });

  it('should answer 404 for an unknown id', async () => {
    await request(app.getHttpServer())
      .get('/job-descriptions/11111111-1111-4111-8111-111111111111')
      .expect(404);
  });
});
