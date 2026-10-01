import { test, expect } from '@playwright/test';

async function login(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/', { timeout: 15000 });
}

test.describe('User management', () => {
  test('client can add a company user and see it in the list', async ({ page }) => {
    await login(page, process.env.E2E_CLIENT_EMAIL!, process.env.E2E_CLIENT_PASSWORD!);
    await page.goto('/users/add');
    await expect(page.getByRole('heading', { name: 'Add New User' })).toBeVisible({ timeout: 15000 });

    const userName = `Playwright User ${Date.now()}`;
    const userEmail = `playwright.${Date.now()}@ankercloud.com`;

    await page.locator('input[name="name"]').fill(userName);
    await page.locator('input[name="department"]').fill('Operations');
    await page.locator('input[name="email"]').fill(userEmail);
    await page.locator('input[name="phone"]').fill('+91 98765 43210');
    await page.locator('input[name="address"]').fill('Bengaluru');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('User created — login credentials have been emailed to them.')).toBeVisible({ timeout: 15000 });
    await page.waitForURL(/\/users$/);
    await expect(page.getByText(userName)).toBeVisible({ timeout: 15000 });
  });
});
