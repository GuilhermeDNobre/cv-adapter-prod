import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceDocuments } from 'schema';
import type { Database } from '../database/database.provider';
import { PostgresObjectStorage } from './postgres-object-storage';
import { StorageUnavailableError } from './storage-errors';

function createStorageWithCapture() {
  const where = vi.fn(async (condition: unknown) => {
    void condition;
  });
  const deleteFn = vi.fn((table: unknown) => {
    void table;
    return { where };
  });
  const database = { delete: deleteFn } as unknown as Database;
  return { storage: new PostgresObjectStorage(database), deleteFn, where };
}

describe('PostgresObjectStorage.removeSourceDocumentsOf', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should delete from source_documents with a user-prefixed condition', async () => {
    const { storage, deleteFn, where } = createStorageWithCapture();

    await storage.removeSourceDocumentsOf('user-42');

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalledWith(sourceDocuments);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('should scope the delete to the given user prefix', async () => {
    const first = createStorageWithCapture();
    const second = createStorageWithCapture();

    await first.storage.removeSourceDocumentsOf('user-42');
    await second.storage.removeSourceDocumentsOf('other-user');

    const firstCalls = first.where.mock.calls as unknown[][];
    const secondCalls = second.where.mock.calls as unknown[][];
    const firstCondition = firstCalls[0]?.[0];
    const secondCondition = secondCalls[0]?.[0];
    expect(firstCondition).toBeDefined();
    expect(secondCondition).toBeDefined();
    expect(firstCondition).not.toEqual(secondCondition);
  });

  it('should convert a database failure into StorageUnavailableError with cause', async () => {
    const failure = new Error('connection refused');
    const failing = new PostgresObjectStorage({
      delete: () => ({ where: async () => Promise.reject(failure) }),
    } as unknown as Database);

    let caught: unknown;
    try {
      await failing.removeSourceDocumentsOf('user-42');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StorageUnavailableError);
    expect((caught as StorageUnavailableError).cause).toBe(failure);
  });

  it('should log only the user id when removing documents of a user', async () => {
    const { storage } = createStorageWithCapture();

    await storage.removeSourceDocumentsOf('user-42');

    expect(console.log).toHaveBeenCalledWith('Source documents removed', { userId: 'user-42' });
  });
});
