import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Job, UnrecoverableError } from 'bullmq';
import { ResumeImportProcessor } from './resume-import.processor';
import type { AiClient } from '../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from '../ai/ai-errors';
import type { DocumentExtractor, ExtractedDocument } from './document-extractor';
import { EmptySourceDocumentError, UnsupportedSourceDocumentError } from './document-extractor';
import type { ObjectStorage } from '../storage/object-storage';
import type { Database } from '../database/database.provider';
import type { ResumeImportDraft } from 'schema/contracts/resume-import';

const RESUME_IMPORT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_ID = 'user-123';
const STORAGE_KEY = 'source-documents/user-123/resume.pdf';

const SAMPLE_EMAIL = 'mariana@example.com';
const SAMPLE_PHONE = '(11) 91234-5678';
const SAMPLE_NAME = 'Mariana Quartz';

const RESUME_TEXT = [
  `# ${SAMPLE_NAME}`,
  '',
  '### Backend Developer',
  '',
  '## SUMMARY',
  'Backend developer focused on Python services for eight years.',
  '',
  '## EXPERIENCE',
  '### Northwind Software',
  'Lead Engineer (2020-2024)',
  '',
  `Email: ${SAMPLE_EMAIL}`,
  `Phone: ${SAMPLE_PHONE}`,
].join('\n');

const AI_OUTPUT = {
  evidences: [
    { statement: 'Backend developer with 8 years of Python experience' },
    { statement: 'Lead Engineer at Northwind Software (2020-2024)' },
  ],
  experiences: [
    { company: 'Northwind Software', role: 'Lead Engineer', startedOn: '2020', endedOn: '2024' },
  ],
  education: [],
};

function makeExtracted(hasTextLayer: boolean, text: string): ExtractedDocument {
  return { hasTextLayer, readingOrderText: text, pageCount: 1 };
}

function makeJob(
  data: { resumeImportId: string; userId: string },
  options: { attemptsMade?: number; attempts?: number } = {},
): Job {
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
    attemptsMade: options.attemptsMade ?? 0,
    opts: { attempts: options.attempts ?? 3 },
  } as unknown as Job;
}

interface CapturedUpdate {
  readonly status?: string;
  readonly failureReason?: string | null;
  readonly storageKey?: string | null;
  readonly draft?: ResumeImportDraft;
  readonly summary?: string | null;
  readonly writingStyle?: { readonly writingMethod: string; readonly tone: string; readonly averageBulletWords: number };
  readonly updatedAt?: Date;
}

function makeDatabase(options: {
  exists?: boolean;
  storageKey?: string | null;
  updates: CapturedUpdate[];
  updateReturning?: Array<{ id: string }>;
}): Database {
  const exists = options.exists ?? true;
  const storageKey = options.storageKey !== undefined ? options.storageKey : STORAGE_KEY;
  const updateReturning = options.updateReturning ?? [{ id: RESUME_IMPORT_ID }];
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(
          exists ? [{ id: RESUME_IMPORT_ID, storageKey }] : [],
        ),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn((values: CapturedUpdate) => {
        options.updates.push(values);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(updateReturning),
          }),
        };
      }),
    }),
  } as unknown as Database;
}

