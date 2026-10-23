import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { Database } from '../database/database.provider';
import type { ObjectStorage } from '../storage/object-storage';
import { DEFAULT_JOB_OPTIONS } from '../../queue.module';
import { ResumeImportService } from './resume-import.service';
import { detectSourceDocumentType } from './document-extractor';

const PDF_HEADER = Buffer.from('%PDF-1.4 rest of file content here');
const LATEX_CONTENT = Buffer.from('\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}');
const HTML_CONTENT = Buffer.from('<!DOCTYPE html><html><body>Resume</body></html>');
const DOCX_CONTENT = Buffer.from('PK\x03\x04 fake docx content');
const PNG_CONTENT = Buffer.from('\x89PNG\r\n\x1a\n fake png content');
const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function createService() {
  const putSourceDocument = vi.fn(async () => 'source-documents/user-1/uuid-1');
  const insertReturning = vi.fn(async () => [
    {
      id: VALID_UUID,
      userId: 'user-1',
      storageKey: 'source-documents/user-1/uuid-1',
      status: 'queued',
      failureReason: null,
      draft: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ]);
  const selectReturning = vi.fn(async () => []);
  const objectStorage = {
    putSourceDocument,
    getSourceDocument: vi.fn(),
    removeSourceDocument: vi.fn(),
    removeSourceDocumentsOf: vi.fn(async () => undefined),
  } as unknown as ObjectStorage;
  const database = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: insertReturning,
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => selectReturning()),
      })),
    })),
  } as unknown as Database;
  const add = vi.fn(async () => ({}));
  const queue = { add } as unknown as Queue;
  const service = new ResumeImportService(database, objectStorage, queue);
  return { service, objectStorage, database, queue, putSourceDocument, insertReturning, add };
}

