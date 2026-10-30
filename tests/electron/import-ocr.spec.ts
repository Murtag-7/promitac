import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { launchApp } from './helpers'

test('the import assistant reads a photo with offline OCR inside Electron', async () => {
  test.setTimeout(150_000)
  const { app } = await launchApp()
  try {
    const win = await app.firstWindow()
    await win.getByRole('button', { name: 'Import písně' }).click()
    const panel = win.getByRole('dialog', { name: 'Import písně' })
    await panel
      .getByTestId('import-file-input')
      .setInputFiles(resolve('tests/fixtures/ocr/svetlo-nad-udolim.png'))
    const card = panel.getByTestId('import-card')
    await expect(card).toBeVisible({ timeout: 120_000 })
    await expect(card).toContainText('s akordy')
    await card.getByRole('button', { name: 'Přidat do knihovny' }).click()
    await expect(card).toContainText('Přidáno do knihovny')
  } finally {
    await app.close()
  }
})
