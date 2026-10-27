import { defineConfig, devices } from '@playwright/test'

// E2E_PORT / E2E_OUTDIR allow several independent runs side by side.
const port = Number(process.env.E2E_PORT ?? 5199)
const outDir = process.env.E2E_OUTDIR ?? 'out/web'

/** UI tests against the renderer running in a plain browser with the mocked API. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    locale: 'cs-CZ',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }
  ],
  webServer: {
    command: `npx vite preview --config vite.web.config.ts --outDir ${outDir} --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
