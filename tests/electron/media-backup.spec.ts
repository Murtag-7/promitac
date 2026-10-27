import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launchApp } from './helpers'

test('media are copied into the library and served to the window', async () => {
  const { app, dataDir } = await launchApp()
  try {
    const win = await app.firstWindow()
    await win
      .getByRole('navigation', { name: 'Hlavní navigace' })
      .getByRole('button', { name: 'Média' })
      .click()
    await win
      .locator('input[type="file"]')
      .first()
      .setInputFiles(resolve('tests/fixtures/media/pozadi-podvecer.png'))
    const img = win.locator('main img').first()
    await expect(img).toBeVisible()
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    expect(await img.getAttribute('src')).toMatch(/^app:\/\/media\//)
    const mediaDir = join(dataDir, 'library', 'media')
    expect(readdirSync(mediaDir).filter((f) => f.endsWith('.png'))).toHaveLength(1)
  } finally {
    await app.close()
  }
})

test('library backup is written to a ZIP and can be restored', async () => {
  const { app, dataDir } = await launchApp()
  const zip = join(dataDir, 'zaloha-test.zip')
  try {
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: file
      })) as typeof dialog.showSaveDialog
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [file]
      })) as typeof dialog.showOpenDialog
    }, zip)
    const win = await app.firstWindow()
    await win
      .getByRole('navigation', { name: 'Hlavní navigace' })
      .getByRole('button', { name: 'Nastavení' })
      .click()
    await win.getByRole('button', { name: 'Import, export, záloha', exact: true }).click()
    await win.getByRole('button', { name: 'Uložit zálohu…' }).click()
    await expect.poll(() => existsSync(zip) && statSync(zip).size).toBeGreaterThan(1000)

    await win.getByRole('button', { name: 'Vybrat zálohu…' }).click()
    await win.getByRole('dialog').getByRole('button', { name: 'Vybrat zálohu a obnovit' }).click()
    await expect
      .poll(() => readdirSync(join(dataDir, 'backups')).some((f) => f.startsWith('pred-obnovou-')))
      .toBe(true)
  } finally {
    await app.close()
  }
})
