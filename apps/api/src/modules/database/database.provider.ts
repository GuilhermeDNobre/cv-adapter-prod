import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from 'schema';

export const DATABASE = 'DATABASE';
export const DATABASE_POOL = 'DATABASE_POOL';

export type Database = NodePgDatabase<typeof schema>;

export function createDatabasePool(configService: ConfigService): Pool {
  const url = configService.get<string>('DATABASE_URL');
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({ connectionString: url });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

// The pool is a provider of its own so Nest can close it on shutdown. Letting
// drizzle open an implicit pool leaves Postgres connections alive after
// app.close(), which leaks a connection slot per restart in production and
// makes an integration suite drop its database out from under a live backend.
export const databasePoolProvider: Provider = {
  provide: DATABASE_POOL,
  useFactory: createDatabasePool,
  inject: [ConfigService],
};

export const databaseProvider: Provider = {
  provide: DATABASE,
  useFactory: createDatabase,
  inject: [DATABASE_POOL],
};
