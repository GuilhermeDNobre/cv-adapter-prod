import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseResumeProposalProcessor } from './base-resume-proposal.processor';
import { BaseResumeProposalService } from './base-resume-proposal.service';
import type { Database } from '../../database/database.provider';

const IMPORT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeDatabase(exists: boolean): Database {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(exists ? [{ id: IMPORT_ID }] : []),
      }),
    }),
  } as unknown as Database;
}

function makeService(): BaseResumeProposalService & {
  buildAndStoreProposal: ReturnType<typeof vi.fn>;
} {
  return {
    buildAndStoreProposal: vi.fn().mockResolvedValue(undefined),
  } as unknown as BaseResumeProposalService & {
    buildAndStoreProposal: ReturnType<typeof vi.fn>;
  };
}

function makeJob(attemptsMade = 0): never {
  return {
    data: { resumeImportId: IMPORT_ID, userId: 'user-1' },
    attemptsMade,
    opts: { attempts: 3 },
  } as never;
}

describe('BaseResumeProposalProcessor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should build and store the proposal when the import exists', async () => {
    const service = makeService();
    const processor = new BaseResumeProposalProcessor(makeDatabase(true), service as never);

    await processor.process(makeJob());

    expect(service.buildAndStoreProposal).toHaveBeenCalledTimes(1);
    expect(service.buildAndStoreProposal).toHaveBeenCalledWith(IMPORT_ID, 'user-1');
  });

  it('should skip without error when the import no longer exists', async () => {
    const service = makeService();
    const processor = new BaseResumeProposalProcessor(makeDatabase(false), service as never);

    await processor.process(makeJob());

    expect(service.buildAndStoreProposal).not.toHaveBeenCalled();
  });

  it('should rethrow when the service fails so the job can retry', async () => {
    const service = makeService();
    service.buildAndStoreProposal.mockRejectedValue(new Error('db boom'));
    const processor = new BaseResumeProposalProcessor(makeDatabase(true), service as never);

    await expect(processor.process(makeJob(0))).rejects.toThrow('db boom');
    expect(service.buildAndStoreProposal).toHaveBeenCalledTimes(1);
  });
});
