import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_JOB_OPTIONS } from '../../queue.module';
import { EvaluationService } from './evaluation.service';
import type { Database } from '../database/database.provider';
import type { DeniedRequirementService } from '../career-profile/denied-requirement.service';

const EVALUATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_ID = 'user-123';
const JOB_DESCRIPTION_ID = '11111111-2222-4333-8444-555555555555';
const CAREER_PROFILE_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

function makeQueue(): { add: ReturnType<typeof vi.fn> } {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

function makeDeniedRequirementService(): DeniedRequirementService {
  return {
    deny: vi.fn().mockResolvedValue(undefined),
    findDeniedConcepts: vi.fn().mockResolvedValue(new Set<string>()),
    isOwner: vi.fn().mockResolvedValue(true),
  } as unknown as DeniedRequirementService;
}

function makeDatabaseForCreate(options: {
  careerProfile?: { id: string } | null;
  jobDescription?: { id: string } | null;
}): Database {
  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const callIndex = selectCallCount++;
          if (callIndex === 0) {
            return Promise.resolve(options.careerProfile ? [options.careerProfile] : []);
          }
          if (callIndex === 1) {
            return Promise.resolve(options.jobDescription ? [options.jobDescription] : []);
          }
          return Promise.resolve([]);
        }),
      }),
    })),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: EVALUATION_ID,
            userId: USER_ID,
            jobDescriptionId: JOB_DESCRIPTION_ID,
            careerProfileId: CAREER_PROFILE_ID,
            status: 'queued',
            matchScore: null,
            failureReason: null,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            updatedAt: new Date('2025-01-01T00:00:00Z'),
          },
        ]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

function makeDatabaseForGet(options: {
  evaluation?: { id: string; userId: string; jobDescriptionId: string; careerProfileId: string; status: string; matchScore: number | null; failureReason: 'ai_key_rejected' | 'ai_balance_exhausted' | 'ai_unavailable' | null; createdAt: Date; updatedAt: Date } | null;
  coverages?: Array<{ requirementId: string; coverage: string; evidenceId: string | null; rationale: string }>;
  requirements?: Array<{ id: string; literalTerm: string; concept: string; normalizedConcept: string; kind: string }>;
  evidences?: Array<{ id: string; statement: string }>;
}): Database {
  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const callIndex = selectCallCount++;
          if (callIndex === 0) {
            return Promise.resolve(options.evaluation ? [options.evaluation] : []);
          }
          if (callIndex === 1) {
            return Promise.resolve(options.coverages ?? []);
          }
          if (callIndex === 2) {
            return Promise.resolve(options.requirements ?? []);
          }
          if (callIndex === 3) {
            return Promise.resolve(options.evidences ?? []);
          }
          return Promise.resolve([]);
        }),
      }),
    })),
  } as unknown as Database;
}

function readyEvaluationRow(): {
  id: string;
  userId: string;
  jobDescriptionId: string;
  careerProfileId: string;
  status: string;
  matchScore: number | null;
  failureReason: 'ai_key_rejected' | 'ai_balance_exhausted' | 'ai_unavailable' | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: EVALUATION_ID,
    userId: USER_ID,
    jobDescriptionId: JOB_DESCRIPTION_ID,
    careerProfileId: CAREER_PROFILE_ID,
    status: 'ready',
    matchScore: 70,
    failureReason: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };
}

const REQUIREMENT_ROW = {
  id: '99999999-8888-4777-8666-555555555555',
  literalTerm: 'Kubernetes',
  concept: 'Orquestração de containers',
  normalizedConcept: 'kubernetes',
  kind: 'mandatory',
};

function makeDatabaseForDenyGap(options: {
  evaluation?: { id: string; userId: string; jobDescriptionId: string; careerProfileId: string; status: string; matchScore: number | null; createdAt: Date; updatedAt: Date } | null;
  requirement?: { normalizedConcept: string } | null;
}): Database {
  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const callIndex = selectCallCount++;
          if (callIndex === 0) {
            return Promise.resolve(options.evaluation ? [options.evaluation] : []);
          }
          if (callIndex === 1) {
            return Promise.resolve(options.requirement ? [options.requirement] : []);
          }
          return Promise.resolve([]);
        }),
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

