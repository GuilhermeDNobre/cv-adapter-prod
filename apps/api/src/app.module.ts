import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AiModule } from './modules/ai/ai.module';
import { CareerProfileModule } from './modules/career-profile/career-profile.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import { DatabaseModule } from './modules/database/database.module';
import { JobDescriptionModule } from './modules/job-description/job-description.module';
import { QueueModule } from './queue.module';
import { ResumeImportModule } from './modules/resume-import/resume-import.module';
import { RequestOriginModule } from './common/request-origin/request-origin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DataErasureModule } from './modules/data-erasure/data-erasure.module';
import { ResumeModule } from './modules/resume/resume.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AiModule,
    CareerProfileModule,
    EvaluationModule,
    JobDescriptionModule,
    QueueModule,
    ResumeImportModule,
    RequestOriginModule,
    SettingsModule,
    DataErasureModule,
    ResumeModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
