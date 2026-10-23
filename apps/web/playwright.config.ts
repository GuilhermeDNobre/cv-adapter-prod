import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
const API_PORT = 3101;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `node --import tsx ./e2e/start-api-harness.ts --port ${String(API_PORT)}`,
      cwd: '../api',
      port: API_PORT,
      timeout: 30_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter_e2e',
        REDIS_URL: 'redis://127.0.0.1:6379/15',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
        CORS_ORIGINS: `http://localhost:${String(WEB_PORT)}`,
        PORT: String(API_PORT),
      },
    },
    {
      command: `pnpm run copy:paged && npx next dev --port ${String(WEB_PORT)}`,
      port: WEB_PORT,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${String(API_PORT)}`,
      },
    },
  ],
});
