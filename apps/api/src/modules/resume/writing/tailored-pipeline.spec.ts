import { describe, expect, it, vi } from 'vitest';
import { runTailorPipeline } from './tailored-pipeline';
import type { AiClient } from '../../ai/ai-client';

const RESUME_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const BASE_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const EXPERIENCE_ID = '22222222-2222-4222-8222-222222222222';
const SECTION_EXP_ID = '33333333-3333-4333-8333-333333333333';
const SECTION_SUM_ID = '44444444-4444-4555-8555-555555555555';
const EVIDENCE_A = '55555555-5555-4555-8555-555555555555';
const EVIDENCE_B = '66666666-6666-4666-8666-666666666666';
const REQUIREMENT_A = '77777777-7777-4777-8777-777777777777';
const REQUIREMENT_B = '88888888-8888-4888-8888-888888888888';

const STATEMENT_A = 'Led engineering team at Acme';
const STATEMENT_B = 'Shipped checkout flow at Acme';

function tailoredRow() {
  return {
    id: RESUME_ID,
    userId: USER_ID,
    kind: 'tailored',
    name: 'Tailored',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 1,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: BASE_ID,
    jobDescriptionId: '99999999-9999-4999-8999-999999999999',
    generationStatus: 'generating',
    generationStep: null,
    failureReason: null,
    adaptationPlan: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function tailoredDocument() {
  return {
    resume: tailoredRow(),
    sections: [
      { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
      { id: SECTION_SUM_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
    ],
    entries: [],
    bullets: [],
    comments: [],
    exports: [],
  };
}

function baseDocument() {
  return {
    resume: { ...tailoredRow(), id: BASE_ID, kind: 'base', baseResumeId: null, jobDescriptionId: null },
    sections: [],
    entries: [],
    bullets: [
      { id: 'bullet-a', entryId: 'entry-a', ordinal: 0, text: STATEMENT_A, evidenceId: EVIDENCE_A, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
    ],
    comments: [],
    exports: [],
  };
}

function planResult() {
  return {
    allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A, EVIDENCE_B] }],
    coverages: [
      { requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null },
      { requirementId: REQUIREMENT_B, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeSelectMock() {
  const calls: string[] = [];
  const select = vi.fn().mockImplementation(() => {
    const index = calls.length;
    calls.push(`select-${index}`);
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          if (index === 0) {
            return [{ id: PROFILE_ID }];
          }
          if (index === 1) {
            return [
              { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_A, createdAt: new Date() },
              { id: EVIDENCE_B, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_B, createdAt: new Date() },
            ];
          }
          if (index === 2) {
            return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
          }
          if (index === 3) {
            return [];
          }
          if (index === 4) {
            return [];
          }
          if (index === 5) {
            return [
              { id: REQUIREMENT_A, jobDescriptionId: 'job', literalTerm: 'Leadership', concept: 'Leadership', normalizedConcept: 'leadership', kind: 'mandatory', ordinal: 0, createdAt: new Date() },
              { id: REQUIREMENT_B, jobDescriptionId: 'job', literalTerm: 'Kubernetes', concept: 'Kubernetes', normalizedConcept: 'kubernetes', kind: 'mandatory', ordinal: 1, createdAt: new Date() },
            ];
          }
          if (index === 6) {
            return [{ rawText: 'Senior Engineer\nBuild systems' }];
          }
          if (index === 7) {
            return [
              { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
              { id: SECTION_SUM_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
            ];
          }
          return [];
        }),
      }),
    };
  });
  return { select, calls };
}

function makeUpdateMock(steps: Array<string | null>) {
  return vi.fn().mockImplementation(() => ({
    set: (values: { generationStep: string | null }) => ({
      where: async () => {
        steps.push(values.generationStep);
        return [];
      },
    }),
  }));
}

function makeTransactionMock(insertedSections: string[], steps?: Array<string | null>) {
  return vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
    const tx = {
      insert: vi.fn().mockImplementation(() => ({
        values: (values: { sectionId?: string }) => ({
          returning: async () => {
            if (values.sectionId !== undefined) {
              insertedSections.push(values.sectionId);
            }
            return [{ id: 'new-entry-id' }];
          },
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((values: { generationStep?: string | null }) => {
          if (values.generationStep !== undefined && steps !== undefined) {
            steps.push(values.generationStep);
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: async () => [{ id: RESUME_ID }],
            }),
          };
        }),
      }),
      delete: vi.fn(),
      select: vi.fn(),
    };
    return callback(tx);
  });
}

function makeRepository() {
  return {
    findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
      if (resumeId === RESUME_ID) {
        return tailoredDocument() as never;
      }
      return baseDocument() as never;
    }),
  };
}

function countByPrompt(calls: Array<{ promptName: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const call of calls) {
    counts.set(call.promptName, (counts.get(call.promptName) ?? 0) + 1);
  }
  return counts;
}

