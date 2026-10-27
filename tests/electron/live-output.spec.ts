import { expect, test, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchApp } from './helpers'

test('projects a slide into a real output window and stores songs as .chordpro files', async () => {
  const { app, dataDir } = await launchApp({}, (dir) => {
    mkdirSync(dir, { recursive: true })
    // One monitor under xvfb → show the output in a window (the "test with one monitor" mode).
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        outputs: [{ id: 'main', name: 'Plátno', displayId: 'auto', enabled: true, windowed: true }],
        deviceName: 'E2E'
      })
    )
  })
  try {
    const control = await app.firstWindow()
    await expect(control.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible()

    // First run seeds the library as plain .chordpro files.
    const songsDir = join(dataDir, 'library', 'songs')
    await expect.poll(() => existsSync(songsDir) && readdirSync(songsDir).length).toBeGreaterThanOrEqual(3)
    expect(readdirSync(songsDir).every((f) => f.endsWith('.chordpro'))).toBe(true)

    const output = await new Promise<Page>((resolve, reject) => {
      const find = (): Page | undefined => app.windows().find((w) => w.url().includes('output=main'))
      const existing = find()
      if (existing) return resolve(existing)
      const timer = setTimeout(() => reject(new Error('output window did not open')), 20_000)
      app.on('window', (w) => {
        if (w.url().includes('output=main')) {
          clearTimeout(timer)
          resolve(w)
        }
      })
    })
    await expect(control.getByTestId('output-status-main')).toContainText('Promítá na')

    // The seeded template plan has a welcome text item → project it.
    await control.getByRole('button', { name: /Vítejte/ }).first().click()
    await control.locator('[data-slide-index="0"]').click()
    await expect(output.getByTestId('output-root')).toContainText('Vítejte na bohoslužbě')

    await control.keyboard.press('b')
    await expect(output.locator('[data-overlay="black"]')).toBeVisible()
  } finally {
    await app.close()
  }
})
