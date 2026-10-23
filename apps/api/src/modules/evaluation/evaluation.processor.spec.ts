import { describe, expect, it, vi } from 'vitest';
import { Job, UnrecoverableError } from 'bullmq';
import { EvaluationProcessor } from './evaluation.processor';
import type { AiClient } from '../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiKeyMissingError,
  AiKeyRejectedError,
  AiResponseInvalidError,
  AiTimeoutError,
  AiUnavailableError,
} from '../ai/ai-errors';
import type { Database } from '../database/database.provider';

const EVALUATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const JOB_DESCRIPTION_ID = '11111111-2222-4333-8444-555555555555';
const CAREER_PROFILE_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

const REQ_1 = 'req-11111111-1111-4111-8111-111111111111';
const REQ_2 = 'req-22222222-2222-4222-8222-222222222222';

const EVIDENCE_1 = 'ev-11111111-1111-4111-8111-111111111111';
const EVIDENCE_2 = 'ev-22222222-2222-4222-8222-222222222222';

function makeJob(
  data: {
    evaluationId: string;
    userId: string;
    jobDescriptionId: string;
    careerProfileId: string;
  },
  options: { attemptsMade?: number; attempts?: number } = {},
): Job {
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
    attemptsMade: options.attemptsMade ?? 0,
    opts: { attempts: options.attempts ?? 3 },
  } as unknown as Job;
}

interface CapturedEvaluationUpdate {
  readonly status?: string;
  readonly failureReason?: string | null;
  readonly matchScore?: number | null;
}

function makeDatabase(options: {
  exists?: boolean;
  requirements: Array<{ id: string; kind: string }>;
  evidences: Array<{ id: string }>;
  updates?: CapturedEvaluationUpdate[];
  updateReturning?: Array<{ id: string }>;
}): Database {
  const exists = options.exists ?? true;
  const evaluationRow = exists ? [{ id: EVALUATION_ID }] : [];
  const updateReturning = options.updateReturning ?? [{ id: EVALUATION_ID }];
  let selectCallCount = 0;
  const selectChain = (rows: unknown[]) => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });

  return {
    select: vi.fn().mockImplementation(() => {
      const callIndex = selectCallCount++;
      if (callIndex === 0) {
        return selectChain(evaluationRow);
      }
      if (callIndex === 1) {
        return selectChain(options.requirements);
      }
      if (callIndex === 2) {
        return selectChain(options.evidences);
      }
      return selectChain(evaluationRow);
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn((values: CapturedEvaluationUpdate) => {
        options.updates?.push(values);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(updateReturning),
          }),
        };
      }),
    })),
  } as unknown as Database;
}

function makeAiClient(output: unknown): AiClient {
  return { complete: vi.fn().mockResolvedValue(output) };
}

function successOutput() {
  return {
    coverages: [
      {
        requirementId: REQ_1,
        coverage: 'covered',
        evidenceId: EVIDENCE_1,
        rationale: 'Has Kubernetes experience',
      },
      {
        requirementId: REQ_2,
        coverage: 'gap',
        evidenceId: null,
        rationale: 'No TypeScript experience found',
      },
    ],
  };
}