describe('runTailorPipeline parallelism', () => {
  it('should start write, synthesis and suggestions before any finishes', async () => {
    const steps: Array<string | null> = [];
    const insertedSections: string[] = [];
    const { select } = makeSelectMock();
    const update = makeUpdateMock(steps);
    const transaction = makeTransactionMock(insertedSections, steps);
    const database = { select, update, transaction } as never;
    const repository = makeRepository() as never;
    const started: string[] = [];
    const writeGate = deferred<{ bullets: Array<{ evidenceId: string; text: string }> }>();
    const synthesisGate = deferred<{ bullets: Array<{ text: string }> }>();
    const suggestionsGate = deferred<{ suggestions: Array<{ requirementId: string; gapKind: 'existence'; question: string; draftBullet: string }> }>();
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: { evidences?: Array<{ id: string }> } }) => {
        started.push(request.promptName);
        if (request.promptName === 'plan-adaptation') {
          return planResult();
        }
        if (request.promptName === 'write-section') {
          return writeGate.promise;
        }
        if (request.promptName === 'write-profile-summary') {
          return synthesisGate.promise;
        }
        if (request.promptName === 'draft-suggestions') {
          return suggestionsGate.promise;
        }
        return { bullets: [] };
      }),
    } as unknown as AiClient;
    const pipeline = runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toContain('write-section');
    expect(started).toContain('write-profile-summary');
    expect(started).toContain('draft-suggestions');
    writeGate.resolve({ bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }, { evidenceId: EVIDENCE_B, text: STATEMENT_B }] });
    synthesisGate.resolve({ bullets: [{ text: STATEMENT_A }] });
    suggestionsGate.resolve({ suggestions: [] });
    await pipeline;
    expect(steps).toContain('planning');
    expect(steps[steps.length - 1]).toBeNull();
  });

  it('should preserve section order when synthesis finishes first', async () => {
    const steps: Array<string | null> = [];
    const insertedSections: string[] = [];
    const { select } = makeSelectMock();
    const update = makeUpdateMock(steps);
    const transaction = makeTransactionMock(insertedSections, steps);
    const database = { select, update, transaction } as never;
    const repository = makeRepository() as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return planResult();
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-section') {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }, { evidenceId: EVIDENCE_B, text: STATEMENT_B }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    const firstExperience = insertedSections.indexOf(SECTION_EXP_ID);
    const firstSummary = insertedSections.indexOf(SECTION_SUM_ID);
    expect(firstExperience).toBeGreaterThanOrEqual(0);
    expect(firstSummary).toBeGreaterThanOrEqual(0);
    expect(firstExperience).toBeLessThan(firstSummary);
  });

  it('should call plan once and clear the step when synthesis fails', async () => {
    const steps: Array<string | null> = [];
    const insertedSections: string[] = [];
    const { select } = makeSelectMock();
    const update = makeUpdateMock(steps);
    const transaction = makeTransactionMock(insertedSections, steps);
    const database = { select, update, transaction } as never;
    const repository = makeRepository() as never;
    const promptNames: Array<{ promptName: string }> = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: { evidences?: unknown } }) => {
        promptNames.push({ promptName: request.promptName });
        if (request.promptName === 'plan-adaptation') {
          return planResult();
        }
        if (request.promptName === 'write-profile-summary') {
          throw new Error('synthesis failed');
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }, { evidenceId: EVIDENCE_B, text: STATEMENT_B }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await expect(
      runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() }),
    ).rejects.toThrow('synthesis failed');
    expect(countByPrompt(promptNames).get('plan-adaptation')).toBe(1);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[steps.length - 1]).toBeNull();
  });

  it('should record planning, writing, suggesting, saving and null in order', async () => {
    const steps: Array<string | null> = [];
    const insertedSections: string[] = [];
    const { select } = makeSelectMock();
    const update = makeUpdateMock(steps);
    const transaction = makeTransactionMock(insertedSections, steps);
    const database = { select, update, transaction } as never;
    const repository = makeRepository() as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return planResult();
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }, { evidenceId: EVIDENCE_B, text: STATEMENT_B }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    expect(steps).toEqual(['planning', 'writing', 'suggesting', 'saving', null]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('runTailorPipeline experience grouping', () => {
  const EXP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const EXP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const EXP_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const EXP_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const EVID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
  const EVID_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
  const EVID_NONE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const BASE_EXP_SECTION = '99999999-9999-4999-8999-999999999999';

  function makeGroupingSelect(input: {
    readonly evidences: Array<{ id: string; experienceId: string | null; statement: string }>;
    readonly experiences: Array<{ id: string; company: string; role: string; startedOn: string; endedOn: string | null }>;
    readonly requirements: Array<{ id: string }>;
  }) {
    const calls: string[] = [];
    const select = vi.fn().mockImplementation(() => {
      const index = calls.length;
      calls.push(`select-${index}`);
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => {
            if (index === 0) {
              return [{ id: PROFILE_ID }];
            }
            if (index === 1) {
              return input.evidences.map((evidence) => ({
                id: evidence.id,
                careerProfileId: PROFILE_ID,
                experienceId: evidence.experienceId,
                statement: evidence.statement,
                createdAt: new Date(),
              }));
            }
            if (index === 2) {
              return input.experiences.map((experience) => ({
                id: experience.id,
                careerProfileId: PROFILE_ID,
                company: experience.company,
                role: experience.role,
                startedOn: experience.startedOn,
                endedOn: experience.endedOn,
                createdAt: new Date(),
              }));
            }
            if (index === 3) {
              return [];
            }
            if (index === 4) {
              return [];
            }
            if (index === 5) {
              return input.requirements.map((requirement, ordinal) => ({
                id: requirement.id,
                jobDescriptionId: 'job',
                literalTerm: 'Leadership',
                concept: 'Leadership',
                normalizedConcept: 'leadership',
                kind: 'mandatory',
                ordinal,
                createdAt: new Date(),
              }));
            }
            if (index === 6) {
              return [{ rawText: 'Engineer\nBuild systems' }];
            }
            if (index === 7) {
              return [
                { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
              ];
            }
            return [];
          }),
        }),
      };
    });
    return { select };
  }

  function makeGroupingRepository(input: {
    readonly baseEntries: Array<{ id: string; ordinal: number; experienceId: string | null }>;
    readonly baseBullets: Array<{ evidenceId: string }>;
  }) {
    return {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return {
            resume: tailoredRow(),
            sections: [
              { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
            ],
            entries: [],
            bullets: [],
            comments: [],
            exports: [],
          } as never;
        }
        return {
          resume: { ...tailoredRow(), id: BASE_ID, kind: 'base', baseResumeId: null, jobDescriptionId: null },
          sections: [
            { id: BASE_EXP_SECTION, resumeId: BASE_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
          ],
          entries: input.baseEntries.map((entry) => ({
            id: entry.id,
            sectionId: BASE_EXP_SECTION,
            ordinal: entry.ordinal,
            experienceId: entry.experienceId,
            educationEntryId: null,
            heading: null,
            createdAt: new Date(),
          })),
          bullets: input.baseBullets.map((bullet, ordinal) => ({
            id: `base-bullet-${ordinal}`,
            entryId: 'base-entry',
            ordinal,
            text: 'base',
            evidenceId: bullet.evidenceId,
            status: 'assumed',
            suggestionQuestion: null,
            requirementId: null,
            gapKind: null,
            needsReview: false,
            editedByPerson: false,
            createdAt: new Date(),
          })),
          comments: [],
          exports: [],
        } as never;
      }),
    };
  }

  function makeGroupingTransaction() {
    const entryInserts: Array<{ id: string; sectionId: string; ordinal: number; experienceId: string | null }> = [];
    const bulletInserts: Array<{ entryId: string; ordinal: number; evidenceId: string | null }> = [];
    let counter = 0;
    const tx = {
      insert: vi.fn().mockImplementation(() => ({
        values: (values: { sectionId?: string; entryId?: string; ordinal?: number; experienceId?: string | null; evidenceId?: string | null }) => {
          if (values.sectionId === undefined) {
            bulletInserts.push({ entryId: values.entryId as string, ordinal: values.ordinal ?? 0, evidenceId: values.evidenceId ?? null });
            return {};
          }
          return {
            returning: async () => {
              counter += 1;
              const id = `entry-${counter}`;
              entryInserts.push({ id, sectionId: values.sectionId as string, ordinal: values.ordinal ?? 0, experienceId: values.experienceId ?? null });
              return [{ id }];
            },
          };
        },
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: async () => [{ id: RESUME_ID }],
          }),
        }),
      }),
      delete: vi.fn(),
      select: vi.fn(),
    };
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => callback(tx));
    return { transaction, entryInserts, bulletInserts };
  }

  it('should create one entry per experience in base order', async () => {
    const { select } = makeGroupingSelect({
      evidences: [
        { id: EVIDENCE_A, experienceId: EXP_A, statement: STATEMENT_A },
        { id: EVIDENCE_B, experienceId: EXP_B, statement: STATEMENT_B },
      ],
      experiences: [
        { id: EXP_A, company: 'Granite Corp', role: 'Data Engineer', startedOn: '2018-01-01', endedOn: '2020-01-01' },
        { id: EXP_B, company: 'Northwind', role: 'Senior Engineer', startedOn: '2020-06-01', endedOn: null },
      ],
      requirements: [{ id: REQUIREMENT_A }],
    });
    const repository = makeGroupingRepository({
      baseEntries: [
        { id: 'base-entry-a', ordinal: 0, experienceId: EXP_A },
        { id: 'base-entry-b', ordinal: 1, experienceId: EXP_B },
      ],
      baseBullets: [{ evidenceId: EVIDENCE_A }, { evidenceId: EVIDENCE_B }],
    });
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const { transaction, entryInserts, bulletInserts } = makeGroupingTransaction();
    const database = { select, update, transaction } as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_B, EVIDENCE_A] }],
            coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_B, text: 'Bullet B' }, { evidenceId: EVIDENCE_A, text: 'Bullet A' }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository: repository as never }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    const experienceEntries = entryInserts.filter((entry) => entry.sectionId === SECTION_EXP_ID);
    expect(experienceEntries).toHaveLength(2);
    expect(experienceEntries.map((entry) => entry.experienceId)).toEqual([EXP_A, EXP_B]);
    expect(experienceEntries.map((entry) => entry.ordinal)).toEqual([0, 1]);
    const bulletsByEntry = new Map(bulletInserts.map((bullet) => [bullet.entryId, [] as string[]]));
    for (const bullet of bulletInserts) {
      bulletsByEntry.get(bullet.entryId)!.push(bullet.evidenceId as string);
    }
    const firstId = experienceEntries[0]!.id;
    const secondId = experienceEntries[1]!.id;
    expect(bulletsByEntry.get(firstId)).toEqual([EVIDENCE_A]);
    expect(bulletsByEntry.get(secondId)).toEqual([EVIDENCE_B]);
  });

  it('should put evidences without experience last and missing experiences by start date', async () => {
    const { select } = makeGroupingSelect({
      evidences: [
        { id: EVIDENCE_A, experienceId: EXP_A, statement: STATEMENT_A },
        { id: EVID_C, experienceId: EXP_C, statement: 'Built data lake' },
        { id: EVID_D, experienceId: EXP_D, statement: 'Maintained ETL' },
        { id: EVID_NONE, experienceId: null, statement: 'General achievement' },
      ],
      experiences: [
        { id: EXP_A, company: 'Granite Corp', role: 'Data Engineer', startedOn: '2020-01-01', endedOn: '2022-01-01' },
        { id: EXP_C, company: 'Recent Co', role: 'Staff Engineer', startedOn: '2023-01-01', endedOn: null },
        { id: EXP_D, company: 'Old Co', role: 'Junior Engineer', startedOn: '2019-01-01', endedOn: '2019-12-31' },
      ],
      requirements: [{ id: REQUIREMENT_A }],
    });
    const repository = makeGroupingRepository({
      baseEntries: [{ id: 'base-entry-a', ordinal: 0, experienceId: EXP_A }],
      baseBullets: [{ evidenceId: EVIDENCE_A }],
    });
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const { transaction, entryInserts, bulletInserts } = makeGroupingTransaction();
    const database = { select, update, transaction } as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVID_NONE, EVID_D, EVID_C, EVIDENCE_A] }],
            coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          return {
            bullets: [
              { evidenceId: EVID_NONE, text: 'General achievement' },
              { evidenceId: EVID_D, text: 'Maintained ETL' },
              { evidenceId: EVID_C, text: 'Built data lake' },
              { evidenceId: EVIDENCE_A, text: STATEMENT_A },
            ],
          };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository: repository as never }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    const experienceEntries = entryInserts.filter((entry) => entry.sectionId === SECTION_EXP_ID);
    expect(experienceEntries).toHaveLength(4);
    expect(experienceEntries.map((entry) => entry.experienceId)).toEqual([EXP_A, EXP_C, EXP_D, null]);
    expect(experienceEntries.map((entry) => entry.ordinal)).toEqual([0, 1, 2, 3]);
    const lastId = experienceEntries[3]!.id;
    const lastBullets = bulletInserts.filter((bullet) => bullet.entryId === lastId).map((bullet) => bullet.evidenceId);
    expect(lastBullets).toEqual([EVID_NONE]);
  });
  function makeBug23Repository(pairs: ReadonlyArray<{ readonly entryId: string; readonly ordinal: number; readonly experienceId: string; readonly evidenceId: string }>) {
    return {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return {
            resume: tailoredRow(),
            sections: [{ id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() }],
            entries: [],
            bullets: [],
            comments: [],
            exports: [],
          } as never;
        }
        return {
          resume: { ...tailoredRow(), id: BASE_ID, kind: 'base', baseResumeId: null, jobDescriptionId: null },
          sections: [{ id: BASE_EXP_SECTION, resumeId: BASE_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() }],
          entries: pairs.map((pair) => ({ id: pair.entryId, sectionId: BASE_EXP_SECTION, ordinal: pair.ordinal, experienceId: pair.experienceId, educationEntryId: null, heading: null, createdAt: new Date() })),
          bullets: pairs.map((pair, ordinal) => ({ id: `base-bullet-${ordinal}`, entryId: pair.entryId, ordinal, text: 'base', evidenceId: pair.evidenceId, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() })),
          comments: [],
          exports: [],
        } as never;
      }),
    };
  }
  it('should keep all four base experiences in base order when the plan only covers two', async () => {
    const { select } = makeGroupingSelect({
      evidences: [{ id: EVIDENCE_A, experienceId: EXP_A, statement: STATEMENT_A }, { id: EVIDENCE_B, experienceId: EXP_B, statement: STATEMENT_B }, { id: EVID_C, experienceId: EXP_C, statement: 'Built data lake' }, { id: EVID_D, experienceId: EXP_D, statement: 'Maintained ETL' }],
      experiences: [{ id: EXP_A, company: 'Granite Corp', role: 'Data Engineer', startedOn: '2018-01-01', endedOn: '2020-01-01' }, { id: EXP_B, company: 'Northwind', role: 'Senior Engineer', startedOn: '2020-06-01', endedOn: null }, { id: EXP_C, company: 'Recent Co', role: 'Staff Engineer', startedOn: '2023-01-01', endedOn: null }, { id: EXP_D, company: 'Old Co', role: 'Junior Engineer', startedOn: '2019-01-01', endedOn: '2019-12-31' }],
      requirements: [{ id: REQUIREMENT_A }],
    });
    const repository = makeBug23Repository([{ entryId: 'base-entry-a', ordinal: 0, experienceId: EXP_A, evidenceId: EVIDENCE_A }, { entryId: 'base-entry-b', ordinal: 1, experienceId: EXP_B, evidenceId: EVIDENCE_B }, { entryId: 'base-entry-c', ordinal: 2, experienceId: EXP_C, evidenceId: EVID_C }, { entryId: 'base-entry-d', ordinal: 3, experienceId: EXP_D, evidenceId: EVID_D }]);
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const { transaction, entryInserts } = makeGroupingTransaction();
    const database = { select, update, transaction } as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: { evidences?: Array<{ id: string }> } }) => {
        if (request.promptName === 'plan-adaptation') {
          return { allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_B, EVIDENCE_A] }], coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }] };
        }
        if (request.promptName === 'write-section') {
          return { bullets: (request.payload.evidences ?? []).map((evidence) => ({ evidenceId: evidence.id, text: `Bullet ${evidence.id}` })) };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository: repository as never }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    const experienceEntries = entryInserts.filter((entry) => entry.sectionId === SECTION_EXP_ID);
    expect(experienceEntries).toHaveLength(4);
    expect(experienceEntries.map((entry) => entry.experienceId)).toEqual([EXP_A, EXP_B, EXP_C, EXP_D]);
  });
  it('should create an entry for every experience with evidence when there is no base resume', async () => {
    const { select } = makeGroupingSelect({
      evidences: [{ id: EVIDENCE_A, experienceId: EXP_A, statement: STATEMENT_A }, { id: EVIDENCE_B, experienceId: EXP_B, statement: STATEMENT_B }, { id: EVID_C, experienceId: EXP_C, statement: 'Built data lake' }, { id: EVID_D, experienceId: EXP_D, statement: 'Maintained ETL' }],
      experiences: [{ id: EXP_A, company: 'Granite Corp', role: 'Data Engineer', startedOn: '2018-01-01', endedOn: '2020-01-01' }, { id: EXP_B, company: 'Northwind', role: 'Senior Engineer', startedOn: '2020-06-01', endedOn: null }, { id: EXP_C, company: 'Recent Co', role: 'Staff Engineer', startedOn: '2023-01-01', endedOn: null }, { id: EXP_D, company: 'Old Co', role: 'Junior Engineer', startedOn: '2019-01-01', endedOn: '2019-12-31' }],
      requirements: [{ id: REQUIREMENT_A }],
    });
    const repository = {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return { resume: tailoredRow(), sections: [{ id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() }], entries: [], bullets: [], comments: [], exports: [] } as never;
        }
        return undefined;
      }),
    };
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const { transaction, entryInserts } = makeGroupingTransaction();
    const database = { select, update, transaction } as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: { evidences?: Array<{ id: string }> } }) => {
        if (request.promptName === 'plan-adaptation') {
          return { allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A, EVIDENCE_B] }], coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }] };
        }
        if (request.promptName === 'write-section') {
          return { bullets: (request.payload.evidences ?? []).map((evidence) => ({ evidenceId: evidence.id, text: `Bullet ${evidence.id}` })) };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository: repository as never }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    const experienceEntries = entryInserts.filter((entry) => entry.sectionId === SECTION_EXP_ID);
    expect(experienceEntries).toHaveLength(4);
    expect([...experienceEntries.map((entry) => entry.experienceId)].sort()).toEqual([EXP_A, EXP_B, EXP_C, EXP_D].sort());
  });
});

