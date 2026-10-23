import { describe, expect, it, vi } from 'vitest';
import { CareerProfileService } from './career-profile.service';
import type { Database } from '../database/database.provider';
import type { ObjectStorage } from '../storage/object-storage';

const RESUME_IMPORT_ID = '3f2a1c44-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const USER_ID = '9e8d7c66-5b4a-4938-2716-0f5e4d3c2b1a';
const STORAGE_KEY = 'source-documents/9e8d7c66-5b4a-4938-2716-0f5e4d3c2b1a/doc';

const READY_ROW = {
  id: RESUME_IMPORT_ID,
  userId: USER_ID,
  storageKey: STORAGE_KEY,
  status: 'ready_for_review',
  draft: {
    contactDetails: { fullName: 'Someone', email: null, phone: null, city: null, links: null },
    experiences: [],
    education: [],
    evidences: [],
  },
};

function makeDatabase(transactionImpl: () => Promise<void>): {
  database: Database;
  transaction: ReturnType<typeof vi.fn>;
} {
  const transaction = vi.fn(transactionImpl);
  const database = {
    select: () => ({ from: () => ({ where: () => Promise.resolve([READY_ROW]) }) }),
    transaction,
  } as unknown as Database;
  return { database, transaction };
}

function makeStorage(): { storage: ObjectStorage; remove: ReturnType<typeof vi.fn> } {
  const remove = vi.fn(async () => undefined);
  const storage = {
    putSourceDocument: vi.fn(),
    getSourceDocument: vi.fn(),
    removeSourceDocument: remove,
    removeSourceDocumentsOf: vi.fn(async () => undefined),
  } as unknown as ObjectStorage;
  return { storage, remove };
}

describe('CareerProfileService.confirmResumeImport', () => {
  it('should delete the source document only after the transaction commits', async () => {
    // Arrange
    const order: string[] = [];
    const { database } = makeDatabase(async () => {
      order.push('transaction');
    });
    const { storage, remove } = makeStorage();
    remove.mockImplementation(async () => {
      order.push('remove');
    });
    const service = new CareerProfileService(database, storage);

    // Act
    await service.confirmResumeImport(RESUME_IMPORT_ID, USER_ID);

    // Assert
    expect(order).toEqual(['transaction', 'remove']);
  });

  it('should keep the source document when the transaction fails', async () => {
    // Arrange: this is the safety property. Deleting the object before the
    // transaction commits would leave the person with neither a profile nor the
    // file they uploaded, and there is no way to reprocess it (ADR 0008).
    const { database } = makeDatabase(async () => {
      throw new Error('constraint violation');
    });
    const { storage, remove } = makeStorage();
    const service = new CareerProfileService(database, storage);

    // Act
    const failure = await service
      .confirmResumeImport(RESUME_IMPORT_ID, USER_ID)
      .catch((error: unknown) => error);

    // Assert
    expect(failure).toBeInstanceOf(Error);
    expect(remove).not.toHaveBeenCalled();
  });
});
