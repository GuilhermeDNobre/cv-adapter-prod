import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OBJECT_STORAGE } from './object-storage';
import { InMemoryObjectStorage } from './in-memory-object-storage';
import { PostgresObjectStorage } from './postgres-object-storage';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: OBJECT_STORAGE,
      useClass: PostgresObjectStorage,
    },
    InMemoryObjectStorage,
  ],
  exports: [OBJECT_STORAGE, InMemoryObjectStorage],
})
export class StorageModule {}
