import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const ZEFANIA_KJV = resolve(process.cwd(), 'tests/fixtures/bible/zefania-kjv.xml')

async function openBible(page: Page): Promise<void> {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Hlavní navigace' })
    .getByRole('button', { name: 'Bible', exact: true })
    .click()
}

const passage = (page: Page) => page.getByRole('group', { name: 'Text pasáže' })
const preview = (page: Page) => page.getByRole('complementary', { name: 'Náhled na plátně' })

test('typed reference shows the BKR text and adds it to the live plan', async ({ page }) => {
  await openBible(page)
  await page.getByLabel('Odkaz').fill('J 3,16')

  const verse = passage(page).locator('[data-verse="3:16"]')
  await expect(verse).toContainText('Nebo tak Bůh miloval svět, že Syna svého jednorozeného dal')
  await expect(verse).toHaveAttribute('aria-pressed', 'true')
  await expect(preview(page).getByRole('img', { name: 'Náhled na plátně: Jan 3,16' })).toContainText(
    'Nebo tak Bůh miloval svět'
  )
  await expect(preview(page).getByText('1 slajd', { exact: true })).toBeVisible()

  await preview(page).getByRole('button', { name: 'Přidat do plánu' }).click()
  await expect(page.getByText('Jan 3,16 je v plánu')).toBeVisible()

  await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('button', { name: 'Živě' }).click()
  const cueList = page.getByRole('complementary', { name: 'Plán' })
  await expect(cueList.getByRole('button', { name: /Jan 3,16/ })).toBeVisible()
})

test('book browser: Žalmy → 23 shows the six verses of the chapter', async ({ page }) => {
  await openBible(page)
  const books = page.getByRole('complementary', { name: 'Knihy Bible' })
  await books.getByRole('button', { name: /^Žalmy\b/ }).click()
  await books.getByRole('group', { name: 'Kapitoly – Žalmy' }).getByRole('button', { name: '23', exact: true }).click()

  await expect(page.getByLabel('Odkaz')).toHaveValue('Žalmy 23')
  await expect(page.getByRole('heading', { name: 'Žalmy 23' })).toBeVisible()
  await expect(passage(page).locator('[data-verse]')).toHaveCount(6)
  await expect(passage(page).locator('[data-verse="23:1"]')).toContainText('Hospodin jest můj pastýř')
  await expect(books.getByRole('button', { name: '23', exact: true })).toHaveAttribute('aria-current', 'true')

  await books.getByRole('button', { name: 'Všechny knihy' }).click()
  await expect(books.getByRole('button', { name: /^Žalmy\b/ })).toHaveAttribute('aria-current', 'true')
})

test('click and shift-click select a verse range and update the reference', async ({ page }) => {
  await openBible(page)
  await page.getByLabel('Odkaz').fill('Jan 3')
  await passage(page).locator('[data-verse="3:16"]').click()
  await expect(page.getByLabel('Odkaz')).toHaveValue('Jan 3,16')
  await passage(page).locator('[data-verse="3:18"]').click({ modifiers: ['Shift'] })
  await expect(page.getByLabel('Odkaz')).toHaveValue('Jan 3,16–18')
  await expect(passage(page).locator('[aria-pressed="true"]')).toHaveCount(3)
  await expect(preview(page).getByText('2 slajdy', { exact: true })).toBeVisible()

  // Picking another slide of the preview changes the projected look, not the selection.
  await preview(page).getByRole('button', { name: /Slajd 2/ }).click()
  await expect(preview(page).getByRole('img', { name: /Náhled na plátně/ })).toContainText('Kdož věří v něho')
  await expect(page.getByLabel('Odkaz')).toHaveValue('Jan 3,16–18')
})

test('an unknown reference explains what to type', async ({ page }) => {
  await openBible(page)
  const input = page.getByLabel('Odkaz')
  await input.fill('Xyz 99')
  await input.press('Enter')
  await expect(page.getByText('Takový odkaz neznáme.', { exact: false })).toBeVisible()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await input.fill('Ž 23,1')
  await expect(page.getByText('Takový odkaz neznáme.', { exact: false })).toHaveCount(0)
})

test('import a Zefania translation, read it, then remove it', async ({ page }) => {
  await openBible(page)
  await page.getByLabel('Importovat překlad').setInputFiles(ZEFANIA_KJV)
  await expect(page.getByText('Překlad King James Version byl přidán.')).toBeVisible()

  const select = page.getByRole('combobox', { name: 'Překlad' })
  await expect(select).toHaveText('KJV · King James Version')
  await page.getByLabel('Odkaz').fill('J 3,16')
  await expect(passage(page).locator('[data-verse="3:16"]')).toContainText('For God so loved the world')

  await page.getByRole('button', { name: 'Odebrat překlad' }).click()
  const dialog = page.getByRole('dialog', { name: 'Odebrat překlad?' })
  await dialog.getByRole('button', { name: 'Odebrat', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(select).toHaveText('BKR · Bible kralická (1613)')
  await expect(passage(page).locator('[data-verse="3:16"]')).toContainText('Nebo tak Bůh miloval svět')
})

test('a file that is not a Bible shows a clear error', async ({ page }) => {
  await openBible(page)
  await page.getByLabel('Importovat překlad').setInputFiles({
    name: 'pisen.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from('<song><title>Píseň</title></song>')
  })
  await expect(page.getByText('Soubor se nepodařilo načíst jako Bibli.')).toBeVisible()
  await expect(page.getByText('Tento formát neznáme. Podporujeme Zefania XML, OSIS a USFX.')).toBeVisible()
})
