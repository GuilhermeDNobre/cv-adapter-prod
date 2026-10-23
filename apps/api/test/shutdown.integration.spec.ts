import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import { AppModule } from '../src/app.module';
import { configureApp, createApiApp } from '../src/main';
import { DATABASE_POOL } from '../src/modules/database/database.provider';
import { QueueModule } from '../src/queue.module';

const TEST_DATABASE = 'cv_adapter_shutdown_test';
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';

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

let app: INestApplication;
let pool: Pool;
let appClosed = false;

beforeAll(async () => {
  process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  });
  process.env.DATABASE_URL = urlWithDatabase(`/${TEST_DATABASE}`);
  process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';

  const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(dbPool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await dbPool.end();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  pool = app.get(DATABASE_POOL);
}, 120_000);

afterAll(async () => {
  if (app && !appClosed) {
    await app.close();
  }
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('API graceful shutdown', () => {
  it('should close the Postgres pool on shutdown, not merely skip opening it', async () => {
    const result = await pool.query('SELECT 1 AS ok');
    expect(result.rows[0]!.ok).toBe(1);

    await app.close();
    appClosed = true;

    await expect(pool.query('SELECT 1')).rejects.toThrow();
  });

  it('should register explicit SIGTERM and SIGINT handlers for container PID 1', async () => {
    const sigtermListenersBefore = process.listeners('SIGTERM').slice();
    const sigintListenersBefore = process.listeners('SIGINT').slice();
    const sigtermCountBefore = sigtermListenersBefore.length;
    const sigintCountBefore = sigintListenersBefore.length;

    const hookApp = await createApiApp();
    await hookApp.init();
    try {
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(sigtermCountBefore);
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(sigintCountBefore);
    } finally {
      for (const listener of process.listeners('SIGTERM')) {
        if (!sigtermListenersBefore.includes(listener)) {
          process.removeListener('SIGTERM', listener);
        }
      }
      for (const listener of process.listeners('SIGINT')) {
        if (!sigintListenersBefore.includes(listener)) {
          process.removeListener('SIGINT', listener);
        }
      }
      await hookApp.close();
    }

    expect(process.listenerCount('SIGTERM')).toBe(sigtermCountBefore);
    expect(process.listenerCount('SIGINT')).toBe(sigintCountBefore);
  });

  it('should expose queue readiness hooks on the QueueModule', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const probeApp = moduleRef.createNestApplication();
    configureApp(probeApp);
    await probeApp.init();
    const queueModule = probeApp.get(QueueModule) as unknown as {
      beforeApplicationShutdown?: unknown;
    };
    expect(typeof queueModule.beforeApplicationShutdown).toBe('function');
    await probeApp.close();
  }, 120_000);

  it('should boot and close the AppModule repeatedly without unhandled rejections', async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      for (let index = 0; index < 10; index += 1) {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        const bootApp = moduleRef.createNestApplication();
        configureApp(bootApp);
        await bootApp.init();
        await bootApp.close();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(rejections).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  }, 120_000);

  it('should close the app only once when a second signal arrives during shutdown', async () => {
    const sigtermListenersBefore = process.listeners('SIGTERM').slice();
    const sigintListenersBefore = process.listeners('SIGINT').slice();
    const sigtermCountBefore = sigtermListenersBefore.length;
    const sigintCountBefore = sigintListenersBefore.length;

    const signalApp = await createApiApp();
    await signalApp.init();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const closeSpy = vi.spyOn(signalApp, 'close');
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    let wasClosed = false;
    try {
      process.emit('SIGTERM');
      process.emit('SIGINT');
      await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled(), { timeout: 5000 });
      await closeSpy.mock.results[0]?.value;
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledTimes(1), { timeout: 5000 });
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(rejections).toEqual([]);
    } finally {
      wasClosed = closeSpy.mock.calls.length > 0;
      process.removeListener('unhandledRejection', onUnhandled);
      exitSpy.mockRestore();
      closeSpy.mockRestore();
      for (const listener of process.listeners('SIGTERM')) {
        if (!sigtermListenersBefore.includes(listener)) {
          process.removeListener('SIGTERM', listener);
        }
      }
      for (const listener of process.listeners('SIGINT')) {
        if (!sigintListenersBefore.includes(listener)) {
          process.removeListener('SIGINT', listener);
        }
      }
      if (!wasClosed) {
        await signalApp.close();
      }
    }

    expect(process.listenerCount('SIGTERM')).toBe(sigtermCountBefore);
    expect(process.listenerCount('SIGINT')).toBe(sigintCountBefore);
  });
});
