import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';
import { JobDescriptionController } from './job-description.controller';
import { JobDescriptionService } from './job-description.service';

@Module({
  imports: [AiModule, DatabaseModule],
  controllers: [JobDescriptionController],
  providers: [JobDescriptionService],
})
export class JobDescriptionModule {}
