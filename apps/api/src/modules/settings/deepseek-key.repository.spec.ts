import { describe, expect, it, vi } from 'vitest';
import { deepSeekCredentials } from 'schema';
import type { Database } from '../database/database.provider';
import { DeepSeekKeyRepository } from './deepseek-key.repository';

function createDatabaseFake(selectRows: Array<{ apiKey: string }>) {
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const where = vi.fn(async () => selectRows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const database = { select, insert } as unknown as Database;
  return { database, select, from, where, insert, values, onConflictDoUpdate };
}

describe('DeepSeekKeyRepository.findApiKey', () => {
  it('should return the stored key', async () => {
    const { database } = createDatabaseFake([{ apiKey: 'sk-live-1234' }]);
    const repository = new DeepSeekKeyRepository(database);

    await expect(repository.findApiKey()).resolves.toBe('sk-live-1234');
  });

  it('should return null when no row exists', async () => {
    const { database } = createDatabaseFake([]);
    const repository = new DeepSeekKeyRepository(database);

    await expect(repository.findApiKey()).resolves.toBeNull();
  });
});

describe('DeepSeekKeyRepository.saveApiKey', () => {
  it('should upsert the single row with id 1', async () => {
    const { database, insert, values, onConflictDoUpdate } = createDatabaseFake([]);
    const repository = new DeepSeekKeyRepository(database);

    await repository.saveApiKey('sk-new-key');

    expect(insert).toHaveBeenCalledWith(deepSeekCredentials);
    expect(values).toHaveBeenCalledWith({ id: 1, apiKey: 'sk-new-key' });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: deepSeekCredentials.id }),
    );
  });
});