describe('runTailorPipeline translation', () => {
  const PT_A = 'Liderei uma equipe de cinco pessoas na empresa';
  const PT_B = 'Entreguei o novo fluxo de pagamento com a equipe';
  const EN_A = 'Led a team of five engineers at the company';
  const EN_B = 'Delivered the new checkout flow with the team';

  it('should translate fallback bullets left in the base language', async () => {
    const { select } = (function makePortugueseSelect() {
      const calls: string[] = [];
      const select = vi.fn().mockImplementation(() => {
        const index = calls.length;
        calls.push(`select-${index}`);
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(async () => {
              if (index === 0) {
                return [{ id: PROFILE_ID }];
              }
              if (index === 1) {
                return [
                  { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: PT_A, createdAt: new Date() },
                  { id: EVIDENCE_B, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: PT_B, createdAt: new Date() },
                ];
              }
              if (index === 2) {
                return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
              }
              if (index === 3) {
                return [];
              }
              if (index === 4) {
                return [];
              }
              if (index === 5) {
                return [
                  { id: REQUIREMENT_A, jobDescriptionId: 'job', literalTerm: 'Leadership', concept: 'Leadership', normalizedConcept: 'leadership', kind: 'mandatory', ordinal: 0, createdAt: new Date() },
                ];
              }
              if (index === 6) {
                return [{ rawText: 'Engineer\nBuild systems' }];
              }
              if (index === 7) {
                return [
                  { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
                ];
              }
              return [];
            }),
          }),
        };
      });
      return { select };
    })();
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const bulletTexts: string[] = [];
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: (values: { sectionId?: string; entryId?: string; text?: string }) => {
            if (values.text !== undefined) {
              bulletTexts.push(values.text);
              return {};
            }
            return {
              returning: async () => [{ id: 'new-entry-id' }],
            };
          },
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: async () => [{ id: RESUME_ID }],
            }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return callback(tx);
    });
    const database = { select, update, transaction } as never;
    const repository = makeRepository() as never;
    let writeCalls = 0;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A, EVIDENCE_B] }],
            coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          writeCalls += 1;
          if (writeCalls === 1) {
            return { bullets: [{ evidenceId: EVIDENCE_A, text: EN_A }] };
          }
          return { bullets: [{ evidenceId: EVIDENCE_B, text: EN_B }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    expect(writeCalls).toBe(2);
    expect(bulletTexts).toContain(EN_A);
    expect(bulletTexts).toContain(EN_B);
    expect(bulletTexts).not.toContain(PT_A);
    expect(bulletTexts).not.toContain(PT_B);
  });

  it('should skip the translation pass when every bullet is already in the target language', async () => {
    const { select } = makeSelectMock();
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const insertedSections: string[] = [];
    const transaction = makeTransactionMock(insertedSections, steps);
    const database = { select, update, transaction } as never;
    const repository = makeRepository() as never;
    const writeSectionCalls: unknown[] = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return planResult();
        }
        if (request.promptName === 'write-section') {
          writeSectionCalls.push(request);
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }, { evidenceId: EVIDENCE_B, text: STATEMENT_B }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });
    expect(writeSectionCalls).toHaveLength(1);
  });
});

