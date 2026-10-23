import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/index.ts',
  out: './migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter',
  },
});
