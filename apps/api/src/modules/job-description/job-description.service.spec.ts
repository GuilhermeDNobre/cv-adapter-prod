import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { jobDescriptions, requirements } from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import { describe, expect, it, vi } from 'vitest';
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
import { JobDescriptionService } from './job-description.service';

const VALID_PARSE = {
  isJobDescription: true,
  language: 'pt-BR',
  requirements: [
    { literalTerm: 'Kubernetes', concept: 'Container orchestration', kind: 'mandatory' },
    { literalTerm: 'inglês avançado', concept: 'Advanced English', kind: 'desirable' },
  ],
};

interface CapturedInserts {
  jobValues: Record<string, unknown>[];
  requirementValues: Record<string, unknown>[];
}

function createTransactionFake(captured: CapturedInserts) {
  return {
    insert(table: unknown) {
      return {
        values(rows: unknown) {
          if (table === jobDescriptions) {
            captured.jobValues.push(rows as Record<string, unknown>);
          } else if (table === requirements) {
            captured.requirementValues.push(...(rows as Record<string, unknown>[]));
          }
          return {
            returning: async () =>
              table === jobDescriptions
                ? [{ id: 'jd-1', language: 'pt-BR', createdAt: new Date(), updatedAt: new Date() }]
                : (rows as Record<string, unknown>[]).map((row, index) => ({
                    ...row,
                    id: `req-${String(index)}`,
                  })),
          };
        },
      };
    },
  };
}

function createService(parseResult: unknown) {
  const captured: CapturedInserts = { jobValues: [], requirementValues: [] };
  const transactionFake = createTransactionFake(captured);
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(transactionFake),
  );
  const complete = vi.fn(async () => parseResult);
  const database = { transaction } as unknown as Database;
  const aiClient = { complete } as unknown as AiClient;
  return {
    service: new JobDescriptionService(aiClient, database),
    captured,
    transaction,
    complete,
  };
}

function chainRows<T>(rows: T[]): Promise<T[]> & { orderBy: () => Promise<T[]> } {
  return Object.assign(Promise.resolve(rows), { orderBy: () => Promise.resolve(rows) });
}

function createReadService(jobRow: Record<string, unknown> | undefined) {
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () =>
        chainRows(
          table === jobDescriptions
            ? jobRow === undefined
              ? []
              : [jobRow]
            : [
                {
                  id: 'req-0',
                  literalTerm: 'Kubernetes',
                  concept: 'Container orchestration',
                  normalizedConcept: 'kubernetes',
                  kind: 'mandatory',
                  ordinal: 0,
                },
              ],
        ),
    }),
  }));
  const database = { select } as unknown as Database;
  return {
    service: new JobDescriptionService({ complete: vi.fn() } as unknown as AiClient, database),
    select,
  };
}

