import { describe, expect, it, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { ResumeWritingProcessor } from './resume-writing.processor';
import type { ResumeDocument } from '../resume.repository';
import type { AiClient } from '../../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyRejectedError,
  AiUnavailableError,
} from '../../ai/ai-errors';
import type { Database } from '../../database/database.provider';

const RESUME_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const EVIDENCE_ID = 'ev-11111111-1111-4111-8111-111111111111';
const BULLET_ID = 'bu-11111111-1111-4111-8111-111111111111';
const SECTION_ID = 'se-11111111-1111-4111-8111-111111111111';
const ENTRY_ID = 'en-11111111-1111-4111-8111-111111111111';

function makeJob(attemptsMade = 0): never {
  return {
    data: { resumeId: RESUME_ID, userId: USER_ID },
    attemptsMade,
    opts: { attempts: 3 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as never;
}

function makeDocument(options: { bullets?: Array<{ id?: string; evidenceId?: string | null; text?: string }> } = {}) {
  const bullets = (options.bullets ?? [{ id: BULLET_ID, evidenceId: EVIDENCE_ID, text: 'placeholder' }]).map(
    (bullet, index) => ({
      id: bullet.id ?? `${BULLET_ID}-${index}`,
      entryId: ENTRY_ID,
      ordinal: index,
      text: bullet.text ?? 'Led team of five engineers',
      evidenceId: bullet.evidenceId ?? EVIDENCE_ID,
      status: 'assumed',
      suggestionQuestion: null,
      requirementId: null,
      gapKind: null,
      needsReview: false,
      editedByPerson: false,
      createdAt: new Date(),
    }),
  );
  return {
    resume: {
      id: RESUME_ID,
      userId: USER_ID,
      kind: 'base',
      name: 'Backend focus',
      language: 'en',
      template: 'comfortable',
      lengthTarget: 1,
      writingMethod: 'xyz',
      tone: 'direct',
      baseResumeId: null,
      jobDescriptionId: null,
      generationStatus: 'generating',
      failureReason: null,
      adaptationPlan: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sections: [{ id: SECTION_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, createdAt: new Date() }],
    entries: [
      { id: ENTRY_ID, sectionId: SECTION_ID, ordinal: 0, experienceId: 'exp-1', educationEntryId: null, heading: null, createdAt: new Date() },
    ],
    bullets,
    comments: [],
    exports: [],
  };
}

function makeRepository(options: {
  exists?: boolean;
  document?: ReturnType<typeof makeDocument> | undefined;
  bulletUpdates?: unknown[];
  markReadyResult?: boolean;
  markFailedResult?: boolean;
  finalWrites?: unknown[];
}) {
  const exists = options.exists ?? true;
  return {
    findResumeRow: vi.fn().mockResolvedValue(exists ? { id: RESUME_ID, kind: 'base' } : undefined),
    findDocument: vi.fn().mockResolvedValue(options.document ?? makeDocument()),
    updateBulletsAndMarkReady: vi
      .fn()
      .mockImplementation(async (_resumeId: string, updates: unknown[]) => {
        options.bulletUpdates?.push(...updates);
        return options.markReadyResult ?? true;
      }),
    replaceSynthesisAndMarkReady: vi
      .fn()
      .mockImplementation(async (input: { resumeId: string; synthesis: unknown; updates: unknown[] }) => {
        options.bulletUpdates?.push(...input.updates);
        options.finalWrites?.push(input);
        return options.markReadyResult ?? true;
      }),
    markFailed: vi.fn().mockResolvedValue(options.markFailedResult ?? true),
  };
}

function makeDatabase(clearedSteps: string[] = []): Database {
  let callIndex = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      callIndex += 1;
      if (callIndex === 1) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'profile-id' }]) }) };
      }
      if (callIndex === 2) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: EVIDENCE_ID, careerProfileId: 'profile-id', experienceId: 'exp-1', statement: 'Led team of five engineers', createdAt: new Date() },
            ]),
          }),
        };
      }
      if (callIndex === 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: 'exp-1', careerProfileId: 'profile-id', company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() },
            ]),
          }),
        };
      }
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((values: { generationStep?: string | null }) => {
        if (values.generationStep !== undefined) {
          clearedSteps.push(values.generationStep ?? 'null');
        }
        return { where: vi.fn().mockResolvedValue([]) };
      }),
    }),
  } as unknown as Database;
}