describe('runTailorPipeline job-aware summary and skills', () => {
  const SKILL_NEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SKILL_PG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SKILL_DOCKER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const SUMMARY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const SKILLS_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  it('should carry the job title and its NestJS/PostgreSQL requirements into the summary input with mandatory first', async () => {
    const calls: string[] = [];
    const select = vi.fn().mockImplementation(() => {
      const index = calls.length;
      calls.push(`select-${index}`);
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => {
            if (index === 0) {
              return [{ id: PROFILE_ID }];
            }
            if (index === 1) {
              return [
                { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_A, createdAt: new Date() },
              ];
            }
            if (index === 2) {
              return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Desenvolvedor Back-end', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
            }
            if (index === 3) {
              return [];
            }
            if (index === 4) {
              return [
                { id: SKILL_DOCKER, careerProfileId: PROFILE_ID, name: 'Docker', group: null, createdAt: new Date('2026-01-01T00:00:00.000Z') },
                { id: SKILL_PG, careerProfileId: PROFILE_ID, name: 'PostgreSQL', group: 'Back-end', createdAt: new Date('2026-02-01T00:00:00.000Z') },
                { id: SKILL_NEST, careerProfileId: PROFILE_ID, name: 'NestJS', group: 'Back-end', createdAt: new Date('2026-03-01T00:00:00.000Z') },
              ];
            }
            if (index === 5) {
              return [
                { id: REQUIREMENT_A, jobDescriptionId: 'job', literalTerm: 'NestJS', concept: 'NestJS framework', normalizedConcept: 'nestjs', kind: 'mandatory', ordinal: 0, createdAt: new Date() },
                { id: REQUIREMENT_B, jobDescriptionId: 'job', literalTerm: 'PostgreSQL', concept: 'PostgreSQL database', normalizedConcept: 'postgresql', kind: 'mandatory', ordinal: 1, createdAt: new Date() },
              ];
            }
            if (index === 6) {
              return [{ rawText: 'Desenvolvedor Back-end\nConstruir APIs escalaveis' }];
            }
            if (index === 7) {
              return [
                { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
                { id: SUMMARY_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
                { id: SKILLS_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 2, undoSnapshot: null, createdAt: new Date() },
              ];
            }
            return [];
          }),
        }),
      };
    });
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const skillInserts: Array<{ sectionId: string; skillId: string; ordinal: number }> = [];
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: (values: { sectionId?: string; skillId?: string; entryId?: string; ordinal?: number; text?: string }) => {
            if (values.skillId !== undefined && values.sectionId !== undefined) {
              skillInserts.push({ sectionId: values.sectionId, skillId: values.skillId, ordinal: values.ordinal ?? 0 });
              return {};
            }
            if (values.sectionId !== undefined) {
              return { returning: async () => [{ id: 'new-entry-id' }] };
            }
            return {};
          },
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: async () => [{ id: RESUME_ID }] }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return callback(tx);
    });
    const database = { select, update, transaction } as never;
    const repository = {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return {
            resume: tailoredRow(),
            sections: [
              { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
              { id: SUMMARY_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
              { id: SKILLS_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 2, undoSnapshot: null, createdAt: new Date() },
            ],
            entries: [],
            bullets: [],
            comments: [],
            exports: [],
          } as never;
        }
        return baseDocument() as never;
      }),
    } as never;
    const seen: Array<{ promptName: string; payload: Record<string, unknown> }> = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: Record<string, unknown> }) => {
        seen.push({ promptName: request.promptName, payload: request.payload });
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: 'Desenvolvedora Back-end com experiencia em NestJS e PostgreSQL.' }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    const summaryCall = seen.find((call) => call.promptName === 'write-profile-summary');
    expect(summaryCall).toBeDefined();
    const payload = summaryCall!.payload as {
      jobTitle: string | null;
      requirements: Array<{ literalTerm: string; concept: string }>;
    };
    expect(payload.jobTitle).toContain('Desenvolvedor Back-end');
    expect(payload.requirements.map((item) => item.literalTerm)).toEqual(['NestJS', 'PostgreSQL']);
    const forSkills = skillInserts.filter((row) => row.sectionId === SKILLS_ID).sort((a, b) => a.ordinal - b.ordinal);
    expect(forSkills.map((row) => row.skillId)).toEqual([SKILL_PG, SKILL_NEST, SKILL_DOCKER]);
  });

  it('should separate behavioral requirements into softRequirements for the job summary', async () => {
    const calls: string[] = [];
    const select = vi.fn().mockImplementation(() => {
      const index = calls.length;
      calls.push(`select-${index}`);
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => {
            if (index === 0) {
              return [{ id: PROFILE_ID }];
            }
            if (index === 1) {
              return [
                { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_A, createdAt: new Date() },
              ];
            }
            if (index === 2) {
              return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Desenvolvedor Back-end', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
            }
            if (index === 3) {
              return [];
            }
            if (index === 4) {
              return [
                { id: SKILL_NEST, careerProfileId: PROFILE_ID, name: 'NestJS', group: 'Back-end', createdAt: new Date('2026-03-01T00:00:00.000Z') },
              ];
            }
            if (index === 5) {
              return [
                { id: REQUIREMENT_A, jobDescriptionId: 'job', literalTerm: 'NestJS', concept: 'NestJS framework', normalizedConcept: 'nestjs', kind: 'mandatory', ordinal: 0, createdAt: new Date() },
                { id: REQUIREMENT_B, jobDescriptionId: 'job', literalTerm: 'boa comunicação', concept: 'comunicacao em time', normalizedConcept: 'boa comunicacao', kind: 'mandatory', ordinal: 1, createdAt: new Date() },
              ];
            }
            if (index === 6) {
              return [{ rawText: 'Desenvolvedor Back-end\nConstruir APIs escalaveis' }];
            }
            if (index === 7) {
              return [
                { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
                { id: SUMMARY_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
                { id: SKILLS_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 2, undoSnapshot: null, createdAt: new Date() },
              ];
            }
            return [];
          }),
        }),
      };
    });
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: () => ({
            returning: async () => [{ id: 'new-entry-id' }],
          }),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: async () => [{ id: RESUME_ID }] }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return callback(tx);
    });
    const database = { select, update, transaction } as never;
    const repository = {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return {
            resume: tailoredRow(),
            sections: [
              { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
              { id: SUMMARY_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
              { id: SKILLS_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 2, undoSnapshot: null, createdAt: new Date() },
            ],
            entries: [],
            bullets: [],
            comments: [],
            exports: [],
          } as never;
        }
        return baseDocument() as never;
      }),
    } as never;
    const seen: Array<{ promptName: string; payload: Record<string, unknown> }> = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: Record<string, unknown> }) => {
        seen.push({ promptName: request.promptName, payload: request.payload });
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: 'Desenvolvedora Back-end com experiencia em NestJS.' }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    const summaryCall = seen.find((call) => call.promptName === 'write-profile-summary');
    expect(summaryCall).toBeDefined();
    const payload = summaryCall!.payload as {
      requirements: Array<{ literalTerm: string }>;
      softRequirements: Array<{ literalTerm: string }>;
    };
    expect(payload.requirements.map((item) => item.literalTerm)).toEqual(['NestJS']);
    expect(payload.softRequirements.map((item) => item.literalTerm)).toEqual(['boa comunicação']);
  });

  it('should keep the base languages section on the tailored resume without sending it to the planner', async () => {
    const LANGUAGES_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const calls: string[] = [];
    const select = vi.fn().mockImplementation(() => {
      const index = calls.length;
      calls.push(`select-${index}`);
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => {
            if (index === 0) {
              return [{ id: PROFILE_ID }];
            }
            if (index === 1) {
              return [
                { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_A, createdAt: new Date() },
              ];
            }
            if (index === 2) {
              return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
            }
            if (index === 3) {
              return [];
            }
            if (index === 4) {
              return [];
            }
            if (index === 5) {
              return [
                { id: REQUIREMENT_A, jobDescriptionId: 'job', literalTerm: 'Leadership', concept: 'Leadership', normalizedConcept: 'leadership', kind: 'mandatory', ordinal: 0, createdAt: new Date() },
              ];
            }
            if (index === 6) {
              return [{ rawText: 'Senior Engineer\nBuild systems' }];
            }
            if (index === 7) {
              return [
                { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
                { id: SUMMARY_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
                { id: SKILLS_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 2, undoSnapshot: null, createdAt: new Date() },
                { id: LANGUAGES_ID, resumeId: RESUME_ID, kind: 'languages', title: null, ordinal: 3, undoSnapshot: null, createdAt: new Date() },
              ];
            }
            return [];
          }),
        }),
      };
    });
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: () => ({
            returning: async () => [{ id: 'new-entry-id' }],
          }),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: async () => [{ id: RESUME_ID }] }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return callback(tx);
    });
    const database = { select, update, transaction } as never;
    const tailoredSections = [
      { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
      { id: SUMMARY_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
      { id: SKILLS_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 2, undoSnapshot: null, createdAt: new Date() },
      { id: LANGUAGES_ID, resumeId: RESUME_ID, kind: 'languages', title: null, ordinal: 3, undoSnapshot: null, createdAt: new Date() },
    ];
    const repository = {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return {
            resume: tailoredRow(),
            sections: tailoredSections,
            entries: [],
            bullets: [],
            comments: [],
            exports: [],
          } as never;
        }
        return baseDocument() as never;
      }),
    } as never;
    const seen: Array<{ promptName: string; payload: Record<string, unknown> }> = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: Record<string, unknown> }) => {
        seen.push({ promptName: request.promptName, payload: request.payload });
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(tailoredSections.map((section) => section.kind)).toContain('languages');
    const planCall = seen.find((call) => call.promptName === 'plan-adaptation');
    expect(planCall).toBeDefined();
    const budgets = (planCall!.payload as { sectionBudgets: Array<{ sectionKind: string }> }).sectionBudgets;
    expect(budgets.map((budget) => budget.sectionKind)).not.toContain('languages');
    expect(budgets.map((budget) => budget.sectionKind)).not.toContain('certifications');
  });
});

