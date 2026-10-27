import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const LOGO = resolve(process.cwd(), 'tests/fixtures/media/logo-sboru.png')
const BACKGROUND = resolve(process.cwd(), 'tests/fixtures/media/pozadi-podvecer.png')

const nav = (page: Page) => page.getByRole('navigation', { name: 'Hlavní navigace' })

async function openMedia(page: Page): Promise<void> {
  await page.goto('/')
  await nav(page).getByRole('button', { name: 'Média', exact: true }).click()
}

const grid = (page: Page) => page.getByRole('list', { name: 'Knihovna médií' })
const card = (page: Page, name: string) => grid(page).getByRole('listitem').filter({ hasText: name })

async function menuAction(page: Page, name: string, action: string | RegExp): Promise<void> {
  await card(page, name).getByRole('button', { name: `Možnosti: ${name}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

test('empty library teaches the next action', async ({ page }) => {
  await openMedia(page)
  await expect(page.getByRole('heading', { name: 'Zatím žádná média' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Přidat média' })).toHaveCount(2)
})

test('uploaded PNG shows a card; logo badge; background reaches the live preview', async ({ page }) => {
  await openMedia(page)
  await page.getByLabel('Přidat média').setInputFiles([LOGO, BACKGROUND])
  await expect(page.getByText('Přidána 2 média')).toBeVisible()
  await expect(card(page, 'logo-sboru')).toContainText('Obrázek')
  await expect(card(page, 'logo-sboru')).toContainText('5,5 kB')
  await expect(card(page, 'logo-sboru').locator('img')).toBeVisible()
  await expect(page.getByText('2 média ·')).toBeVisible()

  await menuAction(page, 'logo-sboru', 'Použít jako logo sboru')
  await expect(card(page, 'logo-sboru').getByText('Logo sboru', { exact: true })).toBeVisible()
  await expect(card(page, 'pozadi-podvecer').getByText('Logo sboru', { exact: true })).toHaveCount(0)

  await menuAction(page, 'pozadi-podvecer', 'Použít jako pozadí na plátně')
  await expect(card(page, 'pozadi-podvecer').getByText('Pozadí na plátně', { exact: true })).toBeVisible()

  await nav(page).getByRole('button', { name: 'Živě', exact: true }).click()
  const livePreview = page.getByRole('img', { name: 'Živě', exact: true })
  await expect(livePreview).toHaveAttribute('data-overlay', 'none')
  await expect(livePreview.locator('img')).toHaveCount(1)
  await expect(livePreview.locator('img')).toHaveAttribute('src', /^blob:/)

  // The logo button on the Live screen now shows the logo instead of asking to set one.
  await page.getByRole('button', { name: /^Logo/ }).click()
  await expect(livePreview).toHaveAttribute('data-overlay', 'logo')
})

test('logo can be removed again, media renamed, added to the plan and deleted', async ({ page }) => {
  await openMedia(page)
  await page.getByLabel('Přidat média').setInputFiles(LOGO)
  await expect(card(page, 'logo-sboru')).toBeVisible()

  await menuAction(page, 'logo-sboru', 'Použít jako logo sboru')
  await expect(card(page, 'logo-sboru').getByText('Logo sboru', { exact: true })).toBeVisible()
  await menuAction(page, 'logo-sboru', 'Zrušit logo sboru')
  await expect(card(page, 'logo-sboru').getByText('Logo sboru', { exact: true })).toHaveCount(0)

  await menuAction(page, 'logo-sboru', 'Přejmenovat')
  const rename = page.getByRole('dialog', { name: 'Přejmenovat médium' })
  await rename.getByLabel('Název').fill('Znak sboru')
  await rename.getByRole('button', { name: 'Uložit' }).click()
  await expect(rename).toBeHidden()
  await expect(card(page, 'Znak sboru')).toBeVisible()

  await menuAction(page, 'Znak sboru', 'Přidat do plánu')
  await expect(page.getByText('„Znak sboru“ je v plánu')).toBeVisible()

  await menuAction(page, 'Znak sboru', 'Smazat')
  const confirm = page.getByRole('dialog', { name: 'Smazat médium?' })
  await confirm.getByRole('button', { name: 'Smazat' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Zatím žádná média' })).toBeVisible()

  // The plan item now points to a missing file – the cue list says so instead of failing.
  await nav(page).getByRole('button', { name: 'Živě', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Plán' }).getByText('Médium nenalezeno')).toBeVisible()
})

test('local-only flag toggles and unsupported files are reported', async ({ page }) => {
  await openMedia(page)
  await page.getByLabel('Přidat média').setInputFiles([
    BACKGROUND,
    { name: 'poznamky.txt', mimeType: 'text/plain', buffer: Buffer.from('ahoj') }
  ])
  await expect(page.getByText('Soubor poznamky.txt není podporovaný obrázek ani video.')).toBeVisible()
  await expect(grid(page).getByRole('listitem')).toHaveCount(1)

  await card(page, 'pozadi-podvecer').getByRole('button', { name: 'Možnosti: pozadi-podvecer' }).click()
  const flag = page.getByRole('menuitemcheckbox', { name: /Jen na tomto počítači/ })
  await expect(flag).toHaveAttribute('aria-checked', 'false')
  await flag.click()
  await expect(flag).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(card(page, 'pozadi-podvecer').getByText('Jen na tomto počítači')).toHaveCount(1)
})

test('keyboard: the action menu opens with Enter and runs project now', async ({ page }) => {
  await openMedia(page)
  await page.getByLabel('Přidat média').setInputFiles(BACKGROUND)
  const more = card(page, 'pozadi-podvecer').getByRole('button', { name: 'Možnosti: pozadi-podvecer' })
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menuitem', { name: 'Promítnout hned' }).focus()
  await page.keyboard.press('Enter')
  await expect(nav(page).getByRole('button', { name: 'Živě', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(page.getByTestId('live-pill')).toContainText('pozadi-podvecer')
})
