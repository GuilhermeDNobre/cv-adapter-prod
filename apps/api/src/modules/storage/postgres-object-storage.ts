import { Inject, Injectable } from '@nestjs/common';
import { eq, like } from 'drizzle-orm';
import { sourceDocuments } from 'schema';
import { DATABASE, type Database } from '../database/database.provider';
import {
  buildSourceDocumentKey,
  ObjectStorage,
  PutSourceDocumentParams,
} from './object-storage';
import { StorageUnavailableError } from './storage-errors';

type StorageOperation =
  | 'putSourceDocument'
  | 'getSourceDocument'
  | 'removeSourceDocument'
  | 'removeSourceDocumentsOf';

@Injectable()
export class PostgresObjectStorage implements ObjectStorage {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async putSourceDocument(params: PutSourceDocumentParams): Promise<string> {
    const storageKey = buildSourceDocumentKey(params.userId, params.extension);
    try {
      await this.database
        .insert(sourceDocuments)
        .values({ storageKey, content: Buffer.from(params.content) });
    } catch (error) {
      throw this.wrapFailure('putSourceDocument', storageKey, error);
    }
    console.log('Source document stored', { storageKey, sizeInBytes: params.content.byteLength });
    return storageKey;
  }

  async getSourceDocument(storageKey: string): Promise<Buffer> {
    let rows: (typeof sourceDocuments.$inferSelect)[];
    try {
      rows = await this.database
        .select()
        .from(sourceDocuments)
        .where(eq(sourceDocuments.storageKey, storageKey));
    } catch (error) {
      throw this.wrapFailure('getSourceDocument', storageKey, error);
    }
    const row = rows[0];
    if (row === undefined) {
      throw this.wrapFailure(
        'getSourceDocument',
        storageKey,
        new Error(`no object stored under ${storageKey}`),
      );
    }
    return Buffer.from(row.content);
  }

  async removeSourceDocument(storageKey: string): Promise<void> {
    try {
      await this.database
        .delete(sourceDocuments)
        .where(eq(sourceDocuments.storageKey, storageKey));
    } catch (error) {
      throw this.wrapFailure('removeSourceDocument', storageKey, error);
    }
    console.log('Source document removed', { storageKey });
  }

  async removeSourceDocumentsOf(userId: string): Promise<void> {
    const prefix = `source-documents/${userId}/`;
    try {
      await this.database
        .delete(sourceDocuments)
        .where(like(sourceDocuments.storageKey, `${prefix}%`));
    } catch (error) {
      throw this.wrapFailure('removeSourceDocumentsOf', prefix, error);
    }
    console.log('Source documents removed', { userId });
  }

  private wrapFailure(
    operation: StorageOperation,
    storageKey: string,
    cause: unknown,
  ): StorageUnavailableError {
    const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown error';
    console.error('Object storage operation failed', { operation, storageKey, reason });
    return new StorageUnavailableError(`Object storage ${operation} failed`, { cause });
  }
}
