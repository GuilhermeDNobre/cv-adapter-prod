import { InjectQueue, BullModule } from '@nestjs/bullmq';
import { Module, type BeforeApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

export const RESUME_IMPORT_QUEUE = 'resume-import';
export const EVALUATION_QUEUE = 'evaluation';
export const RESUME_WRITING_QUEUE = 'resume-writing';
export const BASE_RESUME_PROPOSAL_QUEUE = 'base-resume-proposal';

export const JOB_MAX_ATTEMPTS = 3;
export const JOB_BACKOFF_DELAY_MS = 2000;

export const DEFAULT_JOB_OPTIONS = {
  attempts: JOB_MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: JOB_BACKOFF_DELAY_MS },
};

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: RESUME_IMPORT_QUEUE },
      { name: EVALUATION_QUEUE },
      { name: RESUME_WRITING_QUEUE },
      { name: BASE_RESUME_PROPOSAL_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule implements BeforeApplicationShutdown {
  constructor(
    @InjectQueue(RESUME_IMPORT_QUEUE) private readonly importQueue: Queue,
    @InjectQueue(EVALUATION_QUEUE) private readonly evaluationQueue: Queue,
    @InjectQueue(RESUME_WRITING_QUEUE) private readonly writingQueue: Queue,
    @InjectQueue(BASE_RESUME_PROPOSAL_QUEUE) private readonly proposalQueue: Queue,
  ) {}

  async beforeApplicationShutdown(): Promise<void> {
    await this.waitForQueues();
  }

  private async waitForQueues(): Promise<void> {
    await this.importQueue.waitUntilReady();
    await this.evaluationQueue.waitUntilReady();
    await this.writingQueue.waitUntilReady();
    await this.proposalQueue.waitUntilReady();
    await this.importQueue.getJobCounts();
    await this.evaluationQueue.getJobCounts();
    await this.writingQueue.getJobCounts();
    await this.proposalQueue.getJobCounts();
  }
}
