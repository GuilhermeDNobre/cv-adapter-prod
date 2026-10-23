import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from 'schema';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('migration_start failed', { reason: 'DATABASE_URL is not set' });
  process.exit(1);
}

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'packages/schema/migrations');

async function main(): Promise<void> {
  console.log('migration_start', { migrationsFolder: MIGRATIONS_FOLDER });
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('migration_done', { outcome: 'success' });
  } catch (error: unknown) {
    console.error('migration_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void main();
