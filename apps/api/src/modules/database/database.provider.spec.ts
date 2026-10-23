import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseModule } from './database.module';
import {
  DATABASE,
  DATABASE_POOL,
  createDatabase,
  createDatabasePool,
  databasePoolProvider,
  databaseProvider,
} from './database.provider';

const TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';

describe('createDatabasePool', () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it('should build a pg Pool from DATABASE_URL', async () => {
    // Arrange
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    // Act
    const pool = createDatabasePool(new ConfigService());

    // Assert
    expect(pool).toBeInstanceOf(Pool);

    // Cleanup
    await pool.end();
  });

  it('should fail when DATABASE_URL is missing', () => {
    // Arrange
    delete process.env.DATABASE_URL;

    // Act & Assert
    expect(() => createDatabasePool(new ConfigService())).toThrow('DATABASE_URL is not set');
  });
});

describe('createDatabase', () => {
  it('should build a Drizzle client over the pool it is given', async () => {
    // Arrange
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });

    // Act
    const database = createDatabase(pool);

    // Assert
    expect(database).toBeInstanceOf(NodePgDatabase);

    // Cleanup
    await pool.end();
  });
});

describe('databaseProvider', () => {
  it('should provide the pool under its own token so Nest can close it', () => {
    expect(databasePoolProvider).toMatchObject({
      provide: DATABASE_POOL,
      useFactory: createDatabasePool,
      inject: [ConfigService],
    });
  });

  it('should build the Drizzle client from the pool token, not from the config', () => {
    expect(databaseProvider).toMatchObject({
      provide: DATABASE,
      useFactory: createDatabase,
      inject: [DATABASE_POOL],
    });
  });

  it('should export the DATABASE token from the module metadata', () => {
    const exports: unknown[] = Reflect.getMetadata('exports', DatabaseModule);
    expect(exports).toContain(DATABASE);
  });

  it('should close the pool on module destroy so connections are not leaked', async () => {
    // Arrange
    let ended = false;
    const pool = { end: async (): Promise<void> => void (ended = true) } as unknown as Pool;
    const module = new DatabaseModule(pool);

    // Act
    await module.onModuleDestroy();

    // Assert
    expect(ended).toBe(true);
  });
});
