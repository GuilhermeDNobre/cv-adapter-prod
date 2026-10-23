import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { resumeImports } from 'schema';
import { DATABASE, type Database } from '../../database/database.provider';
import { BASE_RESUME_PROPOSAL_QUEUE } from '../../../queue.module';
import { BaseResumeProposalService } from './base-resume-proposal.service';

interface ProposalJobData {
  readonly resumeImportId: string;
  readonly userId: string;
}

@Injectable()
@Processor(BASE_RESUME_PROPOSAL_QUEUE)
export class BaseResumeProposalProcessor extends WorkerHost {
  private readonly logger = new Logger(BaseResumeProposalProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(BaseResumeProposalService) private readonly proposals: BaseResumeProposalService,
  ) {
    super();
  }

  async process(job: Job<ProposalJobData>): Promise<void> {
    const { resumeImportId, userId } = job.data;
    const existing = await this.findImportRow(resumeImportId);
    if (existing === undefined) {
      this.logger.log('base_resume.proposal.skipped_missing', { resumeImportId });
      return;
    }
    try {
      await this.proposals.buildAndStoreProposal(resumeImportId, userId);
    } catch (error: unknown) {
      if (this.isLastAttempt(job)) {
        this.logger.error('base_resume.proposal.failed', { resumeImportId });
      } else {
        this.logger.error('base_resume.proposal.failed (will retry)', { resumeImportId });
      }
      throw error;
    }
  }

  private async findImportRow(resumeImportId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.database
      .select({ id: resumeImports.id })
      .from(resumeImports)
      .where(eq(resumeImports.id, resumeImportId));
    return row;
  }

  private isLastAttempt(job: Job<ProposalJobData>): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  }
}
