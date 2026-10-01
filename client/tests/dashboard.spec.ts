import { test, expect } from '@playwright/test';

async function login(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/', { timeout: 15000 });
}

test.describe('Dashboard', () => {
  test('admin dashboard shows key widgets', async ({ page }) => {
    await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'New Messages' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Total Tickets')).toBeVisible({ timeout: 15000 });
  });
});
