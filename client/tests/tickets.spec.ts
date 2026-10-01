import { test, expect } from '@playwright/test';

async function login(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/', { timeout: 15000 });
}

test.describe('Ticket workflow', () => {
  test('client can raise a ticket from the form', async ({ page }) => {
    await login(page, process.env.E2E_CLIENT_EMAIL!, process.env.E2E_CLIENT_PASSWORD!);
    await page.goto('/raise-ticket');
    await expect(page.getByRole('heading', { name: 'Raise a ticket' })).toBeVisible({ timeout: 15000 });

    const issueText = `Playwright ticket ${Date.now()}`;
    await page.locator('textarea[name="issueReported"]').fill(issueText);
    await page.locator('input[name="userName"]').fill('Priya Nair');
    await page.locator('input[name="userEmail"]').fill(process.env.E2E_CLIENT_EMAIL!);
    await page.getByRole('button', { name: 'Submit' }).click();

    await page.waitForURL(/\/tickets$/);
    await expect(page.getByText(issueText)).toBeVisible({ timeout: 15000 });
  });
});
