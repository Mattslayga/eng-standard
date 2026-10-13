// Template (eng e2e-flow skill). One short test per user journey; starts signed in from the setup step.
// Copy to tests/<journey>.e2e.ts. One journey = one thing a user wants done, asserted on what they see.
import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from './auth.setup.e2e';

test.use({ storageState: STORAGE_STATE });

test('user creates a note', async ({ page }) => {
  await page.goto('/notes');
  await page.screenshot({ path: 'before-create.png' });
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Title').fill('Groceries');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Groceries' })).toBeVisible();
  await page.screenshot({ path: 'after-create.png' });
});
