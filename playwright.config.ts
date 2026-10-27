import { defineConfig, devices } from '@playwright/test'

/** UI tests against the renderer running in a plain browser with the mocked API. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    locale: 'cs-CZ',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }
  ],
  webServer: {
    command: 'npx vite preview --config vite.web.config.ts',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
