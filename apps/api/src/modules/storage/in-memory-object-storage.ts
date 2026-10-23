import {
  buildSourceDocumentKey,
  ObjectStorage,
  PutSourceDocumentParams,
} from './object-storage';
import { StorageUnavailableError } from './storage-errors';

// Test double of the ObjectStorage port for the integration suites.
// Its behavior must stay identical to PostgresObjectStorage on key convention,
// byte fidelity, idempotent removal and error conversion, or those suites start lying.
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, Buffer>();

  async putSourceDocument(params: PutSourceDocumentParams): Promise<string> {
    const storageKey = buildSourceDocumentKey(params.userId, params.extension);
    // Copy isolates stored bytes from later caller mutation, as the table stores
    // its own copy at write time.
    this.objects.set(storageKey, Buffer.from(params.content));
    console.log('Source document stored', { storageKey, sizeInBytes: params.content.byteLength });
    return storageKey;
  }

  async getSourceDocument(storageKey: string): Promise<Buffer> {
    const content = this.objects.get(storageKey);
    if (content === undefined) {
      const cause = new Error(`no object stored under ${storageKey}`);
      console.error('Object storage operation failed', {
        operation: 'getSourceDocument',
        storageKey,
        reason: `${cause.name}: ${cause.message}`,
      });
      throw new StorageUnavailableError('Object storage getSourceDocument failed', { cause });
    }
    return Buffer.from(content);
  }

  async removeSourceDocument(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
    console.log('Source document removed', { storageKey });
  }

  async removeSourceDocumentsOf(userId: string): Promise<void> {
    const prefix = `source-documents/${userId}/`;
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) {
        this.objects.delete(key);
      }
    }
    console.log('Source documents removed', { userId });
  }
}
