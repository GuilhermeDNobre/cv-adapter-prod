import { beforeEach, describe, expect, it, vi } from 'vitest';
import { careerProfiles, deepSeekCredentials, jobDescriptions, resumeImports, resumes } from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import type { Database } from '../database/database.provider';
import type { ObjectStorage } from '../storage/object-storage';
import type { Queue } from 'bullmq';
import { DataErasureService } from './data-erasure.service';

function createService() {
  const deletedTables: unknown[] = [];
  const callOrder: string[] = [];
  const whereArgs: unknown[] = [];
  const tx = {
    delete(table: unknown) {
      return {
        where: async (condition: unknown) => {
          deletedTables.push(table);
          whereArgs.push(condition);
          return undefined;
        },
      };
    },
  };
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
    callOrder.push('transaction');
    await callback(tx);
  });
  const database = { transaction } as unknown as Database;
  const removeSourceDocumentsOf = vi.fn(async (userId: string) => {
    callOrder.push(`removeSourceDocumentsOf:${userId}`);
  });
  const objectStorage = { removeSourceDocumentsOf } as unknown as ObjectStorage;
  const evaluationDrain = vi.fn(async (delayed: boolean) => {
    callOrder.push(`evaluationDrain:${String(delayed)}`);
  });
  const resumeDrain = vi.fn(async (delayed: boolean) => {
    callOrder.push(`resumeDrain:${String(delayed)}`);
  });
  const writingDrain = vi.fn(async (delayed: boolean) => {
    callOrder.push(`writingDrain:${String(delayed)}`);
  });
  const evaluationQueue = { drain: evaluationDrain } as unknown as Queue;
  const resumeImportQueue = { drain: resumeDrain } as unknown as Queue;
  const writingQueue = { drain: writingDrain } as unknown as Queue;
  const service = new DataErasureService(
    database,
    objectStorage,
    evaluationQueue,
    resumeImportQueue,
    writingQueue,
  );
  return {
    service,
    deletedTables,
    callOrder,
    transaction,
    removeSourceDocumentsOf,
    evaluationDrain,
    resumeDrain,
    writingDrain,
  };
}

describe('DataErasureService.erase job_descriptions', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('should delete only job descriptions in one transaction and drain only the evaluation queue', async () => {
    const {
      service,
      deletedTables,
      transaction,
      removeSourceDocumentsOf,
      evaluationDrain,
      resumeDrain,
      writingDrain,
    } = createService();

    await service.erase('job_descriptions');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deletedTables).toContain(jobDescriptions);
    expect(deletedTables).not.toContain(careerProfiles);
    expect(deletedTables).not.toContain(resumeImports);
    expect(deletedTables).not.toContain(resumes);
    expect(deletedTables).not.toContain(deepSeekCredentials);
    expect(removeSourceDocumentsOf).not.toHaveBeenCalled();
    expect(evaluationDrain).toHaveBeenCalledWith(true);
    expect(resumeDrain).not.toHaveBeenCalled();
    expect(writingDrain).not.toHaveBeenCalled();
  });

  it('should drain the evaluation queue after the transaction commits', async () => {
    const { service, callOrder } = createService();

    await service.erase('job_descriptions');

    expect(callOrder).toEqual(['transaction', 'evaluationDrain:true']);
  });

  it('should log data.erased with the scope only', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { service } = createService();

    await service.erase('job_descriptions');

    expect(logSpy).toHaveBeenCalledWith('data.erased', { scope: 'job_descriptions' });
    logSpy.mockRestore();
  });
});

