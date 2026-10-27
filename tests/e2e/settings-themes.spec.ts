import { expect, test, type Page } from '@playwright/test'

const BUILT_IN_NOTICE = 'Vestavěný motiv – pro úpravy ho duplikujte.'

async function openThemes(page: Page): Promise<void> {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Hlavní navigace' })
    .getByRole('button', { name: 'Nastavení', exact: true })
    .click()
  await page
    .getByRole('navigation', { name: 'Nastavení', exact: true })
    .getByRole('button', { name: 'Motivy', exact: true })
    .click()
  await expect(themeList(page)).toBeVisible()
}

const themeList = (page: Page) => page.getByRole('complementary', { name: 'Seznam motivů' })
/** The built-in "Klasický tmavý" (not its copies). */
const CLASSIC = /^Klasický tmavý(?!\s*\()/
const preview = (page: Page) => page.getByRole('img', { name: 'Náhled motivu' })
const previewText = (page: Page) => preview(page).locator('[data-font-size]')

async function duplicateClassic(page: Page): Promise<void> {
  await themeList(page).getByRole('button', { name: CLASSIC }).click()
  await expect(page.getByRole('note')).toHaveText(BUILT_IN_NOTICE)
  await page.getByRole('button', { name: 'Duplikovat', exact: true }).click()
  await expect(themeList(page).getByRole('button', { name: /Klasický tmavý \(kopie\)/ })).toBeVisible()
}

function storedThemes(page: Page): Promise<Array<{ id: string; name: string; text: { color: string } }>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('promitac-mock:themes') ?? '[]'))
}

test('built-in theme is read-only and explains how to edit it', async ({ page }) => {
  await openThemes(page)
  // The default built-in theme is open first.
  await expect(themeList(page).getByRole('button', { name: CLASSIC })).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('note')).toHaveText(BUILT_IN_NOTICE)
  await expect(page.getByTestId('theme-editor').locator('[inert]')).toHaveCount(1)
  await expect(page.getByLabel('Název', { exact: true })).toHaveCount(0)

  await themeList(page)
    .getByRole('button', { name: /^Noční modrá/ })
    .click()
  await expect(page.getByRole('note')).toHaveText(BUILT_IN_NOTICE)
  await expect(page.getByRole('heading', { name: 'Noční modrá' })).toBeVisible()
})

test('duplicating "Klasický tmavý" creates an editable theme', async ({ page }) => {
  await openThemes(page)
  await duplicateClassic(page)

  const copy = themeList(page).getByRole('button', { name: /Klasický tmavý \(kopie\)/ })
  await expect(copy).toHaveAttribute('aria-current', 'true')
  const name = page.getByLabel('Název', { exact: true })
  await expect(name).toHaveValue('Klasický tmavý (kopie)')
  await expect(name).toBeFocused()
  await expect(page.getByRole('note')).toHaveCount(0)
  await expect(page.getByTestId('theme-editor').locator('[inert]')).toHaveCount(0)

  // Renaming saves automatically.
  await name.fill('Neděle večer')
  await name.press('Enter')
  await expect(themeList(page).getByRole('button', { name: /Neděle večer/ })).toBeVisible()
  await expect.poll(async () => (await storedThemes(page)).map((t) => t.name)).toContain('Neděle večer')
})

test('changing the text colour updates the live preview and is saved', async ({ page }) => {
  await openThemes(page)
  await duplicateClassic(page)

  await expect(previewText(page)).toHaveCSS('color', 'rgb(255, 255, 255)')
  const hex = page.getByLabel('Barva textu', { exact: true })
  await hex.fill('#ff3366')
  await expect(previewText(page)).toHaveCSS('color', 'rgb(255, 51, 102)')
  await expect(page.getByRole('status').filter({ hasText: 'Uloženo' })).toBeVisible()
  await expect
    .poll(async () => (await storedThemes(page)).find((t) => t.name.includes('kopie'))?.text.color)
    .toBe('#ff3366')

  // Switches apply instantly too.
  await page.getByText('Velká písmena', { exact: true }).click()
  await expect(previewText(page)).toContainText('TVOJE SLOVO JE SVĚTLO')
})

test('slider changes update the preview while moving', async ({ page }) => {
  await openThemes(page)
  await duplicateClassic(page)

  const before = await previewText(page).getAttribute('data-font-size')
  const thumb = page.getByRole('slider', { name: 'Velikost písma' })
  await thumb.focus()
  await thumb.press('Home')
  await expect(previewText(page)).not.toHaveAttribute('data-font-size', before ?? '')
  await expect(previewText(page)).toHaveAttribute('data-font-size', '48')
})

test('set as default persists after reload; the default cannot be deleted', async ({ page }) => {
  await openThemes(page)
  await duplicateClassic(page)

  await page.getByRole('button', { name: 'Nastavit jako výchozí' }).click()
  await expect(page.getByText('Výchozí motiv', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Smazat', exact: true })).toBeDisabled()
  await expect.poll(async () => (await storedThemes(page)).length).toBe(1)
  const copyId = (await storedThemes(page))[0]?.id
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('promitac-mock:settings') ?? '{}').defaultThemeId)
    )
    .toBe(copyId)

  await page.reload()
  await openThemes(page)
  const copy = themeList(page).getByRole('button', { name: /Klasický tmavý \(kopie\)/ })
  await expect(copy).toContainText('Výchozí')
  await expect(copy).toHaveAttribute('aria-current', 'true')
  await expect(themeList(page).getByRole('button', { name: CLASSIC })).not.toContainText('Výchozí')
})

test('a user theme can be deleted after confirmation', async ({ page }) => {
  await openThemes(page)
  await duplicateClassic(page)

  await page.getByRole('button', { name: 'Smazat', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Smazat motiv?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Smazat', exact: true }).click()
  await expect(themeList(page).getByRole('button', { name: /kopie/ })).toHaveCount(0)
  await expect(themeList(page).getByRole('button', { name: CLASSIC })).toHaveAttribute('aria-current', 'true')
  await expect.poll(async () => (await storedThemes(page)).length).toBe(0)
})
