import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../../ai/ai.module';
import { DatabaseModule } from '../../database/database.module';
import { BASE_RESUME_PROPOSAL_QUEUE } from '../../../queue.module';
import { BaseResumeProposalProcessor } from './base-resume-proposal.processor';
import { BaseResumeProposalService } from './base-resume-proposal.service';

@Module({
  imports: [
    DatabaseModule,
    AiModule,
    BullModule.registerQueue({ name: BASE_RESUME_PROPOSAL_QUEUE }),
  ],
  providers: [BaseResumeProposalProcessor, BaseResumeProposalService],
})
export class BaseResumeProposalWorkerModule {}
