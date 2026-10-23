import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../../ai/ai.module';
import { DatabaseModule } from '../../database/database.module';
import { BASE_RESUME_PROPOSAL_QUEUE } from '../../../queue.module';
import { BaseResumeProposalService } from './base-resume-proposal.service';

@Module({
  imports: [
    DatabaseModule,
    AiModule,
    BullModule.registerQueue({ name: BASE_RESUME_PROPOSAL_QUEUE }),
  ],
  providers: [BaseResumeProposalService],
  exports: [BaseResumeProposalService],
})
export class BaseResumeProposalModule {}
