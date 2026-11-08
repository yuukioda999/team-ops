import { defineConfig, devices } from '@playwright/test'

/**
 * Runs against the environment started by `make up` (or the smoke workflow in CI).
 * WEB_URL and MAILPIT_URL can point elsewhere.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:5173',
    // The CI check of the demo server setup uses Caddy's own certificate for localhost (deploy-check.yml)
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === '1',
    ...devices['Pixel 7'],
    locale: 'ja-JP',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
})