describe('runTailorPipeline summary fallback', () => {
  it('should use the base summary when every synthesized sentence is rejected twice', async () => {
    const BASE_SUM_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaa0001';
    const BASE_SUM_ENTRY = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaa0002';
    const BASE_TEXT_A = 'Estudante de Engenharia de Software buscando estagio com React.';
    const BASE_TEXT_B = 'Valorizo codigo limpo e entregas organizadas.';
    const calls: string[] = [];
    const select = vi.fn().mockImplementation(() => {
      const index = calls.length;
      calls.push(`select-${index}`);
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => {
            if (index === 0) {
              return [{ id: PROFILE_ID }];
            }
            if (index === 1) {
              return [
                { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_A, createdAt: new Date() },
              ];
            }
            if (index === 2) {
              return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
            }
            if (index === 3) {
              return [];
            }
            if (index === 4) {
              return [
                { id: '99999999-9999-4999-8999-999999999991', careerProfileId: PROFILE_ID, name: 'React', group: null, createdAt: new Date('2026-01-01T00:00:00.000Z') },
              ];
            }
            if (index === 5) {
              return [
                { id: REQUIREMENT_A, jobDescriptionId: 'job', literalTerm: 'Leadership', concept: 'Leadership', normalizedConcept: 'leadership', kind: 'mandatory', ordinal: 0, createdAt: new Date() },
              ];
            }
            if (index === 6) {
              return [{ rawText: 'Engineer\nBuild systems' }];
            }
            if (index === 7) {
              return [
                { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
                { id: SECTION_SUM_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
              ];
            }
            return [];
          }),
        }),
      };
    });
    const steps: Array<string | null> = [];
    const update = makeUpdateMock(steps);
    const bulletTexts: string[] = [];
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: (values: { sectionId?: string; entryId?: string; text?: string }) => {
            if (values.text !== undefined) {
              bulletTexts.push(values.text);
              return {};
            }
            return { returning: async () => [{ id: 'new-entry-id' }] };
          },
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: async () => [{ id: RESUME_ID }] }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return callback(tx);
    });
    const database = { select, update, transaction } as never;
    const repository = {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return {
            resume: tailoredRow(),
            sections: [
              { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
              { id: SECTION_SUM_ID, resumeId: RESUME_ID, kind: 'summary', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
            ],
            entries: [],
            bullets: [],
            comments: [],
            exports: [],
          } as never;
        }
        return {
          resume: { ...tailoredRow(), id: BASE_ID, kind: 'base', baseResumeId: null, jobDescriptionId: null },
          sections: [
            { id: BASE_SUM_ID, resumeId: BASE_ID, kind: 'summary', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
          ],
          entries: [
            { id: BASE_SUM_ENTRY, sectionId: BASE_SUM_ID, ordinal: 0, experienceId: null, educationEntryId: null, heading: null, createdAt: new Date() },
          ],
          bullets: [
            { id: 'base-bullet-a', entryId: BASE_SUM_ENTRY, ordinal: 0, text: BASE_TEXT_A, evidenceId: null, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
            { id: 'base-bullet-b', entryId: BASE_SUM_ENTRY, ordinal: 1, text: BASE_TEXT_B, evidenceId: null, status: 'assumed', suggestionQuestion: null, requirementId: null, gapKind: null, needsReview: false, editedByPerson: false, createdAt: new Date() },
          ],
          comments: [],
          exports: [],
        } as never;
      }),
    } as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQUIREMENT_A, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: 'Trabalho com Kafka em projetos.' }, { text: 'Tenho experiencia com Flink em dados.' }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(bulletTexts).toContain(BASE_TEXT_A);
    expect(bulletTexts).toContain(BASE_TEXT_B);
    const fallbackLogs = logSpy.mock.calls.filter(([message]) => message === 'resume.summary.fallback_to_base');
    expect(fallbackLogs.length).toBeGreaterThan(0);
    expect(fallbackLogs[0]?.[1]).toMatchObject({ sectionId: SECTION_SUM_ID });
    logSpy.mockRestore();
  });
});

