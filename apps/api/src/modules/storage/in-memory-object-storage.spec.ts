import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryObjectStorage } from './in-memory-object-storage';
import { StorageUnavailableError } from './storage-errors';

// This battery mirrors the PostgresObjectStorage integration suite on the points the two
// implementations must not diverge on: user-prefixed keys, byte fidelity,
// idempotent removal and StorageUnavailableError conversion.
describe('InMemoryObjectStorage', () => {
  let storage: InMemoryObjectStorage;

  beforeEach(() => {
    storage = new InMemoryObjectStorage();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a user-prefixed storage key from putSourceDocument', async () => {
    // Act
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('%PDF-1.4'),
      extension: '.pdf',
    });

    // Assert
    expect(storageKey).toMatch(/^source-documents\/user-42\/[0-9a-f-]{36}\.pdf$/);
  });

  it('should return exactly the stored bytes from getSourceDocument', async () => {
    // Arrange
    const content = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const storageKey = await storage.putSourceDocument({ userId: 'user-42', content, extension: '.pdf' });

    // Act
    const retrieved = await storage.getSourceDocument(storageKey);

    // Assert
    expect(Array.from(retrieved)).toEqual(Array.from(content));
  });

  it('should not let caller mutation change the stored bytes', async () => {
    // Arrange
    const content = Buffer.from('original bytes');
    const storageKey = await storage.putSourceDocument({ userId: 'user-42', content, extension: '.pdf' });

    // Act
    content.write('MUTATED!');

    // Assert
    const retrieved = await storage.getSourceDocument(storageKey);
    expect(retrieved.toString()).toBe('original bytes');
  });

  it('should remove a stored source document', async () => {
    // Arrange
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('x'),
      extension: '.pdf',
    });

    // Act
    await storage.removeSourceDocument(storageKey);

    // Assert
    await expect(storage.getSourceDocument(storageKey)).rejects.toThrow(StorageUnavailableError);
  });

  it('should not throw when removing the same key twice', async () => {
    // Arrange
    const storageKey = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('x'),
      extension: '.pdf',
    });
    await storage.removeSourceDocument(storageKey);

    // Act & Assert
    await storage.removeSourceDocument(storageKey);
  });

  it('should not throw when removing a key that was never stored', async () => {
    // Act & Assert
    await storage.removeSourceDocument('source-documents/user-42/never-stored');
  });

  it('should convert a missing key on get into StorageUnavailableError', async () => {
    // Act & Assert
    await expect(storage.getSourceDocument('source-documents/user-42/absent')).rejects.toThrow(
      StorageUnavailableError,
    );
  });

  it('should log only the storage key and the size when storing a source document', async () => {
    // Arrange
    const content = Buffer.from('PERSONAL-CV-BYTES');

    // Act
    const storageKey = await storage.putSourceDocument({ userId: 'user-42', content, extension: '.pdf' });

    // Assert
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('Source document stored', {
      storageKey,
      sizeInBytes: content.byteLength,
    });
  });

  it('should remove every document of the given user', async () => {
    // Arrange
    const first = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('first'),
      extension: '.pdf',
    });
    const second = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('second'),
      extension: '.pdf',
    });

    // Act
    await storage.removeSourceDocumentsOf('user-42');

    // Assert
    await expect(storage.getSourceDocument(first)).rejects.toThrow(StorageUnavailableError);
    await expect(storage.getSourceDocument(second)).rejects.toThrow(StorageUnavailableError);
  });

  it('should keep documents of another user', async () => {
    // Arrange
    const ownKey = await storage.putSourceDocument({
      userId: 'user-42',
      content: Buffer.from('own'),
      extension: '.pdf',
    });
    const otherKey = await storage.putSourceDocument({
      userId: 'other-user',
      content: Buffer.from('other'),
      extension: '.pdf',
    });

    // Act
    await storage.removeSourceDocumentsOf('user-42');

    // Assert
    await expect(storage.getSourceDocument(ownKey)).rejects.toThrow(StorageUnavailableError);
    await expect(storage.getSourceDocument(otherKey)).resolves.toBeDefined();
  });

  it('should not throw when the user has no documents', async () => {
    // Act & Assert
    await storage.removeSourceDocumentsOf('user-without-documents');
  });
});
