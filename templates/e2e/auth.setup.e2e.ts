// Template (eng e2e-flow skill). Sign in ONCE, save the session, every journey reuses it.
// Copy to tests/auth.setup.e2e.ts. Written against Playwright's API (the runner under tester-army/e2e);
// map `page`/`context` to the runner's handles if your installed e2e skill names them differently.
import { test as setup, expect } from '@playwright/test';

export const STORAGE_STATE = '.eng/e2e-auth/state.json'; // gitignored; never commit sessions

setup('sign in once and save the session', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  // Dismiss first-run modals ONCE here (or seed the "seen" flag), so journeys never repeat it.
  const tour = page.getByRole('dialog', { name: /welcome/i });
  if (await tour.isVisible()) await tour.getByRole('button', { name: /close|skip/i }).click();
  await page.context().storageState({ path: STORAGE_STATE });
});