describe('JobDescriptionService.createJobDescription', () => {
  it('should persist the job description and its requirements in one transaction', async () => {
    const { service, captured, transaction } = createService(VALID_PARSE);

    await service.createJobDescription('Vaga pedindo Kubernetes');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(captured.jobValues).toHaveLength(1);
    expect(captured.requirementValues).toHaveLength(2);
  });

  it('should store the job under the local user id', async () => {
    const { service, captured } = createService(VALID_PARSE);

    await service.createJobDescription('Vaga pedindo Kubernetes');

    const [job] = captured.jobValues;
    expect(job).toMatchObject({
      userId: LOCAL_USER_ID,
      rawText: 'Vaga pedindo Kubernetes',
      language: 'pt-BR',
    });
  });

  it('should link requirement rows to the job description preserving literals and order', async () => {
    const { service, captured } = createService(VALID_PARSE);

    const result = await service.createJobDescription('texto');

    expect(captured.requirementValues[0]).toMatchObject({
      jobDescriptionId: 'jd-1',
      literalTerm: 'Kubernetes',
      normalizedConcept: 'kubernetes',
      kind: 'mandatory',
      ordinal: 0,
    });
    expect(captured.requirementValues[1]).toMatchObject({
      jobDescriptionId: 'jd-1',
      literalTerm: 'inglês avançado',
      normalizedConcept: 'ingles avancado',
      kind: 'desirable',
      ordinal: 1,
    });
    expect(result.requirements[1]?.literalTerm).toBe('inglês avançado');
  });

  it('should answer 422 with the not-a-job message and persist nothing on a negative verdict', async () => {
    const { service, transaction } = createService({
      isJobDescription: false,
      language: 'pt-BR',
      requirements: [],
    });

    await expect(service.createJobDescription('oi, tudo bem?')).rejects.toThrow(
      /does not look like a job advertisement/,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('should answer 422 with a distinct message when the extraction came back empty', async () => {
    const { service, transaction } = createService({
      isJobDescription: true,
      language: 'pt-BR',
      requirements: [],
    });

    const failure = await service
      .createJobDescription('vaga sem requisitos')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as Error).message).toMatch(/No requirements were found/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('should try the AI exactly once and answer 422 when it fails', async () => {
    const { service, complete, transaction } = createService(undefined);
    complete.mockRejectedValue(new AiUnavailableError(503));

    await expect(service.createJobDescription('texto')).rejects.toThrow(
      /could not be processed right now/,
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('should answer 422 ai_key_missing when no key is configured', async () => {
    const { service, complete } = createService(undefined);
    complete.mockRejectedValue(new AiKeyMissingError());

    const failure = await service
      .createJobDescription('texto')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'ai_key_missing',
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('should answer 422 ai_key_rejected when the key is rejected', async () => {
    const { service, complete } = createService(undefined);
    complete.mockRejectedValue(new AiKeyRejectedError());

    const failure = await service
      .createJobDescription('texto')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'ai_key_rejected',
    });
  });

  it('should answer 422 ai_balance_exhausted when the balance is gone', async () => {
    const { service, complete } = createService(undefined);
    complete.mockRejectedValue(new AiBalanceExhaustedError());

    const failure = await service
      .createJobDescription('texto')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'ai_balance_exhausted',
    });
  });

  it('should answer 503 ai_unavailable for transient failures', async () => {
    const transientErrors = [
      new AiUnavailableError(503),
      new AiTimeoutError(60000),
      new AiResponseInvalidError('schema_mismatch'),
    ];
    for (const transient of transientErrors) {
      const { service, complete } = createService(undefined);
      complete.mockRejectedValue(transient);

      const failure = await service
        .createJobDescription('texto')
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'ai_unavailable',
      });
    }
  });

  it('should not swallow programming errors as business rejections', async () => {
    const { service, complete } = createService(undefined);
    complete.mockRejectedValue(new Error('programming bug'));

    await expect(service.createJobDescription('texto')).rejects.toThrow(
      'programming bug',
    );
  });

  it('should never log the job description text nor the model response', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service } = createService(VALID_PARSE);

    await service.createJobDescription('TEXTO-SECRETO-DA-VAGA');

    const logged = JSON.stringify([
      ...logSpy.mock.calls.map((call) => call.map(String)),
      ...errorSpy.mock.calls.map((call) => call.map(String)),
    ]);
    expect(logged).not.toContain('TEXTO-SECRETO-DA-VAGA');
    expect(logged).not.toContain('Kubernetes');
    expect(logged).not.toContain('Container orchestration');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('JobDescriptionService.getJobDescription', () => {
  const jobId = '11111111-1111-4111-8111-111111111111';
  const jobRow = {
    id: jobId,
    language: 'pt-BR',
    userId: LOCAL_USER_ID,
  };

  it('should return the job description for the given id', async () => {
    const { service } = createReadService(jobRow);

    const result = await service.getJobDescription(jobId);

    expect(result.id).toBe(jobId);
    expect(result.requirements[0]?.normalizedConcept).toBe('kubernetes');
  });

  it('should answer 404 for an unknown id', async () => {
    const { service } = createReadService(undefined);

    await expect(service.getJobDescription(jobId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should answer 404 for a malformed id without querying', async () => {
    const { service, select } = createReadService(jobRow);

    await expect(service.getJobDescription('not-a-uuid')).rejects.toThrow(
      NotFoundException,
    );
    expect(select).not.toHaveBeenCalled();
  });
});
