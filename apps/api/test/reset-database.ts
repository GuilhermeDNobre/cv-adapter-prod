import type { Pool } from 'pg';

export async function resetDatabase(pool: Pool): Promise<void> {
  const tables = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'users'`,
  );
  const names = tables.rows.map((row) => `"${row.tablename}"`).join(', ');
  if (names.length > 0) {
    await pool.query(`TRUNCATE TABLE ${names} CASCADE`);
  }
}