describe('DataErasureService.erase career_profile', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('should delete resumes, imports and career profiles without touching job descriptions or the key', async () => {
    const { service, deletedTables, transaction, removeSourceDocumentsOf } = createService();

    await service.erase('career_profile');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deletedTables).toContain(resumes);
    expect(deletedTables).toContain(resumeImports);
    expect(deletedTables).toContain(careerProfiles);
    expect(deletedTables).not.toContain(jobDescriptions);
    expect(deletedTables).not.toContain(deepSeekCredentials);
    expect(removeSourceDocumentsOf).toHaveBeenCalledWith(LOCAL_USER_ID);
  });

  it('should remove source documents and drain all three queues after the transaction', async () => {
    const { service, callOrder, evaluationDrain, resumeDrain, writingDrain } = createService();

    await service.erase('career_profile');

    expect(evaluationDrain).toHaveBeenCalledWith(true);
    expect(resumeDrain).toHaveBeenCalledWith(true);
    expect(writingDrain).toHaveBeenCalledWith(true);
    expect(callOrder[0]).toBe('transaction');
    expect(callOrder).toContain(`removeSourceDocumentsOf:${LOCAL_USER_ID}`);
    expect(callOrder.indexOf('transaction')).toBeLessThan(
      callOrder.indexOf(`removeSourceDocumentsOf:${LOCAL_USER_ID}`),
    );
    expect(callOrder.indexOf('transaction')).toBeLessThan(callOrder.indexOf('evaluationDrain:true'));
    expect(callOrder.indexOf('transaction')).toBeLessThan(callOrder.indexOf('resumeDrain:true'));
    expect(callOrder.indexOf('transaction')).toBeLessThan(callOrder.indexOf('writingDrain:true'));
  });

  it('should log data.erased with the scope only', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { service } = createService();

    await service.erase('career_profile');

    expect(logSpy).toHaveBeenCalledWith('data.erased', { scope: 'career_profile' });
    logSpy.mockRestore();
  });
});

describe('DataErasureService.erase everything', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('should delete jobs, imports, career profiles and resumes in one transaction without touching the key', async () => {
    const { service, deletedTables, transaction, removeSourceDocumentsOf } = createService();

    await service.erase('everything');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deletedTables).toContain(jobDescriptions);
    expect(deletedTables).toContain(resumeImports);
    expect(deletedTables).toContain(careerProfiles);
    expect(deletedTables).toContain(resumes);
    expect(deletedTables).not.toContain(deepSeekCredentials);
    expect(removeSourceDocumentsOf).toHaveBeenCalledWith(LOCAL_USER_ID);
  });

  it('should drain all three queues after the transaction', async () => {
    const { service, callOrder, evaluationDrain, resumeDrain, writingDrain } = createService();

    await service.erase('everything');

    expect(evaluationDrain).toHaveBeenCalledWith(true);
    expect(resumeDrain).toHaveBeenCalledWith(true);
    expect(writingDrain).toHaveBeenCalledWith(true);
    expect(callOrder[0]).toBe('transaction');
    expect(callOrder.indexOf('transaction')).toBeLessThan(callOrder.indexOf('evaluationDrain:true'));
    expect(callOrder.indexOf('transaction')).toBeLessThan(callOrder.indexOf('resumeDrain:true'));
    expect(callOrder.indexOf('transaction')).toBeLessThan(callOrder.indexOf('writingDrain:true'));
  });

  it('should log data.erased with the scope only', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { service } = createService();

    await service.erase('everything');

    expect(logSpy).toHaveBeenCalledWith('data.erased', { scope: 'everything' });
    logSpy.mockRestore();
  });
});

describe('DataErasureService.erase resumes', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('should delete only resumes in one transaction and drain only the writing queue', async () => {
    const {
      service,
      deletedTables,
      transaction,
      removeSourceDocumentsOf,
      evaluationDrain,
      resumeDrain,
      writingDrain,
    } = createService();

    await service.erase('resumes');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deletedTables).toContain(resumes);
    expect(deletedTables).not.toContain(jobDescriptions);
    expect(deletedTables).not.toContain(careerProfiles);
    expect(deletedTables).not.toContain(resumeImports);
    expect(deletedTables).not.toContain(deepSeekCredentials);
    expect(removeSourceDocumentsOf).not.toHaveBeenCalled();
    expect(writingDrain).toHaveBeenCalledWith(true);
    expect(evaluationDrain).not.toHaveBeenCalled();
    expect(resumeDrain).not.toHaveBeenCalled();
  });

  it('should drain the writing queue after the transaction commits', async () => {
    const { service, callOrder } = createService();

    await service.erase('resumes');

    expect(callOrder).toEqual(['transaction', 'writingDrain:true']);
  });

  it('should log data.erased with the scope only', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { service } = createService();

    await service.erase('resumes');

    expect(logSpy).toHaveBeenCalledWith('data.erased', { scope: 'resumes' });
    logSpy.mockRestore();
  });
});
