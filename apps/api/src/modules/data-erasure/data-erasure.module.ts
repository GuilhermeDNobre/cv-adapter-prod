import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { EVALUATION_QUEUE, RESUME_IMPORT_QUEUE, RESUME_WRITING_QUEUE } from '../../queue.module';
import { DataErasureController } from './data-erasure.controller';
import { DataErasureService } from './data-erasure.service';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    BullModule.registerQueue(
      { name: EVALUATION_QUEUE },
      { name: RESUME_IMPORT_QUEUE },
      { name: RESUME_WRITING_QUEUE },
    ),
  ],
  controllers: [DataErasureController],
  providers: [DataErasureService],
  exports: [DataErasureService],
})
export class DataErasureModule {}