function makeAiClient(output: unknown): AiClient {
  return { complete: vi.fn().mockResolvedValue(output) };
}

describe('ResumeWritingProcessor', () => {
  it('should write experience per evidence and synthesize the summary', async () => {
    const document = makeDocument({
      bullets: [
        { id: `${BULLET_ID}-1`, evidenceId: 'ev-1', text: 'first' },
        { id: `${BULLET_ID}-2`, evidenceId: 'ev-2', text: 'second' },
      ],
    });
    (document as { sections: Array<{ id: string }> }).sections = [
      { id: 'sec-1', resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, createdAt: new Date() },
      { id: 'sec-2', resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, createdAt: new Date() },
    ] as never;
    (document as { entries: unknown[] }).entries = [
      { id: 'entry-1', sectionId: 'sec-1', ordinal: 0, experienceId: 'exp-1', educationEntryId: null, heading: null, createdAt: new Date() },
      { id: 'entry-2', sectionId: 'sec-2', ordinal: 0, experienceId: null, educationEntryId: null, heading: null, createdAt: new Date() },
    ] as never;
    (document as { bullets: unknown[] }).bullets = [
      { id: 'b-1', entryId: 'entry-1', ordinal: 0, text: 'first', evidenceId: 'ev-1', status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
      { id: 'b-2', entryId: 'entry-2', ordinal: 0, text: 'second', evidenceId: null, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
    ] as never;
    const bulletUpdates: unknown[] = [];
    const finalWrites: Array<{ resumeId: string; synthesis: Array<{ sectionId: string; bullets: unknown[] }>; updates: unknown[] }> = [];
    const repository = makeRepository({ document: document as never, bulletUpdates, finalWrites });
    const aiClient = makeAiClient({ bullets: [] });
    (aiClient.complete as ReturnType<typeof vi.fn>).mockImplementation(
      async (request: { promptName: string; payload: { evidences?: Array<{ id: string }>; sources?: string[] } }) => {
        if (request.promptName === 'write-profile-summary') {
          return {
            bullets: [
              { text: 'Valorizo codigo limpo, testes automatizados e entregas organizadas.' },
              { text: 'Busco evoluir com comunicacao clara e aprendizado continuo.' },
            ],
          };
        }
        const evidences = request.payload.evidences ?? [];
        return {
          bullets: evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Written ${evidence.id}` })),
        };
      },
    );
    let selectCalls = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCalls += 1;
        if (selectCalls === 1) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'profile-id' }]) }) };
        }
        if (selectCalls === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { id: 'ev-1', careerProfileId: 'profile-id', experienceId: 'exp-1', statement: 'First evidence statement', createdAt: new Date() },
                { id: 'ev-2', careerProfileId: 'profile-id', experienceId: null, statement: 'Second evidence statement', createdAt: new Date() },
              ]),
            }),
          };
        }
        if (selectCalls === 3) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { id: 'exp-1', careerProfileId: 'profile-id', company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() },
              ]),
            }),
          };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
      }),
    } as unknown as Database;
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await processor.process(makeJob());

    expect(aiClient.complete).toHaveBeenCalledTimes(2);
    const calls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls;
    const promptNames = calls.map((call) => (call[0] as { promptName: string }).promptName);
    expect(promptNames).toContain('write-section');
    expect(promptNames).toContain('write-profile-summary');
    expect(promptNames).not.toContain('synthesize-section');
    expect(bulletUpdates).toHaveLength(1);
    expect(repository.replaceSynthesisAndMarkReady).toHaveBeenCalledTimes(1);
    expect(finalWrites).toHaveLength(1);
    expect(finalWrites[0]?.synthesis).toHaveLength(1);
    expect(finalWrites[0]?.synthesis[0]?.sectionId).toBe('sec-2');
  });

  it('should fill resume_section_skills with the profile skills and never call the AI for skills', async () => {
    const document = makeDocument({ bullets: [] });
    (document as { sections: Array<{ id: string }> }).sections = [
      { id: 'sec-1', resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, createdAt: new Date() },
      { id: 'sec-2', resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 1, createdAt: new Date() },
    ] as never;
    (document as { entries: unknown[] }).entries = [
      { id: 'entry-1', sectionId: 'sec-1', ordinal: 0, experienceId: 'exp-1', educationEntryId: null, heading: null, createdAt: new Date() },
    ] as never;
    (document as { bullets: unknown[] }).bullets = [
      { id: 'b-1', entryId: 'entry-1', ordinal: 0, text: 'first', evidenceId: 'ev-1', status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
    ] as never;
    const bulletUpdates: unknown[] = [];
    const finalWrites: Array<{ resumeId: string; synthesis: unknown[]; updates: unknown[]; skills?: Array<{ sectionId: string; skillIds: string[] }> }> = [];
    const repository = makeRepository({ document: document as never, bulletUpdates, finalWrites });
    const aiClient = makeAiClient({ bullets: [] });
    (aiClient.complete as ReturnType<typeof vi.fn>).mockImplementation(
      async (request: { promptName: string; payload: { evidences?: Array<{ id: string }>; sectionKind?: string } }) => {
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: 'Desenvolvedor Full Stack com 2 anos de experiencia.' }] };
        }
        expect(request.payload.sectionKind).not.toBe('skills');
        const evidences = request.payload.evidences ?? [];
        return {
          bullets: evidences.map((evidence) => ({ evidenceId: evidence.id, text: `Written ${evidence.id}` })),
        };
      },
    );
    const skillA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const skillB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let selectCalls = 0;
    const database = {
      select: vi.fn().mockImplementation(() => {
        selectCalls += 1;
        if (selectCalls === 1) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 'profile-id' }]) }) };
        }
        if (selectCalls === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { id: 'ev-1', careerProfileId: 'profile-id', experienceId: 'exp-1', statement: 'First evidence statement', createdAt: new Date() },
              ]),
            }),
          };
        }
        if (selectCalls === 3) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { id: 'exp-1', careerProfileId: 'profile-id', company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() },
              ]),
            }),
          };
        }
        if (selectCalls === 4) {
          return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: skillA, careerProfileId: 'profile-id', name: 'React', group: 'Frontend', createdAt: new Date('2026-01-01T00:00:00.000Z') },
              { id: skillB, careerProfileId: 'profile-id', name: 'Docker', group: null, createdAt: new Date('2026-02-01T00:00:00.000Z') },
            ]),
          }),
        };
      }),
    } as unknown as Database;
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await processor.process(makeJob());

    const calls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls;
    const promptNames = calls.map((call) => (call[0] as { promptName: string }).promptName);
    expect(promptNames).not.toContain('synthesize-section');
    for (const call of calls) {
      expect((call[0] as { payload: { sectionKind?: string } }).payload.sectionKind).not.toBe('skills');
    }
    expect(repository.replaceSynthesisAndMarkReady).toHaveBeenCalledTimes(1);
    expect(finalWrites).toHaveLength(1);
    const skills = finalWrites[0]?.skills ?? [];
    expect(skills).toHaveLength(1);
    expect(skills[0]?.sectionId).toBe('sec-2');
    expect(skills[0]?.skillIds).toEqual([skillA, skillB]);
  });


  it('should turn text with an unsupported number into a suggestion', async () => {
    const bulletUpdates: Array<{ status: string; gapKind: string | null; suggestionQuestion: string | null }> = [];
    const repository = makeRepository({ bulletUpdates: bulletUpdates as unknown[] });
    const database = makeDatabase();
    const aiClient = makeAiClient({
      bullets: [{ evidenceId: EVIDENCE_ID, text: 'Reduced latency by 30% tuning queries' }],
    });
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await processor.process(makeJob());

    expect(bulletUpdates).toHaveLength(1);
    expect(bulletUpdates[0]?.status).toBe('suggestion');
    expect(bulletUpdates[0]?.gapKind).toBe('detail');
    expect(bulletUpdates[0]?.suggestionQuestion).toContain('30%');
  });

  it('should mark ai_key_rejected without retry when the key is rejected', async () => {
    const repository = makeRepository({});
    const database = makeDatabase();
    const aiClient: AiClient = { complete: vi.fn().mockRejectedValue(new AiKeyRejectedError()) };
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await expect(processor.process(makeJob(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(repository.markFailed).toHaveBeenCalledWith(RESUME_ID, 'ai_key_rejected');
  });

  it('should mark ai_balance_exhausted without retry when the balance is gone', async () => {
    const repository = makeRepository({});
    const database = makeDatabase();
    const aiClient: AiClient = { complete: vi.fn().mockRejectedValue(new AiBalanceExhaustedError()) };
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await expect(processor.process(makeJob(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(repository.markFailed).toHaveBeenCalledWith(RESUME_ID, 'ai_balance_exhausted');
  });

  it('should keep generating on first transient failure and mark ai_unavailable on the last', async () => {
    const firstRepository = makeRepository({});
    const firstProcessor = new ResumeWritingProcessor(makeDatabase(), {
      complete: vi.fn().mockRejectedValue(new AiUnavailableError(503)),
    } as unknown as AiClient, firstRepository as never);

    await expect(firstProcessor.process(makeJob(0))).rejects.toBeInstanceOf(AiUnavailableError);
    expect(firstRepository.markFailed).not.toHaveBeenCalled();

    const lastRepository = makeRepository({});
    const clearedSteps: string[] = [];
    const lastProcessor = new ResumeWritingProcessor(makeDatabase(clearedSteps), {
      complete: vi.fn().mockRejectedValue(new AiUnavailableError(503)),
    } as unknown as AiClient, lastRepository as never);

    await expect(lastProcessor.process(makeJob(2))).rejects.toBeInstanceOf(AiUnavailableError);
    expect(lastRepository.markFailed).toHaveBeenCalledWith(RESUME_ID, 'ai_unavailable');
    expect(clearedSteps).toContain('null');
  });

  it('should clear generationStep when the failure is reported', async () => {
    const repository = makeRepository({});
    const clearedSteps: string[] = [];
    const database = makeDatabase(clearedSteps);
    const aiClient: AiClient = { complete: vi.fn().mockRejectedValue(new AiKeyRejectedError()) };
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await expect(processor.process(makeJob(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(repository.markFailed).toHaveBeenCalledWith(RESUME_ID, 'ai_key_rejected');
    expect(clearedSteps).toContain('null');
  });

  it('should stop without error when the resume no longer exists', async () => {
    const repository = makeRepository({ exists: false });
    const database = makeDatabase();
    const aiClient = makeAiClient({ bullets: [] });
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await processor.process(makeJob());

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('should stop without error when the target disappears before the final write', async () => {
    const repository = makeRepository({ markReadyResult: false });
    const database = makeDatabase();
    const aiClient = makeAiClient({
      bullets: [{ evidenceId: EVIDENCE_ID, text: 'Led team of five engineers at Acme' }],
    });
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await processor.process(makeJob());

    expect(repository.replaceSynthesisAndMarkReady).toHaveBeenCalledTimes(1);
  });

  it('should never send contact data to the AI', async () => {
    const bulletUpdates: unknown[] = [];
    const repository = makeRepository({ bulletUpdates });
    const database = makeDatabase();
    const aiClient = makeAiClient({
      bullets: [{ evidenceId: EVIDENCE_ID, text: 'Led team of five engineers' }],
    });
    const processor = new ResumeWritingProcessor(database, aiClient, repository as never);

    await processor.process(makeJob());

    const calls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]).toBeDefined();
    const payloadString = JSON.stringify((calls[0]![0] as { payload: unknown }).payload);
    expect(payloadString).not.toContain('fullName');
    expect(payloadString).not.toContain('email');
    expect(payloadString).not.toContain('phone');
    expect(payloadString).not.toContain('contact');
  });

  it('should keep contact out of the pipeline document', () => {
    const document = makeDocument() as unknown as ResumeDocument;

    expect(document).not.toHaveProperty('contact');
    expect(document).not.toHaveProperty('experiences');
    expect(document).not.toHaveProperty('educationEntries');
    // @ts-expect-error - contact must never ride the pipeline document (ADR 0008)
    const leaked = document.contact;
    expect(leaked).toBeUndefined();
  });
});
