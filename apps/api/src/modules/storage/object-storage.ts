import { randomUUID } from 'node:crypto';

const SOURCE_DOCUMENT_KEY_PREFIX = 'source-documents';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PutSourceDocumentParams {
  readonly userId: string;
  readonly content: Buffer;
  readonly extension: string;
}

export interface ObjectStorage {
  putSourceDocument(params: PutSourceDocumentParams): Promise<string>;
  getSourceDocument(storageKey: string): Promise<Buffer>;
  removeSourceDocument(storageKey: string): Promise<void>;
  removeSourceDocumentsOf(userId: string): Promise<void>;
}

// Every Source Document key nests under its owning user id.
// The extension is part of the key because the worker only ever sees the key:
// it is what tells the extractor which parser to use.
export function buildSourceDocumentKey(userId: string, extension: string): string {
  return `${SOURCE_DOCUMENT_KEY_PREFIX}/${userId}/${randomUUID()}${extension}`;
}
