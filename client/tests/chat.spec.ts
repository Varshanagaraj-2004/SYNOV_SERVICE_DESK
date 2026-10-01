import { test, expect } from '@playwright/test';

async function login(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/', { timeout: 15000 });
}

test.describe('Chat', () => {
  test('staff user can open a ticket chat and send a message', async ({ page }) => {
    await login(page, process.env.E2E_STAFF_EMAIL!, process.env.E2E_STAFF_PASSWORD!);
    await page.goto('/tickets');
    await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible({ timeout: 15000 });

    await page.getByRole('combobox').nth(1).selectOption('Re-Assigned');

    const chatButton = page.locator('button[aria-label^="Open chat for ticket"]:not([disabled])').first();
    await expect(chatButton).toBeVisible({ timeout: 15000 });
    await chatButton.click();

    const message = `Playwright chat test ${Date.now()}`;
    await page.locator('input[placeholder="Write a message..."]').fill(message);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(message)).toBeVisible({ timeout: 15000 });
  });
});
