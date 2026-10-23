import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from 'schema';
import type { Database } from '../src/modules/database/database.provider';
import { PostgresObjectStorage } from '../src/modules/storage/postgres-object-storage';
import { StorageUnavailableError } from '../src/modules/storage/storage-errors';
import { resetDatabase } from './reset-database';

const TEST_DATABASE = 'cv_adapter_object_storage_test';
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

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let storage: PostgresObjectStorage;

beforeAll(async () => {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  });
  process.env.DATABASE_URL = urlWithDatabase(`/${TEST_DATABASE}`);
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  storage = new PostgresObjectStorage(db as unknown as Database);
}, 120_000);

beforeEach(async () => {
  await resetDatabase(pool);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
  await withAdminClient((client) =>
    client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`),
  );
});

describe('PostgresObjectStorage', () => {
  it('should return a user-prefixed key ending in the given extension', async () => {
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('%PDF-1.4'),
      extension: '.pdf',
    });

    expect(storageKey).toMatch(/^source-documents\/user-42\/[0-9a-f-]{36}\.pdf$/);
  });

  it('should return exactly the stored bytes, including null and high bytes', async () => {
    const content = Buffer.from([0x00, 0xff, 0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content,
      extension: '.pdf',
    });

    const retrieved = await storage.getSourceDocument(storageKey);

    expect(Array.from(retrieved)).toEqual(Array.from(content));
  });

  it('should not let caller mutation change the stored bytes', async () => {
    const content = Buffer.from('original bytes');
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content,
      extension: '.pdf',
    });

    content.write('MUTATED!');

    const retrieved = await storage.getSourceDocument(storageKey);
    expect(retrieved.toString()).toBe('original bytes');
  });

  it('should convert a missing key on get into StorageUnavailableError', async () => {
    await expect(storage.getSourceDocument('source-documents/user-42/absent')).rejects.toThrow(
      StorageUnavailableError,
    );
  });

  it('should convert a removed key on get into StorageUnavailableError', async () => {
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('x'),
      extension: '.pdf',
    });

    await storage.removeSourceDocument(storageKey);

    await expect(storage.getSourceDocument(storageKey)).rejects.toThrow(StorageUnavailableError);
  });

  it('should not throw when removing a key that was never stored', async () => {
    await storage.removeSourceDocument('source-documents/user-42/never-stored');
  });

  it('should not throw when removing the same key twice', async () => {
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('x'),
      extension: '.pdf',
    });
    await storage.removeSourceDocument(storageKey);

    await storage.removeSourceDocument(storageKey);
  });

  it('should convert a database failure on put into StorageUnavailableError with cause', async () => {
    const failure = new Error('connection refused');
    const failing = new PostgresObjectStorage(
      { insert: () => ({ values: async () => Promise.reject(failure) }) } as unknown as Database,
    );

    let caught: unknown;
    try {
      await failing.putSourceDocument({
        userId: 'user-42',
        content: Buffer.from('x'),
        extension: '.pdf',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StorageUnavailableError);
    expect((caught as StorageUnavailableError).cause).toBe(failure);
  });

  it('should convert a database failure on get into StorageUnavailableError with cause', async () => {
    const failure = new Error('connection refused');
    const failing = new PostgresObjectStorage(
      {
        select: () => ({
          from: () => ({ where: async () => Promise.reject(failure) }),
        }),
      } as unknown as Database,
    );

    let caught: unknown;
    try {
      await failing.getSourceDocument('source-documents/user-42/x');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StorageUnavailableError);
    expect((caught as StorageUnavailableError).cause).toBe(failure);
  });

  it('should convert a database failure on remove into StorageUnavailableError with cause', async () => {
    const failure = new Error('connection refused');
    const failing = new PostgresObjectStorage(
      {
        delete: () => ({ where: async () => Promise.reject(failure) }),
      } as unknown as Database,
    );

    let caught: unknown;
    try {
      await failing.removeSourceDocument('source-documents/user-42/x');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StorageUnavailableError);
    expect((caught as StorageUnavailableError).cause).toBe(failure);
  });

  it('should log only the storage key and the size when storing a source document', async () => {
    const content = Buffer.from('PERSONAL-CV-BYTES');

    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content,
      extension: '.pdf',
    });

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('Source document stored', {
      storageKey,
      sizeInBytes: content.byteLength,
    });
  });
});
