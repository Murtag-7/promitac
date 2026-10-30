import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const SONG = `Večerní světlo

        G         D
1. Když slunce zapadá za les,
Emi        C
tiše zpívám Tobě.

R:
C         G
Ty jsi mé světlo,
D            G
Ty jsi můj klid.

        G         D
2. Když hvězdy svítí nad námi,
Emi        C
srdce mé je v Tobě.

R:`

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Import písně' }).click()
})

test('pasted text with chords becomes a song card and goes to the library', async ({ page }) => {
  const panel = page.getByRole('dialog', { name: 'Import písně' })
  await panel.getByRole('textbox', { name: 'Vložte text písně…' }).fill(SONG)
  await panel.getByRole('button', { name: 'Převést' }).click()

  const card = panel.getByTestId('import-card')
  await expect(card.getByLabel('Název')).toHaveValue('Večerní světlo')
  await expect(card).toContainText('Akordy nad textem')
  await expect(card).toContainText('3 sekce')
  await expect(card).toContainText('s akordy')
  // the chorus is referenced twice, never copied
  await expect(card).toContainText('Ty jsi mé světlo')

  await card.getByRole('button', { name: 'Přidat do knihovny' }).click()
  await expect(card).toContainText('Přidáno do knihovny')
  await card.getByRole('button', { name: 'Otevřít píseň' }).click()
  await expect(page.getByTestId('chordpro-editor')).toContainText('Když [G]slunce zap[D]adá za les,')
  await expect(page.getByTestId('chordpro-editor')).toContainText('{arrangement: V1 C V2 C}')
})

test('a duplicate title asks whether to replace or keep both', async ({ page }) => {
  const panel = page.getByRole('dialog', { name: 'Import písně' })
  await panel
    .getByRole('textbox', { name: 'Vložte text písně…' })
    .fill('Amazing Grace\n\nAmazing grace! How sweet the sound')
  await panel.getByRole('button', { name: 'Převést' }).click()
  await panel.getByTestId('import-card').getByRole('button', { name: 'Přidat do knihovny' }).click()
  await expect(panel.getByRole('alert')).toContainText('V knihovně už je píseň „Amazing Grace“')
  await panel.getByRole('button', { name: 'Uložit jako novou' }).click()
  await expect(panel.getByTestId('import-card')).toContainText('Přidáno do knihovny')
})

test('a photo of a songbook page is read offline with OCR', async ({ page }) => {
  test.setTimeout(120_000)
  const panel = page.getByRole('dialog', { name: 'Import písně' })
  await panel.getByTestId('import-file-input').setInputFiles(resolve('tests/fixtures/ocr/pisen-poutnika.png'))
  const card = panel.getByTestId('import-card')
  await expect(card).toBeVisible({ timeout: 90_000 })
  await expect(card.getByLabel('Název')).toHaveValue('Píseň poutníka')
  await expect(card).toContainText('s akordy')
  await card.getByRole('button', { name: 'Upravit' }).click()
  const review = page.getByRole('dialog', { name: 'Píseň poutníka' })
  await expect(review.getByTestId('chordpro-editor')).toContainText('Jdu po [G]kamenité stezce [C]do hor')
})

test('a PDF with a text layer and a DOCX are converted', async ({ page }) => {
  const panel = page.getByRole('dialog', { name: 'Import písně' })
  await panel
    .getByTestId('import-file-input')
    .setInputFiles([
      resolve('tests/fixtures/pdf/svetlo-nad-udolim.pdf'),
      resolve('tests/fixtures/docx/pisen-poutnika.docx')
    ])
  await expect(panel.getByTestId('import-card')).toHaveCount(2, { timeout: 60_000 })
  await expect(panel.getByTestId('import-card').nth(0).getByLabel('Název')).not.toHaveValue('')
  await expect(panel.getByTestId('import-card').nth(1).getByLabel('Název')).toHaveValue('Píseň poutníka')
})
