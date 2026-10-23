import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { EVALUATION_QUEUE } from '../../queue.module';
import { EvaluationController } from './evaluation.controller';
import { JobDescriptionEvaluationController } from './job-description-evaluation.controller';
import { ResumeEvaluationController } from './resume-evaluation.controller';
import { EvaluationService } from './evaluation.service';

@Module({
  imports: [
    DatabaseModule,
    CareerProfileModule,
    BullModule.registerQueue({ name: EVALUATION_QUEUE }),
  ],
  controllers: [EvaluationController, JobDescriptionEvaluationController, ResumeEvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