describe('ResumeImportService.uploadSourceDocument', () => {
  it('should accept a valid PDF by content magic bytes', async () => {
    const { service, add } = createService();
    const result = await service.uploadSourceDocument('user-1', PDF_HEADER);
    expect(result.id).toBe(VALID_UUID);
    expect(result.status).toBe('queued');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('should accept a valid LaTeX file by content', async () => {
    const { service, add } = createService();
    const result = await service.uploadSourceDocument('user-1', LATEX_CONTENT);
    expect(result.id).toBe(VALID_UUID);
    expect(result.status).toBe('queued');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('should accept a valid HTML file by content', async () => {
    const { service, add } = createService();
    const result = await service.uploadSourceDocument('user-1', HTML_CONTENT);
    expect(result.id).toBe(VALID_UUID);
    expect(result.status).toBe('queued');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('should hand the storage the extension the bytes say, not what the upload claimed', async () => {
    const cases: ReadonlyArray<{ content: Buffer; extension: string }> = [
      { content: PDF_HEADER, extension: '.pdf' },
      { content: LATEX_CONTENT, extension: '.tex' },
      { content: HTML_CONTENT, extension: '.html' },
    ];
    for (const testCase of cases) {
      const { service, putSourceDocument } = createService();

      await service.uploadSourceDocument('user-1', testCase.content);

      expect(putSourceDocument).toHaveBeenCalledWith(
        expect.objectContaining({ extension: testCase.extension }),
      );
    }
  });

  // The worker only ever sees the storage key, and derives the filename from its last segment to
  // pick a parser. A key without an extension makes every real import fail as unsupported_format.
  it('should produce a key whose last segment the extractor can recognise', async () => {
    const { service, putSourceDocument } = createService();

    await service.uploadSourceDocument('user-1', PDF_HEADER);

    const storedKey = putSourceDocument.mock.calls.at(0)?.at(0) as unknown as
      | { extension: string }
      | undefined;
    expect(storedKey).toBeDefined();
    expect(detectSourceDocumentType(`some-uuid${storedKey?.extension ?? ''}`)).toBe('pdf');
  });

  it('should reject a .docx file with 400 naming accepted formats', async () => {
    const { service, putSourceDocument, add } = createService();
    await expect(service.uploadSourceDocument('user-1', DOCX_CONTENT)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.uploadSourceDocument('user-1', DOCX_CONTENT)).rejects.toThrow(
      /PDF.*LaTeX.*HTML|Unsupported file format/,
    );
    expect(putSourceDocument).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('should reject a PNG file with 400', async () => {
    const { service, putSourceDocument, add } = createService();
    await expect(service.uploadSourceDocument('user-1', PNG_CONTENT)).rejects.toThrow(
      BadRequestException,
    );
    expect(putSourceDocument).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('should reject a file above the size limit with 400 naming the limit', async () => {
    const { service, putSourceDocument, add } = createService();
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    oversized.write('%PDF', 0);
    await expect(service.uploadSourceDocument('user-1', oversized)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.uploadSourceDocument('user-1', oversized)).rejects.toThrow(
      /10485760|size limit/,
    );
    expect(putSourceDocument).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('should accept a file at exactly the size limit', async () => {
    const { service, add } = createService();
    const exactLimit = Buffer.alloc(10 * 1024 * 1024, 0);
    exactLimit.write('%PDF', 0);
    const result = await service.uploadSourceDocument('user-1', exactLimit);
    expect(result.status).toBe('queued');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('should accept a file one byte below the size limit', async () => {
    const { service, add } = createService();
    const belowLimit = Buffer.alloc(10 * 1024 * 1024 - 1, 0);
    belowLimit.write('%PDF', 0);
    const result = await service.uploadSourceDocument('user-1', belowLimit);
    expect(result.status).toBe('queued');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('should reject before storing or enqueuing on invalid format (RF-15 proof)', async () => {
    const { service, putSourceDocument, add, insertReturning } = createService();
    const randomBytes = Buffer.from('random binary data that is not a resume');

    await expect(service.uploadSourceDocument('user-1', randomBytes)).rejects.toThrow(
      BadRequestException,
    );

    expect(putSourceDocument).not.toHaveBeenCalled();
    expect(insertReturning).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('should reject before storing or enqueuing on oversized file (RF-15 proof)', async () => {
    const { service, putSourceDocument, add, insertReturning } = createService();
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 100, 0);
    oversized.write('%PDF', 0);

    await expect(service.uploadSourceDocument('user-1', oversized)).rejects.toThrow(
      BadRequestException,
    );

    expect(putSourceDocument).not.toHaveBeenCalled();
    expect(insertReturning).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('should call operations in order: validate, store, insert, enqueue', async () => {
    const { service, putSourceDocument, insertReturning, add } = createService();
    const callOrder: string[] = [];
    putSourceDocument.mockImplementation(async () => {
      callOrder.push('store');
      return 'source-documents/user-1/uuid-1';
    });
    insertReturning.mockImplementation(async () => {
      callOrder.push('insert');
      return [
        {
          id: VALID_UUID,
          userId: 'user-1',
          storageKey: 'source-documents/user-1/uuid-1',
          status: 'queued',
          failureReason: null,
          draft: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ];
    });
    add.mockImplementation(async () => {
      callOrder.push('enqueue');
      return {};
    });

    await service.uploadSourceDocument('user-1', PDF_HEADER);

    expect(callOrder).toEqual(['store', 'insert', 'enqueue']);
  });

  it('should never log the file content or original name', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { service } = createService();

    await service.uploadSourceDocument('user-1', PDF_HEADER);

    const logged = JSON.stringify(logSpy.mock.calls.map((call) => call.map(String)));
    expect(logged).not.toContain('rest of file content here');
    logSpy.mockRestore();
  });

  it('should enqueue with three attempts and exponential backoff', async () => {
    const { service, add } = createService();

    await service.uploadSourceDocument('user-1', PDF_HEADER);

    expect(add).toHaveBeenCalledWith(
      'process',
      { resumeImportId: VALID_UUID, userId: 'user-1' },
      DEFAULT_JOB_OPTIONS,
    );
    expect(DEFAULT_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  });
});

function createReadService(rows: Record<string, unknown>[]) {
  const selectSpy = vi.fn();
  const objectStorage = {
    putSourceDocument: vi.fn(),
    getSourceDocument: vi.fn(),
    removeSourceDocument: vi.fn(),
    removeSourceDocumentsOf: vi.fn(async () => undefined),
  } as unknown as ObjectStorage;
  const database = {
    insert: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          selectSpy();
          return rows;
        }),
      })),
    })),
  } as unknown as Database;
  const queue = { add: vi.fn() } as unknown as Queue;
  const service = new ResumeImportService(database, objectStorage, queue);
  return { service, selectSpy };
}

describe('ResumeImportService.getResumeImport', () => {
  const importId = '11111111-1111-4111-8111-111111111111';
  const now = new Date('2026-01-01T00:00:00Z');
  const importRow = {
    id: importId,
    userId: 'user-1',
    storageKey: 'key',
    status: 'queued',
    failureReason: null,
    draft: null,
    createdAt: now,
    updatedAt: now,
  };

  it('should return the import for the owner', async () => {
    const { service } = createReadService([importRow]);

    const result = await service.getResumeImport(importId, 'user-1');

    expect(result.id).toBe(importId);
    expect(result.status).toBe('queued');
  });

  it('should return 404 for a different user', async () => {
    const { service } = createReadService([importRow]);

    await expect(service.getResumeImport(importId, 'user-2')).rejects.toThrow(NotFoundException);
  });

  it('should return 404 for a non-existent import', async () => {
    const { service } = createReadService([]);

    await expect(service.getResumeImport(importId, 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('should return 404 for a malformed id without querying', async () => {
    const { service, selectSpy } = createReadService([importRow]);

    await expect(service.getResumeImport('not-a-uuid', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(selectSpy).not.toHaveBeenCalled();
  });
});