function makeObjectStorage(): ObjectStorage {
  return {
    getSourceDocument: vi.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
    putSourceDocument: vi.fn(),
    removeSourceDocument: vi.fn().mockResolvedValue(undefined),
    removeSourceDocumentsOf: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDocumentExtractor(result: ExtractedDocument | Error): DocumentExtractor {
  if (result instanceof Error) {
    return { extract: vi.fn().mockRejectedValue(result) };
  }
  return { extract: vi.fn().mockResolvedValue(result) };
}

const WRITING_STYLE_OUTPUT = {
  writingMethod: 'free',
  tone: 'direct',
  averageBulletWords: 12,
};

function makeAiClient(output: unknown = AI_OUTPUT): AiClient {
  return {
    complete: vi.fn(async (request: { promptName: string }) => {
      if (request.promptName === 'detect-writing-style') {
        return WRITING_STYLE_OUTPUT;
      }
      return output;
    }),
  } as unknown as AiClient;
}

describe('ResumeImportProcessor', () => {
  let database: Database;
  let databaseUpdates: CapturedUpdate[];
  let objectStorage: ObjectStorage;
  let documentExtractor: DocumentExtractor;
  let aiClient: AiClient;
  let processor: ResumeImportProcessor;

  beforeEach(() => {
    databaseUpdates = [];
    database = makeDatabase({ updates: databaseUpdates });
    objectStorage = makeObjectStorage();
    documentExtractor = makeDocumentExtractor(makeExtracted(true, RESUME_TEXT));
    aiClient = makeAiClient();
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
  });

  it('should execute the five steps in order: download, extract, strip contact, AI, save', async () => {
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(job.updateProgress).toHaveBeenCalledTimes(5);
    expect(job.updateProgress).toHaveBeenNthCalledWith(1, { step: 'downloading', percent: 10 });
    expect(job.updateProgress).toHaveBeenNthCalledWith(2, { step: 'extracting', percent: 30 });
    expect(job.updateProgress).toHaveBeenNthCalledWith(3, { step: 'stripping_contact', percent: 50 });
    expect(job.updateProgress).toHaveBeenNthCalledWith(4, { step: 'structuring', percent: 60 });
    expect(job.updateProgress).toHaveBeenNthCalledWith(5, { step: 'saving', percent: 90 });

    expect(objectStorage.getSourceDocument).toHaveBeenCalledWith(STORAGE_KEY);
    expect(documentExtractor.extract).toHaveBeenCalledWith({
      filename: 'resume.pdf',
      content: expect.any(Buffer),
    });
    expect(aiClient.complete).toHaveBeenCalledTimes(2);
  });

  it('should short-circuit when hasTextLayer is false and NOT call AiClient', async () => {
    documentExtractor = makeDocumentExtractor(makeExtracted(false, ''));
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('no_text_layer');
  });

  it('should pass text WITHOUT contact details to the AiClient', async () => {
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    const calls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const payloadText = (call[0] as { payload: { text: string } }).payload.text;
      expect(payloadText).not.toContain(SAMPLE_EMAIL);
      expect(payloadText).not.toContain(SAMPLE_PHONE);
      expect(payloadText).not.toContain(SAMPLE_NAME);
      expect(payloadText).toContain('Backend developer');
      expect(payloadText).toContain('Northwind Software');
    }
  });

  it('should map BusinessError to the corresponding failure reason', async () => {
    documentExtractor = makeDocumentExtractor(makeExtracted(true, '   '));
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('extraction_empty');
  });

  it('should map no_text_layer failure without calling AiClient', async () => {
    documentExtractor = makeDocumentExtractor(makeExtracted(false, ''));
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('no_text_layer');
  });

  it('should map UnsupportedSourceDocumentError to unsupported_format', async () => {
    documentExtractor = makeDocumentExtractor(new UnsupportedSourceDocumentError('file.docx'));
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('unsupported_format');
  });

  it('should map EmptySourceDocumentError to extraction_empty', async () => {
    documentExtractor = makeDocumentExtractor(new EmptySourceDocumentError('empty.pdf'));
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('extraction_empty');
  });

  it('should rethrow transient errors on the first attempt without marking failure', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiUnavailableError(500),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(databaseUpdates).toHaveLength(0);
    expect(objectStorage.removeSourceDocument).not.toHaveBeenCalled();
  });

  it('should not mark failure on the second attempt for a transient error', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiTimeoutError(60000),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 1, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(AiTimeoutError);
    expect(databaseUpdates).toHaveLength(0);
    expect(objectStorage.removeSourceDocument).not.toHaveBeenCalled();
  });

  it('should mark ai_unavailable only on the last attempt for transient errors', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiUnavailableError(503),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 2, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('ai_unavailable');
    expect(update?.storageKey).toBeNull();
    expect(objectStorage.removeSourceDocument).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('should treat AiResponseInvalidError as transient and mark ai_unavailable on the last attempt', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiResponseInvalidError('schema_mismatch'),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const firstJob = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(firstJob)).rejects.toBeInstanceOf(AiResponseInvalidError);
    expect(databaseUpdates).toHaveLength(0);

    const lastJob = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 2, attempts: 3 },
    );

    await expect(processor.process(lastJob)).rejects.toBeInstanceOf(AiResponseInvalidError);
    expect(databaseUpdates).toHaveLength(1);
    expect(databaseUpdates[0]?.failureReason).toBe('ai_unavailable');
  });

  it('should mark ai_key_rejected without retry when the key is missing', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiKeyMissingError(),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('ai_key_rejected');
    expect(update?.storageKey).toBeNull();
    expect(objectStorage.removeSourceDocument).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('should mark ai_key_rejected without retry when the key is rejected', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiKeyRejectedError(),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(databaseUpdates).toHaveLength(1);
    expect(databaseUpdates[0]?.failureReason).toBe('ai_key_rejected');
    expect(objectStorage.removeSourceDocument).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('should mark ai_balance_exhausted without retry when the balance is gone', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiBalanceExhaustedError(),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('ai_balance_exhausted');
    expect(objectStorage.removeSourceDocument).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('should rethrow unexpected errors on the first attempt without marking failure', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('infra boom'),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toThrow('infra boom');
    expect(databaseUpdates).toHaveLength(0);
    expect(objectStorage.removeSourceDocument).not.toHaveBeenCalled();
  });

  it('should mark failure with a null reason on the last attempt for unexpected errors', async () => {
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('infra boom'),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 2, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toThrow('infra boom');
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBeNull();
    expect(objectStorage.removeSourceDocument).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('should stop without error when the import no longer exists', async () => {
    databaseUpdates = [];
    database = makeDatabase({ exists: false, updates: databaseUpdates });
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(documentExtractor.extract).not.toHaveBeenCalled();
    expect(databaseUpdates).toHaveLength(0);
    expect(objectStorage.removeSourceDocument).not.toHaveBeenCalled();
  });

  it('should stop without throwing when the row disappears before the final write', async () => {
    databaseUpdates = [];
    database = makeDatabase({ updates: databaseUpdates, updateReturning: [] });
    aiClient = makeAiClient();
    (aiClient.complete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AiUnavailableError(503),
    );
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob(
      { resumeImportId: RESUME_IMPORT_ID, userId: USER_ID },
      { attemptsMade: 2, attempts: 3 },
    );

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
  });

  it('should save the draft with contactDetails in the database on success', async () => {
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('ready_for_review');
    expect(update?.draft?.evidences).toEqual(AI_OUTPUT.evidences);
    expect(update?.draft?.experiences).toEqual(AI_OUTPUT.experiences);
    expect(update?.draft?.education).toEqual(AI_OUTPUT.education);
    expect(update?.draft?.contactDetails.email).toBe(SAMPLE_EMAIL);
    expect(update?.draft?.contactDetails.phone).toBe(SAMPLE_PHONE);
    expect(update?.draft?.contactDetails.fullName).toBe(SAMPLE_NAME);
    expect(update?.draft?.contactDetails.city).toBeNull();
  });

  it('should save the extracted city in the draft when the header carries one', async () => {
    const textWithCity = [
      '# Mariana Quartz',
      '',
      'Quixadá, CE',
      '',
      '## SUMMARY',
      'Backend developer focused on Python services for eight years.',
      '',
      '## EXPERIENCE',
      '### Northwind Software',
      'Lead Engineer (2020-2024)',
    ].join('\n');
    documentExtractor = makeDocumentExtractor(makeExtracted(true, textWithCity));
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.draft?.contactDetails.city).toBe('Quixadá, CE');
    const calls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls;
    const payloadText = (calls[0]![0] as { payload: { text: string } }).payload.text;
    expect(payloadText).toContain('[CITY REMOVED]');
    expect(payloadText).not.toContain('Quixadá');
  });

  it('should throw BusinessError when extracted text is nearly empty', async () => {
    documentExtractor = makeDocumentExtractor(makeExtracted(true, 'ab'));
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('failed');
    expect(update?.failureReason).toBe('extraction_empty');
  });

  it('should save detected writing style alongside the draft', async () => {
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('ready_for_review');
    expect(update?.writingStyle).toEqual(WRITING_STYLE_OUTPUT);
  });

  it('should fall back to free, direct and a local average when style detection fails', async () => {
    const failingStyleClient: AiClient = {
      complete: vi.fn(async (request: { promptName: string }) => {
        if (request.promptName === 'detect-writing-style') {
          throw new AiUnavailableError(503);
        }
        return AI_OUTPUT;
      }),
    } as unknown as AiClient;
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, failingStyleClient);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.status).toBe('ready_for_review');
    expect(update?.writingStyle?.writingMethod).toBe('free');
    expect(update?.writingStyle?.tone).toBe('direct');
    expect(update?.writingStyle?.averageBulletWords).toBeGreaterThan(0);
  });

  it('should carry extraction skills, languages and certifications into the draft', async () => {
    const aiWithNewFields = {
      complete: vi.fn(async (request: { promptName: string }) => {
        if (request.promptName === 'detect-writing-style') {
          return WRITING_STYLE_OUTPUT;
        }
        return {
          ...AI_OUTPUT,
          skills: [{ name: 'Node.js', group: null }],
          languages: [{ name: 'English', level: 'Advanced' }],
          certifications: [{ name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' }],
          sectionOrder: ['experience', 'skills'],
        };
      }),
    } as unknown as AiClient;
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiWithNewFields);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.draft?.skills).toEqual([{ name: 'Node.js', group: null }]);
    expect(update?.draft?.languages).toEqual([{ name: 'English', level: 'Advanced' }]);
    expect(update?.draft?.certifications).toEqual([
      { name: 'Scrum Foundations', issuer: 'CertiProf', year: '2021' },
    ]);
  });

  it('should carry the objetivo summary into the draft and keep it out of evidences', async () => {
    const summary =
      'Estudante de Engenharia de Software buscando estágio ou primeira oportunidade em desenvolvimento Fullstack.';
    const aiWithSummary = {
      complete: vi.fn(async (request: { promptName: string }) => {
        if (request.promptName === 'detect-writing-style') {
          return WRITING_STYLE_OUTPUT;
        }
        return { ...AI_OUTPUT, summary };
      }),
    } as unknown as AiClient;
    processor = new ResumeImportProcessor(database, objectStorage, documentExtractor, aiWithSummary);
    const job = makeJob({ resumeImportId: RESUME_IMPORT_ID, userId: USER_ID });

    await processor.process(job);

    expect(databaseUpdates).toHaveLength(1);
    const [update] = databaseUpdates;
    expect(update?.draft?.summary).toBe(summary);
    expect(update?.summary).toBe(summary);
    expect(
      update?.draft?.evidences.some((evidence) => evidence.statement.includes('Estudante')),
    ).toBe(false);
  });
});
