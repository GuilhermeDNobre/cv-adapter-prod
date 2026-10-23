import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { resumeImports } from 'schema';
import type {
  ResumeImportDraft,
  WritingStyle,
} from 'schema/contracts/resume-import';
import { AI_CLIENT, type AiClient } from '../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from '../ai/ai-errors';
import { extractResumeDraftOutputSchema } from '../ai/prompts/extract-resume-draft';
import { detectWritingStyleOutputSchema } from '../ai/prompts/detect-writing-style';
import {
  DOCUMENT_EXTRACTOR,
  type DocumentExtractor,
  DocumentExtractionError,
} from './document-extractor';
import { DefaultContactStripper } from './contact-stripper';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';
import { DATABASE, type Database } from '../database/database.provider';
import { RESUME_IMPORT_QUEUE } from '../../queue.module';

const STEP_DOWNLOAD = 'downloading';
const STEP_EXTRACT = 'extracting';
const STEP_STRIP_CONTACT = 'stripping_contact';
const STEP_AI = 'structuring';
const STEP_SAVE = 'saving';

const MINIMUM_TEXT_LENGTH = 50;

function calculateAverageBulletWords(text: string): number {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return 1;
  const total = lines.reduce((sum, line) => sum + line.split(/\s+/).length, 0);
  return Math.max(1, Math.round(total / lines.length));
}

type ImportFailureReason = typeof resumeImports.$inferInsert.failureReason;

interface ProcessorJobData {
  readonly resumeImportId: string;
  readonly userId: string;
}

export class BusinessError extends Error {
  readonly failureReason: string;

  constructor(failureReason: 'extraction_empty' | 'not_a_resume') {
    super(`Business error: ${failureReason}`);
    this.name = 'BusinessError';
    this.failureReason = failureReason;
  }
}