describe('EvaluationService', () => {
  it('should throw 422 when user has no career profile', async () => {
    const database = makeDatabaseForCreate({ careerProfile: null });
    const queue = makeQueue();
    const denied = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, denied);

    await expect(
      service.createEvaluation(USER_ID, JOB_DESCRIPTION_ID),
    ).rejects.toThrow(/Career Profile/);
  });

  it('should throw 404 when job description not found', async () => {
    const database = makeDatabaseForCreate({
      careerProfile: { id: CAREER_PROFILE_ID },
      jobDescription: null,
    });
    const queue = makeQueue();
    const denied = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, denied);

    await expect(
      service.createEvaluation(USER_ID, JOB_DESCRIPTION_ID),
    ).rejects.toThrow(/Job description not found/);
  });

  it('should create an evaluation row and enqueue a job', async () => {
    const database = makeDatabaseForCreate({
      careerProfile: { id: CAREER_PROFILE_ID },
      jobDescription: { id: JOB_DESCRIPTION_ID },
    });
    const queue = makeQueue();
    const denied = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, denied);

    const result = await service.createEvaluation(USER_ID, JOB_DESCRIPTION_ID);

    expect(result.id).toBe(EVALUATION_ID);
    expect(result.status).toBe('queued');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'evaluate',
      {
        evaluationId: EVALUATION_ID,
        userId: USER_ID,
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
      },
      DEFAULT_JOB_OPTIONS,
    );
  });

  it('should enqueue with three attempts and exponential backoff', async () => {
    const database = makeDatabaseForCreate({
      careerProfile: { id: CAREER_PROFILE_ID },
      jobDescription: { id: JOB_DESCRIPTION_ID },
    });
    const queue = makeQueue();
    const denied = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, denied);

    await service.createEvaluation(USER_ID, JOB_DESCRIPTION_ID);

    expect(DEFAULT_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'evaluate',
      expect.objectContaining({ evaluationId: EVALUATION_ID }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('should return failureReason null for a newly created evaluation', async () => {
    const database = makeDatabaseForCreate({
      careerProfile: { id: CAREER_PROFILE_ID },
      jobDescription: { id: JOB_DESCRIPTION_ID },
    });
    const queue = makeQueue();
    const denied = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, denied);

    const result = await service.createEvaluation(USER_ID, JOB_DESCRIPTION_ID);

    expect(result.failureReason).toBeNull();
  });

  it('should return 404 for getEvaluation with invalid UUID', async () => {
    const database = makeDatabaseForGet({});
    const queue = makeQueue();
    const denied = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, denied);

    await expect(
      service.getEvaluation('not-a-uuid', USER_ID),
    ).rejects.toThrow(/not found/);
  });

  it('should throw 404 for getEvaluation when evaluation not found or wrong user', async () => {
    const database = makeDatabaseForGet({ evaluation: null });
    const queue = makeQueue();
    const denied = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, denied);

    await expect(
      service.getEvaluation(EVALUATION_ID, 'other-user'),
    ).rejects.toThrow(/not found/);
  });

  it('should return the statement of the Evidence that covers a requirement', async () => {
    const evidenceId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const database = makeDatabaseForGet({
      evaluation: readyEvaluationRow(),
      coverages: [
        {
          requirementId: REQUIREMENT_ROW.id,
          coverage: 'covered',
          evidenceId,
          rationale: 'A Evidence descreve o uso em produção.',
        },
      ],
      requirements: [REQUIREMENT_ROW],
      evidences: [{ id: evidenceId, statement: 'Migrei 12 serviços para Kubernetes.' }],
    });
    const service = new EvaluationService(
      database,
      makeQueue() as never,
      makeDeniedRequirementService(),
    );

    const result = await service.getEvaluation(EVALUATION_ID, USER_ID);

    expect(result.requirementCoverages[0]?.evidenceId).toBe(evidenceId);
    expect(result.requirementCoverages[0]?.evidenceStatement).toBe(
      'Migrei 12 serviços para Kubernetes.',
    );
  });

  it('should return a null statement when the coverage cites no Evidence', async () => {
    const database = makeDatabaseForGet({
      evaluation: readyEvaluationRow(),
      coverages: [
        {
          requirementId: REQUIREMENT_ROW.id,
          coverage: 'gap',
          evidenceId: null,
          rationale: 'Nenhuma Evidence menciona o assunto.',
        },
      ],
      requirements: [REQUIREMENT_ROW],
      evidences: [],
    });
    const service = new EvaluationService(
      database,
      makeQueue() as never,
      makeDeniedRequirementService(),
    );

    const result = await service.getEvaluation(EVALUATION_ID, USER_ID);

    expect(result.requirementCoverages[0]?.evidenceStatement).toBeNull();
    expect(database.select).toHaveBeenCalledTimes(3);
  });

  it('should return a null statement when the cited Evidence no longer exists', async () => {
    const database = makeDatabaseForGet({
      evaluation: readyEvaluationRow(),
      coverages: [
        {
          requirementId: REQUIREMENT_ROW.id,
          coverage: 'covered',
          evidenceId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
          rationale: 'A Evidence descreve o uso em produção.',
        },
      ],
      requirements: [REQUIREMENT_ROW],
      evidences: [],
    });
    const service = new EvaluationService(
      database,
      makeQueue() as never,
      makeDeniedRequirementService(),
    );

    const result = await service.getEvaluation(EVALUATION_ID, USER_ID);

    expect(result.requirementCoverages[0]?.evidenceStatement).toBeNull();
  });

  it('should denyGap and return normalized concept', async () => {
    const database = makeDatabaseForDenyGap({
      evaluation: {
        id: EVALUATION_ID,
        userId: USER_ID,
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
        status: 'ready',
        matchScore: 50,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      },
      requirement: { normalizedConcept: 'kubernetes' },
    });
    const queue = makeQueue();
    const deniedService = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, deniedService);

    const result = await service.denyGap(EVALUATION_ID, 'req-1', USER_ID);

    expect(result.denied).toBe(true);
    expect(result.normalizedConcept).toBe('kubernetes');
    expect(deniedService.deny).toHaveBeenCalledWith(CAREER_PROFILE_ID, 'req-1');
  });

  it('should not call match score calculation when denying gap', async () => {
    const database = makeDatabaseForDenyGap({
      evaluation: {
        id: EVALUATION_ID,
        userId: USER_ID,
        jobDescriptionId: JOB_DESCRIPTION_ID,
        careerProfileId: CAREER_PROFILE_ID,
        status: 'ready',
        matchScore: 50,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      },
      requirement: { normalizedConcept: 'kubernetes' },
    });
    const queue = makeQueue();
    const deniedService = makeDeniedRequirementService();
    const service = new EvaluationService(database, queue as never, deniedService);

    await service.denyGap(EVALUATION_ID, 'req-1', USER_ID);

    expect(database.update).not.toHaveBeenCalled();
  });

  it('should return the latest evaluation of the job description', async () => {
    const evidenceId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const database = makeDatabaseForGetByJob({
      evaluation: readyEvaluationRow(),
      coverages: [
        {
          requirementId: REQUIREMENT_ROW.id,
          coverage: 'covered',
          evidenceId,
          rationale: 'A Evidence descreve o uso em produção.',
        },
      ],
      requirements: [REQUIREMENT_ROW],
      evidences: [{ id: evidenceId, statement: 'Migrei 12 serviços para Kubernetes.' }],
    });
    const service = new EvaluationService(
      database,
      makeQueue() as never,
      makeDeniedRequirementService(),
    );

    const result = await service.getEvaluationByJobDescription(JOB_DESCRIPTION_ID, USER_ID);

    expect(result.id).toBe(EVALUATION_ID);
    expect(result.status).toBe('ready');
    expect(result.requirementCoverages[0]?.evidenceStatement).toBe(
      'Migrei 12 serviços para Kubernetes.',
    );
  });

  it('should throw 404 when the job has no evaluation', async () => {
    const database = makeDatabaseForGetByJob({ evaluation: null });
    const service = new EvaluationService(
      database,
      makeQueue() as never,
      makeDeniedRequirementService(),
    );

    await expect(
      service.getEvaluationByJobDescription(JOB_DESCRIPTION_ID, USER_ID),
    ).rejects.toThrow(/not found/);
  });

  it('should throw 404 for getEvaluationByJobDescription with invalid UUID', async () => {
    const database = makeDatabaseForGetByJob({ evaluation: null });
    const service = new EvaluationService(
      database,
      makeQueue() as never,
      makeDeniedRequirementService(),
    );

    await expect(
      service.getEvaluationByJobDescription('not-a-uuid', USER_ID),
    ).rejects.toThrow(/not found/);
  });
});

function makeDatabaseForGetByJob(options: {
  evaluation?: {
    id: string;
    userId: string;
    jobDescriptionId: string;
    careerProfileId: string;
    status: string;
    matchScore: number | null;
    failureReason: 'ai_key_rejected' | 'ai_balance_exhausted' | 'ai_unavailable' | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  coverages?: Array<{ requirementId: string; coverage: string; evidenceId: string | null; rationale: string }>;
  requirements?: Array<{ id: string; literalTerm: string; concept: string; normalizedConcept: string; kind: string }>;
  evidences?: Array<{ id: string; statement: string }>;
}): Database {
  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const callIndex = selectCallCount++;
          if (callIndex === 0) {
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockImplementation(() => {
                  return Promise.resolve(options.evaluation ? [options.evaluation] : []);
                }),
              }),
            };
          }
          if (callIndex === 1) {
            return Promise.resolve(options.coverages ?? []);
          }
          if (callIndex === 2) {
            return Promise.resolve(options.requirements ?? []);
          }
          if (callIndex === 3) {
            return Promise.resolve(options.evidences ?? []);
          }
          return Promise.resolve([]);
        }),
      }),
    })),
  } as unknown as Database;
}
