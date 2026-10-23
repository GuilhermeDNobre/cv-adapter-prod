import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';
import { RESUME_WRITING_QUEUE } from '../../queue.module';
import { ResumeDocumentRepository } from './resume-document.repository';
import { ResumeRepository } from './resume.repository';
import { ResumeWritingProcessor } from './writing/resume-writing.processor';

@Module({
  imports: [DatabaseModule, AiModule, BullModule.registerQueue({ name: RESUME_WRITING_QUEUE })],
  providers: [ResumeDocumentRepository, ResumeRepository, ResumeWritingProcessor],
})
export class ResumeWorkerModule {}
