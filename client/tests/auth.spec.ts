import { test, expect } from '@playwright/test';

async function login(page: any, email: string, password: string, expectedSuccess = true) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  if (expectedSuccess) {
    await page.waitForURL('**/', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  } else {
    await expect(page.getByText('Invalid email or password.')).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/login$/);
  }
}

test.describe('Authentication', () => {
  test('admin can sign in with valid credentials', async ({ page }) => {
    await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!, true);
    await expect(page).toHaveURL(/\/$/);
  });

  test('wrong password is rejected', async ({ page }) => {
    await login(page, process.env.E2E_ADMIN_EMAIL!, `${process.env.E2E_ADMIN_PASSWORD!}-wrong`, false);
  });
});
