// Template (eng e2e-flow skill): settings to copy into e2e.config.ts / the runner's Playwright config.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 30_000,                 // per test: a short journey that needs more is two journeys or a slow app (file it)
  expect: { timeout: 5_000 },      // web-first assertions retry up to this; never add sleeps
  retries: 0,                      // retries hide flakes; the flake rule (eng e2e --flake-check) finds them instead
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',    // failure evidence: trace.zip
    screenshot: 'only-on-failure', // failure evidence: final screenshot
    video: 'on',                   // taste evidence (eng e2e keeps it per SHA)
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.e2e\.ts/ },
    { name: 'journeys', testMatch: /\.e2e\.ts$/, testIgnore: /auth\.setup/, dependencies: ['setup'] },
  ],
});
