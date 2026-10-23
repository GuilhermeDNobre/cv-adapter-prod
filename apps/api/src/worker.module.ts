import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from './queue.module';
import { ResumeImportWorkerModule } from './modules/resume-import/resume-import-worker.module';
import { EvaluationWorkerModule } from './modules/evaluation/evaluation-worker.module';
import { ResumeWorkerModule } from './modules/resume/resume-worker.module';
import { BaseResumeProposalWorkerModule } from './modules/resume/proposal/base-resume-proposal-worker.module';

// What main.worker.ts boots. It deliberately does not import AppModule: the worker has
// no controllers and no HTTP surface, and booting the whole app here would
// put every processor back on the API process too.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    QueueModule,
    ResumeImportWorkerModule,
    EvaluationWorkerModule,
    ResumeWorkerModule,
    BaseResumeProposalWorkerModule,
  ],
})
export class WorkerModule {}
