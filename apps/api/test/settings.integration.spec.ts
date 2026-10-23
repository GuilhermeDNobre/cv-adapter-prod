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
import { deepSeekCredentials } from 'schema';
import {
  deepSeekBalanceSchema,
  deepSeekKeyStatusSchema,
} from 'schema/contracts/settings';
import { AI_CLIENT, type AiClient } from '../src/modules/ai/ai-client';
import { AiKeyMissingError } from '../src/modules/ai/ai-errors';
import { DEEPSEEK_ACCOUNT, type DeepSeekAccount } from '../src/modules/settings/deepseek-account.client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_settings_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_REDIS_URL = 'redis://127.0.0.1:6379/15';

const FULL_KEY = 'sk-live-abcdef-12345678';
const LAST_FOUR = '5678';
const AVAILABLE_BALANCE = {
  isAvailable: true,
  balances: [{ currency: 'CNY', totalBalance: '10.00' }],
};
const EMPTY_BALANCE = {
  isAvailable: false,
  balances: [{ currency: 'CNY', totalBalance: '0.00' }],
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

const aiComplete = vi.fn(async () => ({
  isJobDescription: true,
  language: 'en',
  requirements: [{ literalTerm: 'Kubernetes', concept: 'Kubernetes', kind: 'mandatory' }],
}));
const fetchBalance = vi.fn(async () => AVAILABLE_BALANCE);

let app: INestApplication;
let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let queueRedis: Redis;

async function storedKey(): Promise<string | null> {
  const [row] = await db
    .select({ apiKey: deepSeekCredentials.apiKey })
    .from(deepSeekCredentials)
    .where(eq(deepSeekCredentials.id, 1));
  return row?.apiKey ?? null;
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
    .overrideProvider(DEEPSEEK_ACCOUNT)
    .useValue({ fetchBalance } as unknown as DeepSeekAccount)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
}, 120_000);

beforeEach(async () => {
  await queueRedis.flushdb();
  await resetDatabase(pool);
  fetchBalance.mockReset();
  fetchBalance.mockImplementation(async () => AVAILABLE_BALANCE);
});

afterAll(async () => {
  await app.close();
  await queueRedis.quit();
  await pool.end();
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('GET /settings/deepseek-key', () => {
  it('should report unconfigured on a clean database', async () => {
    const response = await request(app.getHttpServer()).get('/settings/deepseek-key').expect(200);

    expect(deepSeekKeyStatusSchema.parse(response.body)).toEqual({
      configured: false,
      lastFour: null,
    });
  });

  it('should report configured with the last four after saving', async () => {
    await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: FULL_KEY })
      .expect(200);

    const response = await request(app.getHttpServer()).get('/settings/deepseek-key').expect(200);

    expect(deepSeekKeyStatusSchema.parse(response.body)).toEqual({
      configured: true,
      lastFour: LAST_FOUR,
    });
    expect(JSON.stringify(response.body)).not.toContain(FULL_KEY);
  });
});

describe('PUT /settings/deepseek-key', () => {
  it('should verify, store and return status with balance for an accepted key', async () => {
    const response = await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: FULL_KEY })
      .expect(200);

    expect(response.body.status).toEqual({ configured: true, lastFour: LAST_FOUR });
    expect(deepSeekBalanceSchema.parse(response.body.balance)).toEqual(AVAILABLE_BALANCE);
    await expect(storedKey()).resolves.toBe(FULL_KEY);
    expect(JSON.stringify(response.body)).not.toContain(FULL_KEY);
  });

  it('should store an accepted key with zero balance and report unavailable', async () => {
    fetchBalance.mockImplementation(async () => EMPTY_BALANCE);

    const response = await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: FULL_KEY })
      .expect(200);

    expect(response.body.balance.isAvailable).toBe(false);
    await expect(storedKey()).resolves.toBe(FULL_KEY);
  });

  it('should answer 422 ai_key_rejected and store nothing when DeepSeek rejects the key', async () => {
    const { AiKeyRejectedError } = await import('../src/modules/ai/ai-errors');
    fetchBalance.mockRejectedValue(new AiKeyRejectedError());

    const response = await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: 'sk-bad-key' })
      .expect(422);

    expect(response.body.code).toBe('ai_key_rejected');
    await expect(storedKey()).resolves.toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('sk-bad-key');
  });

  it('should answer 503 ai_unavailable and store nothing when DeepSeek is down', async () => {
    const { AiUnavailableError } = await import('../src/modules/ai/ai-errors');
    fetchBalance.mockRejectedValue(new AiUnavailableError(500));

    const response = await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: FULL_KEY })
      .expect(503);

    expect(response.body.code).toBe('ai_unavailable');
    await expect(storedKey()).resolves.toBeNull();
  });

  it('should answer 400 for an invalid body', async () => {
    await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: '   ' })
      .expect(400);

    await expect(storedKey()).resolves.toBeNull();
  });
});

describe('GET /settings/deepseek-balance', () => {
  it('should return the balance for a stored key', async () => {
    await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: FULL_KEY })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/settings/deepseek-balance')
      .expect(200);

    expect(deepSeekBalanceSchema.parse(response.body)).toEqual(AVAILABLE_BALANCE);
    expect(JSON.stringify(response.body)).not.toContain(FULL_KEY);
  });

  it('should answer 422 ai_key_missing when no key is stored', async () => {
    const response = await request(app.getHttpServer())
      .get('/settings/deepseek-balance')
      .expect(422);

    expect(response.body.code).toBe('ai_key_missing');
  });

  it('should answer 422 ai_key_rejected when the stored key is rejected', async () => {
    await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: FULL_KEY })
      .expect(200);
    const { AiKeyRejectedError } = await import('../src/modules/ai/ai-errors');
    fetchBalance.mockRejectedValue(new AiKeyRejectedError());

    const response = await request(app.getHttpServer())
      .get('/settings/deepseek-balance')
      .expect(422);

    expect(response.body.code).toBe('ai_key_rejected');
  });

  it('should answer 503 ai_unavailable when the balance cannot be fetched', async () => {
    await request(app.getHttpServer())
      .put('/settings/deepseek-key')
      .send({ apiKey: FULL_KEY })
      .expect(200);
    const { AiUnavailableError } = await import('../src/modules/ai/ai-errors');
    fetchBalance.mockRejectedValue(new AiUnavailableError());

    const response = await request(app.getHttpServer())
      .get('/settings/deepseek-balance')
      .expect(503);

    expect(response.body.code).toBe('ai_unavailable');
  });
});

describe('DeepSeekClient with the stored key', () => {
  it('should fail without any stored key before calling the provider', async () => {
    const { DeepSeekClient } = await import('../src/modules/ai/deepseek-client');
    const { ConfigService } = await import('@nestjs/config');
    const { DEEPSEEK_KEY_STORE } = await import(
      '../src/modules/settings/deepseek-key.repository'
    );
    const store = app.get(DEEPSEEK_KEY_STORE) as unknown as import(
      '../src/modules/settings/deepseek-key.repository'
    ).DeepSeekKeyStore;
    const client = new DeepSeekClient(
      new ConfigService({ DEEPSEEK_BASE_URL: 'https://api.deepseek.com' }),
      store,
    );

    await expect(
      client.complete({
        promptName: 'parse-job-description',
        payload: { text: 'x' },
        outputSchema: (await import('zod')).z.object({}),
      }),
    ).rejects.toBeInstanceOf(AiKeyMissingError);
  });
});
