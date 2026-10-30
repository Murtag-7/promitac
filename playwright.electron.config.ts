import { defineConfig } from '@playwright/test'

/** End-to-end tests of the real Electron app (run under xvfb-run on Linux). */
export default defineConfig({
  testDir: 'tests/electron',
  workers: 1,
  timeout: 90_000,
  reporter: 'list',
  use: { trace: 'retain-on-failure' }
})
