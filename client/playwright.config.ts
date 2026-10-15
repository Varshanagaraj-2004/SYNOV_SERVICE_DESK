import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const baseURL = 'http://127.0.0.1:5173';
const apiURL = loadEnv('development', process.cwd(), 'VITE_').VITE_API_URL;
const testMongoUri = process.env.MONGO_URI_TEST;
const testJwtSecret = process.env.JWT_SECRET || 'playwright-test-secret-at-least-32-characters';

if (!testMongoUri) throw new Error('Set MONGO_URI_TEST to a dedicated test database before running Playwright.');
if (!apiURL) throw new Error('Set VITE_API_URL in the client environment before running Playwright.');

const apiHealthURL = `${apiURL.replace(/\/$/, '')}/health`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/globalSetup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'cd ../server && npm run dev',
      url: apiHealthURL,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        MONGO_URI: testMongoUri,
        JWT_SECRET: testJwtSecret,
        CORS_ORIGINS: baseURL,
        EMAIL_TRANSPORT: 'stub',
        SMTP_HOST: 'stub',
        SMTP_USER: '',
        SMTP_PASS: '',
        IMAP_HOST: '',
        IMAP_USER: '',
        IMAP_PASS: '',
        ETHEREAL_USER: '',
        ETHEREAL_PASS: '',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { VITE_API_URL: apiURL },
    },
  ],
});