@Injectable()
@Processor(RESUME_IMPORT_QUEUE)
export class ResumeImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeImportProcessor.name);
  private readonly contactStripper = new DefaultContactStripper();

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @Inject(DOCUMENT_EXTRACTOR) private readonly documentExtractor: DocumentExtractor,
    @Inject(AI_CLIENT) private readonly aiClient: AiClient,
  ) {
    super();
  }

  async process(job: Job<ProcessorJobData>): Promise<void> {
    const { resumeImportId } = job.data;
    this.logger.log('Processing resume import', { resumeImportId });
    const existing = await this.findImportRow(resumeImportId);
    if (existing === undefined) {
      this.logger.log('resume_import.skipped_missing', { resumeImportId });
      return;
    }
    try {
      await this.executePipeline(job, resumeImportId);
    } catch (error) {
      await this.handlePipelineError(job, resumeImportId, error);
    }
  }

  private async executePipeline(
    job: Job<ProcessorJobData>,
    resumeImportId: string,
  ): Promise<void> {
    await job.updateProgress({ step: STEP_DOWNLOAD, percent: 10 });
    const storageKey = await this.getStorageKey(resumeImportId);
    const fileBuffer = await this.objectStorage.getSourceDocument(storageKey);
    const filename = this.deriveFilename(storageKey);

    await job.updateProgress({ step: STEP_EXTRACT, percent: 30 });
    const extracted = await this.documentExtractor.extract({ filename, content: fileBuffer });

    if (!extracted.hasTextLayer) {
      await this.markFailed(resumeImportId, 'no_text_layer');
      this.logger.log('Resume import rejected: no text layer', { resumeImportId });
      return;
    }

    await job.updateProgress({ step: STEP_STRIP_CONTACT, percent: 50 });
    const stripped = this.contactStripper.strip(extracted.readingOrderText);

    await job.updateProgress({ step: STEP_AI, percent: 60 });
    const textForAi = stripped.textWithoutContact;
    if (textForAi.trim().length < MINIMUM_TEXT_LENGTH) {
      throw new BusinessError('extraction_empty');
    }
    const aiOutput = await this.aiClient.complete({
      promptName: 'extract-resume-draft',
      payload: { text: textForAi },
      outputSchema: extractResumeDraftOutputSchema,
    });

    const writingStyle = await this.detectWritingStyle(resumeImportId, textForAi);

    const summary =
      typeof aiOutput.summary === 'string' && aiOutput.summary.trim() !== ''
        ? aiOutput.summary.trim()
        : null;
    const draft: ResumeImportDraft = {
      evidences: aiOutput.evidences,
      experiences: aiOutput.experiences,
      education: aiOutput.education,
      summary,
      skills: aiOutput.skills,
      languages: aiOutput.languages,
      certifications: aiOutput.certifications,
      sectionOrder: aiOutput.sectionOrder,
      contactDetails: {
        fullName: stripped.contactDetails.fullName ?? null,
        email: stripped.contactDetails.email ?? null,
        phone: stripped.contactDetails.phone ?? null,
        city: stripped.contactDetails.city ?? null,
        links: stripped.contactDetails.links !== undefined ? [...stripped.contactDetails.links] : null,
      },
    };

    await job.updateProgress({ step: STEP_SAVE, percent: 90 });
    const claimed = await this.markReady(resumeImportId, draft, writingStyle);
    if (!claimed) {
      this.logger.log('resume_import.skipped_missing', { resumeImportId });
      return;
    }
    this.logger.log('Resume import completed', { resumeImportId });
  }

  private async handlePipelineError(
    job: Job<ProcessorJobData>,
    resumeImportId: string,
    error: unknown,
  ): Promise<void> {
    const existing = await this.findImportRow(resumeImportId);
    if (existing === undefined) {
      this.logger.log('resume_import.skipped_missing', { resumeImportId });
      return;
    }
    if (error instanceof BusinessError) {
      await this.markFailed(resumeImportId, error.failureReason as ImportFailureReason);
      this.logger.log('Resume import failed', { resumeImportId, failureReason: error.failureReason });
      return;
    }
    if (error instanceof DocumentExtractionError) {
      const failureReason = error.name === 'UnsupportedSourceDocumentError'
        ? 'unsupported_format'
        : 'extraction_empty';
      await this.markFailed(resumeImportId, failureReason);
      this.logger.log('Resume import failed', { resumeImportId, failureReason });
      return;
    }
    if (error instanceof AiKeyMissingError || error instanceof AiKeyRejectedError) {
      const claimed = await this.markFailed(resumeImportId, 'ai_key_rejected');
      if (!claimed) {
        return;
      }
      this.logger.log('Resume import failed', { resumeImportId, failureReason: 'ai_key_rejected' });
      throw new UnrecoverableError('DeepSeek key rejected');
    }
    if (error instanceof AiBalanceExhaustedError) {
      const claimed = await this.markFailed(resumeImportId, 'ai_balance_exhausted');
      if (!claimed) {
        return;
      }
      this.logger.log('Resume import failed', { resumeImportId, failureReason: 'ai_balance_exhausted' });
      throw new UnrecoverableError('DeepSeek balance exhausted');
    }
    if (this.isTransientError(error)) {
      if (this.isLastAttempt(job)) {
        const claimed = await this.markFailed(resumeImportId, 'ai_unavailable');
        if (!claimed) {
          return;
        }
        this.logger.log('Resume import failed', { resumeImportId, failureReason: 'ai_unavailable' });
      } else {
        this.logger.error('Resume import failed (transient, will retry)', { resumeImportId });
      }
      throw error;
    }
    if (this.isLastAttempt(job)) {
      const claimed = await this.markFailed(resumeImportId, null);
      if (!claimed) {
        return;
      }
      this.logger.log('Resume import failed', { resumeImportId, failureReason: null });
    } else {
      this.logger.error('Resume import failed (infra, will retry)', { resumeImportId });
    }
    throw error;
  }

  private async findImportRow(resumeImportId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.database
      .select({ id: resumeImports.id })
      .from(resumeImports)
      .where(eq(resumeImports.id, resumeImportId));
    return row;
  }

  private async getStorageKey(resumeImportId: string): Promise<string> {
    const [row] = await this.database
      .select({ storageKey: resumeImports.storageKey })
      .from(resumeImports)
      .where(eq(resumeImports.id, resumeImportId));
    if (row === undefined || row.storageKey === null) {
      throw new Error(`Resume import ${resumeImportId} not found or has no storage key`);
    }
    return row.storageKey;
  }

  private deriveFilename(storageKey: string): string {
    const parts = storageKey.split('/');
    return parts[parts.length - 1] ?? 'document.pdf';
  }

  private isTransientError(error: unknown): boolean {
    return error instanceof AiUnavailableError
      || error instanceof AiTimeoutError
      || error instanceof AiResponseInvalidError;
  }

  private isLastAttempt(job: Job<ProcessorJobData>): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  }

  private async markFailed(
    resumeImportId: string,
    failureReason: ImportFailureReason,
  ): Promise<boolean> {
    const [row] = await this.database
      .select({ storageKey: resumeImports.storageKey })
      .from(resumeImports)
      .where(eq(resumeImports.id, resumeImportId));
    if (row === undefined) {
      this.logger.log('resume_import.skipped_missing', { resumeImportId });
      return false;
    }
    if (row.storageKey !== null) {
      await this.objectStorage.removeSourceDocument(row.storageKey);
    }
    const updated = await this.database
      .update(resumeImports)
      .set({
        status: 'failed',
        failureReason,
        storageKey: null,
        updatedAt: new Date(),
      })
      .where(eq(resumeImports.id, resumeImportId))
      .returning({ id: resumeImports.id });
    if (updated.length === 0) {
      this.logger.log('resume_import.skipped_missing', { resumeImportId });
      return false;
    }
    return true;
  }

  private async detectWritingStyle(resumeImportId: string, text: string): Promise<WritingStyle> {
    try {
      const detected = await this.aiClient.complete({
        promptName: 'detect-writing-style',
        payload: { text },
        outputSchema: detectWritingStyleOutputSchema,
      });
      this.logger.debug('resume_import.writing_style.detected', {
        resumeImportId,
        writingMethod: detected.writingMethod,
        tone: detected.tone,
      });
      return detected;
    } catch {
      const fallback: WritingStyle = {
        writingMethod: 'free',
        tone: 'direct',
        averageBulletWords: calculateAverageBulletWords(text),
      };
      this.logger.debug('resume_import.writing_style.detected', {
        resumeImportId,
        writingMethod: fallback.writingMethod,
        tone: fallback.tone,
      });
      return fallback;
    }
  }

  private async markReady(
    resumeImportId: string,
    draft: ResumeImportDraft,
    writingStyle: WritingStyle,
  ): Promise<boolean> {
    const updated = await this.database
      .update(resumeImports)
      .set({ status: 'ready_for_review', draft, writingStyle, summary: draft.summary ?? null, updatedAt: new Date() })
      .where(eq(resumeImports.id, resumeImportId))
      .returning({ id: resumeImports.id });
    return updated.length > 0;
  }
}
