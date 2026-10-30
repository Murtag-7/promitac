import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'

const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'import-files')

async function openBackup(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Hlavní navigace' })
    .getByRole('button', { name: 'Nastavení', exact: true })
    .click()
  await page
    .getByRole('navigation', { name: 'Nastavení' })
    .getByRole('button', { name: 'Import, export, záloha', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Import, export a záloha' })).toBeVisible()
}

test.describe('Nastavení → Import, export, záloha', () => {
  test('importing a .chordpro, a plain .txt and OpenLyrics .xml adds the songs to Písně', async ({
    page
  }) => {
    await page.goto('/')
    await openBackup(page)
    await page
      .getByTestId('import-song-files')
      .setInputFiles([
        join(FIXTURES, 'svetlo-rana.chordpro'),
        join(FIXTURES, 'most-pres-reku.txt'),
        join(FIXTURES, 'tichy-pristav.xml'),
        join(FIXTURES, 'prazdny.txt')
      ])
    await expect(page.getByText('Importovány 3 písně')).toBeVisible()
    // The empty file is reported with its reason and stays listed until dismissed.
    const report = page.getByTestId('import-report')
    await expect(report).toContainText('1 soubor se nepodařilo načíst')
    await expect(report).toContainText('prazdny.txt')
    await expect(report).toContainText('Soubor neobsahuje text písně.')

    await page
      .getByRole('navigation', { name: 'Hlavní navigace' })
      .getByRole('button', { name: 'Písně', exact: true })
      .click()
    await expect(page.getByText('Světlo rána').first()).toBeVisible()
    await expect(page.getByText('Most přes řeku').first()).toBeVisible()
    await expect(page.getByText('Tichý přístav').first()).toBeVisible()

    // Persisted: still there after a reload.
    await page.reload()
    await page
      .getByRole('navigation', { name: 'Hlavní navigace' })
      .getByRole('button', { name: 'Písně', exact: true })
      .click()
    await expect(page.getByText('Světlo rána').first()).toBeVisible()
  })

  test('importing the same file again is skipped as a duplicate', async ({ page }) => {
    await page.goto('/')
    await openBackup(page)
    const input = page.getByTestId('import-song-files')
    await input.setInputFiles(join(FIXTURES, 'svetlo-rana.chordpro'))
    await expect(page.getByText('Importována 1 píseň')).toBeVisible()
    await input.setInputFiles(join(FIXTURES, 'svetlo-rana.chordpro'))
    await expect(page.getByText('Žádná píseň nebyla importována')).toBeVisible()
    await expect(page.getByTestId('import-report')).toContainText('1 píseň už v knihovně byla')
  })

  test('backup and restore explain themselves and show the browser-demo error nicely', async ({ page }) => {
    await page.goto('/')
    await openBackup(page)
    await page.getByRole('switch', { name: 'Včetně médií' }).click()
    await expect(page.getByRole('switch', { name: 'Včetně médií' })).toBeChecked()
    await page.getByRole('button', { name: 'Uložit zálohu…' }).click()
    await expect(page.getByText('Zálohu se nepodařilo uložit')).toBeVisible()
    await expect(page.getByText('Záloha je dostupná jen v desktopové aplikaci.')).toBeVisible()

    await page.getByRole('button', { name: 'Vybrat zálohu…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Obnovit knihovnu ze zálohy?' })
    await expect(dialog).toContainText('automaticky uloží')
    await dialog.getByRole('button', { name: 'Vybrat zálohu a obnovit' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Zálohu se nepodařilo obnovit')).toBeVisible()
    await expect(page.getByText('Obnova je dostupná jen v desktopové aplikaci.')).toBeVisible()
  })
})

test.describe('Nastavení → Asistent importu (AI klíč)', () => {
  test('saves a key masked, toggles visibility and removes it', async ({ page }) => {
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Hlavní navigace' })
      .getByRole('button', { name: 'Nastavení', exact: true })
      .click()
    await page
      .getByRole('navigation', { name: 'Nastavení' })
      .getByRole('button', { name: 'Asistent importu', exact: true })
      .click()
    await expect(page.getByTestId('ai-status')).toContainText('Vypnuto')
    const key = 'AIzaSyTESTKEY-1234567890abcdWXYZ'
    const input = page.getByLabel('API klíč Gemini')
    await input.fill('short')
    await page.getByRole('button', { name: 'Uložit' }).click()
    await expect(page.getByRole('alert')).toContainText('příliš krátký')
    await input.fill(key)
    await expect(input).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Zobrazit klíč' }).click()
    await expect(input).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Uložit' }).click()
    await expect(page.getByTestId('ai-status')).toContainText('Zapnuto')
    await expect(page.getByText(/Uložený klíč •+WXYZ/)).toBeVisible()
    // The full key is never shown after saving.
    await expect(page.locator('body')).not.toContainText(key)
    await page.getByRole('button', { name: 'Odebrat klíč' }).click()
    await expect(page.getByTestId('ai-status')).toContainText('Vypnuto')
  })
})