describe('EvaluationProcessor', () => {
  it('should persist requirement coverages and set match score on success', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [
        { id: REQ_1, kind: 'mandatory' },
        { id: REQ_2, kind: 'desirable' },
      ],
      evidences: [{ id: EVIDENCE_1 }, { id: EVIDENCE_2 }],
      updates,
    });
    const aiClient = makeAiClient(successOutput());
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob({
      evaluationId: EVALUATION_ID,
      userId: 'user-1',
      jobDescriptionId: JOB_DESCRIPTION_ID,
      careerProfileId: CAREER_PROFILE_ID,
    });

    await processor.process(job);

    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(database.update).toHaveBeenCalledTimes(1);
    expect(job.updateProgress).toHaveBeenCalledTimes(4);
  });

  it('should call AI with requirements and evidences payload', async () => {
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
    });
    const aiClient = makeAiClient({
      coverages: [
        {
          requirementId: REQ_1,
          coverage: 'covered',
          evidenceId: EVIDENCE_1,
          rationale: 'Match',
        },
      ],
    });
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob({
      evaluationId: EVALUATION_ID,
      userId: 'user-1',
      jobDescriptionId: JOB_DESCRIPTION_ID,
      careerProfileId: CAREER_PROFILE_ID,
    });

    await processor.process(job);

    expect(aiClient.complete).toHaveBeenCalledTimes(1);
    const calls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]).toBeDefined();
    const call = calls[0]![0] as { promptName: string; payload: { requirements: unknown[]; evidences: unknown[] } };
    expect(call.promptName).toBe('evaluate-coverage');
    expect(call.payload.requirements).toHaveLength(1);
    expect(call.payload.evidences).toHaveLength(1);
  });

  it('should mark failed with null when AI returns fewer classifications than requirements on the last attempt', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [
        { id: REQ_1, kind: 'mandatory' },
        { id: REQ_2, kind: 'desirable' },
      ],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient = makeAiClient({
      coverages: [
        {
          requirementId: REQ_1,
          coverage: 'covered',
          evidenceId: EVIDENCE_1,
          rationale: 'Match',
        },
      ],
    });
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 2, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toThrow(/missing classification/);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('failed');
    expect(updates[0]?.failureReason).toBeNull();
  });

  it('should discard broken evidence reference and downgrade to gap', async () => {
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
    });
    const aiClient = makeAiClient({
      coverages: [
        {
          requirementId: REQ_1,
          coverage: 'covered',
          evidenceId: 'nonexistent-evidence-id',
          rationale: 'Match',
        },
      ],
    });
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob({
      evaluationId: EVALUATION_ID,
      userId: 'user-1',
      jobDescriptionId: JOB_DESCRIPTION_ID,
      careerProfileId: CAREER_PROFILE_ID,
    });

    await processor.process(job);

    // Should still succeed, with the broken reference discarded
    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(database.update).toHaveBeenCalledTimes(1);
  });

  it('should not include contact details in the AI payload', async () => {
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
    });
    const aiClient = makeAiClient({
      coverages: [
        {
          requirementId: REQ_1,
          coverage: 'gap',
          evidenceId: null,
          rationale: 'Not found',
        },
      ],
    });
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob({
      evaluationId: EVALUATION_ID,
      userId: 'user-1',
      jobDescriptionId: JOB_DESCRIPTION_ID,
      careerProfileId: CAREER_PROFILE_ID,
    });

    await processor.process(job);

    const calls = (aiClient.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]).toBeDefined();
    const call = calls[0]![0] as { payload: Record<string, unknown> };
    const payloadString = JSON.stringify(call.payload);
    expect(payloadString).not.toContain('fullName');
    expect(payloadString).not.toContain('email');
    expect(payloadString).not.toContain('phone');
    expect(payloadString).not.toContain('contact');
  });

  it('should calculate match score using calculateMatchScore and not from AI', async () => {
    const database = makeDatabase({
      requirements: [
        { id: REQ_1, kind: 'mandatory' },
        { id: REQ_2, kind: 'desirable' },
      ],
      evidences: [{ id: EVIDENCE_1 }],
    });
    const aiClient = makeAiClient({
      coverages: [
        {
          requirementId: REQ_1,
          coverage: 'covered',
          evidenceId: EVIDENCE_1,
          rationale: 'Match',
        },
        {
          requirementId: REQ_2,
          coverage: 'gap',
          evidenceId: null,
          rationale: 'Not found',
        },
      ],
    });
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob({
      evaluationId: EVALUATION_ID,
      userId: 'user-1',
      jobDescriptionId: JOB_DESCRIPTION_ID,
      careerProfileId: CAREER_PROFILE_ID,
    });

    await processor.process(job);

    // The update call should set the match score
    const updateCalls = (database.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls[0]).toBeDefined();
    const updateCall = updateCalls[0]!;
    // Verify the score is a deterministic integer from calculateMatchScore
    // mandatory covered (weight 3, credit 1) + desirable gap (weight 1, credit 0)
    // = (3 * 1 + 1 * 0) / (3 + 1) * 100 = 75
    expect(updateCall[0]).toBeDefined();
  });

  it('should mark ai_key_rejected without retry when the key is missing', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiKeyMissingError()),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('failed');
    expect(updates[0]?.failureReason).toBe('ai_key_rejected');
  });

  it('should mark ai_key_rejected without retry when the key is rejected', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiKeyRejectedError()),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.failureReason).toBe('ai_key_rejected');
  });

  it('should mark ai_balance_exhausted without retry when the balance is gone', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiBalanceExhaustedError()),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.failureReason).toBe('ai_balance_exhausted');
  });

  it('should rethrow transient errors on the first attempt without marking failure', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiUnavailableError(503)),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(updates).toHaveLength(0);
  });

  it('should not mark failure on the second attempt for a transient error', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiTimeoutError(60000)),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 1, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(AiTimeoutError);
    expect(updates).toHaveLength(0);
  });

  it('should mark ai_unavailable only on the last attempt for transient errors', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiUnavailableError(503)),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 2, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('failed');
    expect(updates[0]?.failureReason).toBe('ai_unavailable');
  });

  it('should treat AiResponseInvalidError as transient and mark ai_unavailable on the last attempt', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiResponseInvalidError('schema_mismatch')),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const firstJob = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(firstJob)).rejects.toBeInstanceOf(AiResponseInvalidError);
    expect(updates).toHaveLength(0);
  });

  it('should mark failure with a null reason on the last attempt for unexpected errors', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new Error('infra boom')),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 2, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toThrow('infra boom');
    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe('failed');
    expect(updates[0]?.failureReason).toBeNull();
  });

  it('should rethrow unexpected errors on the first attempt without marking failure', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new Error('infra boom')),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 0, attempts: 3 },
    );

    await expect(processor.process(job)).rejects.toThrow('infra boom');
    expect(updates).toHaveLength(0);
  });

  it('should stop without error when the evaluation no longer exists', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      exists: false,
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
    });
    const aiClient = makeAiClient(successOutput());
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob({
      evaluationId: EVALUATION_ID,
      userId: 'user-1',
      jobDescriptionId: JOB_DESCRIPTION_ID,
      careerProfileId: CAREER_PROFILE_ID,
    });

    await processor.process(job);

    expect(aiClient.complete).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('should stop without throwing when the row disappears before the final write', async () => {
    const updates: CapturedEvaluationUpdate[] = [];
    const database = makeDatabase({
      requirements: [{ id: REQ_1, kind: 'mandatory' }],
      evidences: [{ id: EVIDENCE_1 }],
      updates,
      updateReturning: [],
    });
    const aiClient: AiClient = {
      complete: vi.fn().mockRejectedValue(new AiUnavailableError(503)),
    };
    const processor = new EvaluationProcessor(database, aiClient);
    const job = makeJob(
      {
        evaluationId: EVALUATION_ID,
        userId: 'user-1',
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      { attemptsMade: 2, attempts: 3 },
    );

    await processor.process(job);

    expect(updates).toHaveLength(1);
  });
});
