import { INestApplicationContext, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OBJECT_STORAGE } from './object-storage';
import { InMemoryObjectStorage } from './in-memory-object-storage';
import { PostgresObjectStorage } from './postgres-object-storage';
import { StorageModule } from './storage.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), StorageModule],
})
class TestHostModule {}

describe('StorageModule', () => {
  let context: INestApplicationContext;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
    context = await NestFactory.createApplicationContext(TestHostModule, { logger: false });
  });

  afterAll(async () => {
    await context.close();
    delete process.env['DATABASE_URL'];
  });

  it('should resolve the OBJECT_STORAGE port as the Postgres adapter', () => {
    // Act
    const storage = context.get(OBJECT_STORAGE);

    // Assert
    expect(storage).toBeInstanceOf(PostgresObjectStorage);
  });

  it('should provide InMemoryObjectStorage as a first-class test artifact', () => {
    // Act
    const storage = context.get(InMemoryObjectStorage);

    // Assert
    expect(storage).toBeInstanceOf(InMemoryObjectStorage);
  });
});
