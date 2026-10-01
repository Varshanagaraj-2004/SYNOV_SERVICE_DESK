import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';

const clientDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(clientDirectory, '../../server');

export default function globalSetup(_config: FullConfig) {
  const requiredVariables = [
    'MONGO_URI_TEST',
    'E2E_ADMIN_EMAIL',
    'E2E_ADMIN_PASSWORD',
    'E2E_STAFF_EMAIL',
    'E2E_STAFF_PASSWORD',
    'E2E_CLIENT_EMAIL',
    'E2E_CLIENT_PASSWORD',
  ];
  const missing = requiredVariables.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing E2E environment variables: ${missing.join(', ')}`);

  execFileSync(process.execPath, ['src/scripts/seedE2e.js'], {
    cwd: serverDirectory,
    stdio: 'inherit',
    env: {
      ...process.env,
      JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-secret-at-least-32-characters',
    },
  });
}