describe('runTailorPipeline skill proposals', () => {
  const SKILL_NEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const REQ_NEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const REQ_FASTIFY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const SKILLS_SECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function makeSkillSelect(input: {
    readonly skills: Array<{ id: string; name: string; group: string | null }>;
    readonly requirements: Array<{ id: string; literalTerm: string }>;
  }) {
    const calls: string[] = [];
    const select = vi.fn().mockImplementation(() => {
      const index = calls.length;
      calls.push(`select-${index}`);
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => {
            if (index === 0) {
              return [{ id: PROFILE_ID }];
            }
            if (index === 1) {
              return [
                { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_A, createdAt: new Date() },
              ];
            }
            if (index === 2) {
              return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
            }
            if (index === 3) {
              return [];
            }
            if (index === 4) {
              return input.skills.map((skill) => ({
                id: skill.id,
                careerProfileId: PROFILE_ID,
                name: skill.name,
                group: skill.group,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              }));
            }
            if (index === 5) {
              return input.requirements.map((requirement, ordinal) => ({
                id: requirement.id,
                jobDescriptionId: 'job',
                literalTerm: requirement.literalTerm,
                concept: requirement.literalTerm,
                normalizedConcept: requirement.literalTerm.toLowerCase(),
                kind: 'mandatory',
                ordinal,
                createdAt: new Date(),
              }));
            }
            if (index === 6) {
              return [{ rawText: 'Engineer\nBuild systems' }];
            }
            if (index === 7) {
              return [
                { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
                { id: SKILLS_SECTION_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
              ];
            }
            return [];
          }),
        }),
      };
    });
    return { select };
  }

  function makeSkillRepository() {
    return {
      findDocument: vi.fn().mockImplementation(async (resumeId: string) => {
        if (resumeId === RESUME_ID) {
          return {
            resume: tailoredRow(),
            sections: [
              { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
              { id: SKILLS_SECTION_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
            ],
            entries: [],
            bullets: [],
            comments: [],
            exports: [],
          } as never;
        }
        return baseDocument() as never;
      }),
    };
  }

  function makeCapturingTransaction() {
    const proposalValues: Array<Record<string, unknown>> = [];
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: (values: Record<string, unknown>) => {
            if (typeof values.kind === 'string' && typeof values.name === 'string') {
              proposalValues.push(values);
              return {};
            }
            if (values.sectionId !== undefined && values.skillId !== undefined) {
              return {};
            }
            return { returning: async () => [{ id: 'new-entry-id' }] };
          },
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: async () => [{ id: RESUME_ID }] }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return callback(tx);
    });
    return { transaction, proposalValues };
  }

  it('should save accepted additions for unmatched requirements', async () => {
    const { select } = makeSkillSelect({
      skills: [{ id: SKILL_NEST_ID, name: 'NestJS', group: 'Back-end' }],
      requirements: [
        { id: REQ_NEST_ID, literalTerm: 'NestJS' },
        { id: REQ_FASTIFY_ID, literalTerm: 'Fastify' },
      ],
    });
    const update = makeUpdateMock([]);
    const { transaction, proposalValues } = makeCapturingTransaction();
    const database = { select, update, transaction } as never;
    const repository = makeSkillRepository() as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [
              { requirementId: REQ_NEST_ID, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null },
              { requirementId: REQ_FASTIFY_ID, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
            ],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        if (request.promptName === 'suggest-tailored-skills') {
          return {
            additions: [{ name: 'Fastify', group: 'Back-end', requirementTerm: 'Fastify' }],
            swaps: [],
          };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(proposalValues).toHaveLength(1);
    expect(proposalValues[0]).toMatchObject({
      sectionId: SKILLS_SECTION_ID,
      kind: 'addition',
      name: 'Fastify',
      group: 'Back-end',
      requirementId: REQ_FASTIFY_ID,
      status: 'accepted',
      ordinal: 0,
    });
  });

  it('should still save the tailored document with zero proposals when the skill suggestion fails', async () => {
    const { select } = makeSkillSelect({
      skills: [{ id: SKILL_NEST_ID, name: 'NestJS', group: 'Back-end' }],
      requirements: [{ id: REQ_FASTIFY_ID, literalTerm: 'Fastify' }],
    });
    const update = makeUpdateMock([]);
    const { transaction, proposalValues } = makeCapturingTransaction();
    const database = { select, update, transaction } as never;
    const repository = makeSkillRepository() as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQ_FASTIFY_ID, coverage: 'gap', evidenceId: null, gapKind: 'existence' }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        if (request.promptName === 'suggest-tailored-skills') {
          throw new Error('skill ai failed');
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(proposalValues).toHaveLength(0);
    const failureLogs = errorSpy.mock.calls.filter(([message]) => message === 'resume.skill_proposals.failed');
    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]?.[1]).toMatchObject({ resumeId: RESUME_ID });
    expect(JSON.stringify(failureLogs[0]?.[1])).not.toContain('Fastify');
    errorSpy.mockRestore();
  });

  it('should not call the skill AI when every requirement already matches a skill', async () => {
    const { select } = makeSkillSelect({
      skills: [{ id: SKILL_NEST_ID, name: 'NestJS', group: 'Back-end' }],
      requirements: [{ id: REQ_NEST_ID, literalTerm: 'NestJS' }],
    });
    const update = makeUpdateMock([]);
    const { transaction, proposalValues } = makeCapturingTransaction();
    const database = { select, update, transaction } as never;
    const repository = makeSkillRepository() as never;
    const seen: string[] = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        seen.push(request.promptName);
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQ_NEST_ID, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(seen).not.toContain('suggest-tailored-skills');
    expect(proposalValues).toHaveLength(0);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('should never propose a denied requirement as a skill', async () => {
    const calls: string[] = [];
    const select = vi.fn().mockImplementation(() => {
      const index = calls.length;
      calls.push(`select-${index}`);
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => {
            if (index === 0) {
              return [{ id: PROFILE_ID }];
            }
            if (index === 1) {
              return [
                { id: EVIDENCE_A, careerProfileId: PROFILE_ID, experienceId: EXPERIENCE_ID, statement: STATEMENT_A, createdAt: new Date() },
              ];
            }
            if (index === 2) {
              return [{ id: EXPERIENCE_ID, careerProfileId: PROFILE_ID, company: 'Acme', role: 'Engineer', startedOn: '2020-01-01', endedOn: null, createdAt: new Date() }];
            }
            if (index === 3) {
              return [];
            }
            if (index === 4) {
              return [{ id: SKILL_NEST_ID, careerProfileId: PROFILE_ID, name: 'NestJS', group: 'Back-end', createdAt: new Date('2026-01-01T00:00:00.000Z') }];
            }
            if (index === 5) {
              return [
                { id: REQ_NEST_ID, jobDescriptionId: 'job', literalTerm: 'NestJS', concept: 'NestJS', normalizedConcept: 'nestjs', kind: 'mandatory', ordinal: 0, createdAt: new Date() },
                { id: REQ_FASTIFY_ID, jobDescriptionId: 'job', literalTerm: 'Fastify', concept: 'Fastify', normalizedConcept: 'fastify', kind: 'mandatory', ordinal: 1, createdAt: new Date() },
              ];
            }
            if (index === 6) {
              return [{ rawText: 'Engineer\nBuild systems' }];
            }
            if (index === 7) {
              return [
                { id: SECTION_EXP_ID, resumeId: RESUME_ID, kind: 'experience', title: null, ordinal: 0, undoSnapshot: null, createdAt: new Date() },
                { id: SKILLS_SECTION_ID, resumeId: RESUME_ID, kind: 'skills', title: null, ordinal: 1, undoSnapshot: null, createdAt: new Date() },
              ];
            }
            return [{ normalizedConcept: 'fastify' }];
          }),
        }),
      };
    });
    const update = makeUpdateMock([]);
    const { transaction, proposalValues } = makeCapturingTransaction();
    const database = { select, update, transaction } as never;
    const repository = makeSkillRepository() as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [
              { requirementId: REQ_NEST_ID, coverage: 'covered', evidenceId: EVIDENCE_A, gapKind: null },
              { requirementId: REQ_FASTIFY_ID, coverage: 'gap', evidenceId: null, gapKind: 'existence' },
            ],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        if (request.promptName === 'suggest-tailored-skills') {
          return { additions: [], swaps: [] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(proposalValues).toHaveLength(0);
  });

  it('should send the existing profile groups to the skill AI', async () => {
    const { select } = makeSkillSelect({
      skills: [
        { id: SKILL_NEST_ID, name: 'NestJS', group: 'Back-end' },
        { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', name: 'Go', group: 'Linguagens' },
      ],
      requirements: [{ id: REQ_FASTIFY_ID, literalTerm: 'Docker' }],
    });
    const update = makeUpdateMock([]);
    const { transaction } = makeCapturingTransaction();
    const database = { select, update, transaction } as never;
    const repository = makeSkillRepository() as never;
    const seen: Array<{ promptName: string; payload: Record<string, unknown> }> = [];
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string; payload: Record<string, unknown> }) => {
        seen.push({ promptName: request.promptName, payload: request.payload });
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQ_FASTIFY_ID, coverage: 'gap', evidenceId: null, gapKind: 'existence' }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        if (request.promptName === 'suggest-tailored-skills') {
          return { additions: [], swaps: [] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    const skillCall = seen.find((call) => call.promptName === 'suggest-tailored-skills');
    expect(skillCall).toBeDefined();
    expect(skillCall!.payload).toMatchObject({ existingGroups: expect.arrayContaining(['Back-end', 'Linguagens']) });
  });

  it('should not generate a suggestion for a requirement already cited in a bullet', async () => {
    const { select } = makeSkillSelect({
      skills: [{ id: SKILL_NEST_ID, name: 'NestJS', group: 'Back-end' }],
      requirements: [{ id: REQ_FASTIFY_ID, literalTerm: 'Led engineering' }],
    });
    const update = makeUpdateMock([]);
    const suggestionBullets: Array<Record<string, unknown>> = [];
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: (values: Record<string, unknown>) => {
            if (typeof values.text === 'string' && values.status === 'suggestion') {
              suggestionBullets.push(values);
              return {};
            }
            if (typeof values.kind === 'string' && typeof values.name === 'string') {
              return {};
            }
            return { returning: async () => [{ id: 'new-entry-id' }] };
          },
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: async () => [{ id: RESUME_ID }] }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return callback(tx);
    });
    const database = { select, update, transaction } as never;
    const repository = makeSkillRepository() as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQ_FASTIFY_ID, coverage: 'gap', evidenceId: null, gapKind: 'existence' }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        if (request.promptName === 'draft-suggestions') {
          return {
            suggestions: [
              { requirementId: REQ_FASTIFY_ID, gapKind: 'existence', question: 'Have you led engineering?', draftBullet: 'Led engineering efforts.', experienceId: null },
            ],
          };
        }
        return { additions: [], swaps: [] };
      }),
    } as unknown as AiClient;

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(suggestionBullets).toHaveLength(0);
  });

  it('should still save the tailored document when gap suggestions fail', async () => {
    const { select } = makeSkillSelect({
      skills: [{ id: SKILL_NEST_ID, name: 'NestJS', group: 'Back-end' }],
      requirements: [{ id: REQ_FASTIFY_ID, literalTerm: 'Fastify' }],
    });
    const update = makeUpdateMock([]);
    const { transaction, proposalValues } = makeCapturingTransaction();
    const database = { select, update, transaction } as never;
    const repository = makeSkillRepository() as never;
    const aiClient = {
      complete: vi.fn().mockImplementation(async (request: { promptName: string }) => {
        if (request.promptName === 'plan-adaptation') {
          return {
            allocations: [{ sectionKind: 'experience', evidenceIds: [EVIDENCE_A] }],
            coverages: [{ requirementId: REQ_FASTIFY_ID, coverage: 'gap', evidenceId: null, gapKind: 'existence' }],
          };
        }
        if (request.promptName === 'write-section') {
          return { bullets: [{ evidenceId: EVIDENCE_A, text: STATEMENT_A }] };
        }
        if (request.promptName === 'write-profile-summary') {
          return { bullets: [{ text: STATEMENT_A }, { text: STATEMENT_A }] };
        }
        if (request.promptName === 'draft-suggestions') {
          throw new Error('gap ai failed');
        }
        if (request.promptName === 'suggest-tailored-skills') {
          return { additions: [], swaps: [] };
        }
        return { suggestions: [] };
      }),
    } as unknown as AiClient;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runTailorPipeline({ database, aiClient, repository }, { resumeId: RESUME_ID, userId: USER_ID, startedAt: Date.now() });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(proposalValues.length).toBeGreaterThanOrEqual(0);
    const failureLogs = errorSpy.mock.calls.filter(([message]) => message === 'resume.gap_suggestions.failed');
    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]?.[1]).toMatchObject({ resumeId: RESUME_ID });
    expect(JSON.stringify(failureLogs[0]?.[1])).not.toContain('Fastify');
    errorSpy.mockRestore();
  });
});
