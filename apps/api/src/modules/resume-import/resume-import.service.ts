import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { resumeImports } from 'schema';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import {
  MAX_SOURCE_DOCUMENT_SIZE_BYTES,
  resumeImportIdSchema,
  resumeImportResponseSchema,
} from 'schema/contracts/resume-import';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DATABASE, type Database } from '../database/database.provider';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';
import { DEFAULT_JOB_OPTIONS, RESUME_IMPORT_QUEUE } from '../../queue.module';

const PDF_MAGIC = Buffer.from('%PDF');
const SUPPORTED_FORMATS_MESSAGE =
  'Unsupported file format. Accepted formats: PDF, LaTeX (.tex), HTML.';

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PDF_MAGIC);
}

function isLatex(buffer: Buffer): boolean {
  const text = buffer.toString('utf8', 0, Math.min(buffer.byteLength, 4096));
  return /\\documentclass|\\begin\{document\}/.test(text);
}

function isHtml(buffer: Buffer): boolean {
  const text = buffer
    .toString('utf8', 0, Math.min(buffer.byteLength, 4096))
    .toLowerCase();
  return /<html|<!doctype\s+html/.test(text);
}

// Returns the extension the storage key must carry. The format is decided by the bytes, never
// by what the upload claimed to be, and the worker later reads that decision back off the key.
function detectFileExtension(buffer: Buffer): string {
  if (isPdf(buffer)) return '.pdf';
  if (isLatex(buffer)) return '.tex';
  if (isHtml(buffer)) return '.html';
  throw new BadRequestException(SUPPORTED_FORMATS_MESSAGE);
}

function validateFileSize(buffer: Buffer): void {
  if (buffer.byteLength > MAX_SOURCE_DOCUMENT_SIZE_BYTES) {
    throw new BadRequestException(
      `File exceeds the ${String(MAX_SOURCE_DOCUMENT_SIZE_BYTES)}-byte size limit.`,
    );
  }
}

function toResponse(row: typeof resumeImports.$inferSelect): ResumeImportResponse {
  return resumeImportResponseSchema.parse({
    id: row.id,
    status: row.status,
    failureReason: row.failureReason,
    draft: row.draft,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

@Injectable()
export class ResumeImportService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @InjectQueue(RESUME_IMPORT_QUEUE) private readonly resumeImportQueue: Queue,
  ) {}

  async uploadSourceDocument(
    userId: string,
    fileBuffer: Buffer,
  ): Promise<ResumeImportResponse> {
    const extension = detectFileExtension(fileBuffer);
    validateFileSize(fileBuffer);
    console.log('resume_import.uploading', {
      userId,
      sizeInBytes: fileBuffer.byteLength,
    });
    const storageKey = await this.objectStorage.putSourceDocument({
      userId,
      content: fileBuffer,
      extension,
    });
    const [row] = await this.database
      .insert(resumeImports)
      .values({
        userId,
        storageKey,
        status: 'queued',
      })
      .returning();
    if (row === undefined) {
      throw new Error('Failed to create resume import row');
    }
    await this.resumeImportQueue.add(
      'process',
      {
        resumeImportId: row.id,
        userId,
      },
      DEFAULT_JOB_OPTIONS,
    );
    console.log('resume_import.enqueued', {
      resumeImportId: row.id,
      userId,
    });
    return toResponse(row);
  }

  async getResumeImport(
    resumeImportId: string,
    userId: string,
  ): Promise<ResumeImportResponse> {
    const parsedId = resumeImportIdSchema.safeParse(resumeImportId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume import not found.');
    }
    const [row] = await this.database
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, parsedId.data));
    if (row === undefined || row.userId !== userId) {
      throw new NotFoundException('Resume import not found.');
    }
    return toResponse(row);
  }
}
