import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';
import { EVALUATION_QUEUE } from '../../queue.module';
import { EvaluationProcessor } from './evaluation.processor';

// The processor lives here and NOT in EvaluationModule, so only main.worker.ts
// consumes the queue. Registering it beside the controller would put the AI
// evaluation on the HTTP process's event loop.
@Module({
  imports: [
    DatabaseModule,
    AiModule,
    BullModule.registerQueue({ name: EVALUATION_QUEUE }),
  ],
  providers: [EvaluationProcessor],
})
export class EvaluationWorkerModule {}
