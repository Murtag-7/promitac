/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOGO = resolve(process.cwd(), 'tests/fixtures/media/logo-sboru.png')
const BACKGROUND = resolve(process.cwd(), 'tests/fixtures/media/pozadi-podvecer.png')
const VIDEO = resolve(process.cwd(), 'tests/fixtures/media/smycka.webm')

const nav = (page: Page) => page.getByRole('navigation', { name: 'Hlavní navigace' })
const fileInput = (page: Page) => page.getByTestId('media-file-input')

async function openMedia(page: Page): Promise<void> {
  await page.goto('/')
  await nav(page).getByRole('button', { name: 'Média', exact: true }).click()
}

const grid = (page: Page) => page.getByRole('list', { name: 'Knihovna médií' })
const card = (page: Page, name: string) => grid(page).getByRole('listitem').filter({ hasText: name })

async function menuAction(page: Page, name: string, action: string | RegExp): Promise<void> {
  await card(page, name)
    .getByRole('button', { name: `Možnosti: ${name}` })
    .click()
  await page.getByRole('menuitem', { name: action }).click()
}

test('empty library teaches the next action', async ({ page }) => {
  await openMedia(page)
  await expect(page.getByRole('heading', { name: 'Zatím žádná média' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Přidat média' })).toHaveCount(2)
})

test('files dropped anywhere on the screen are imported', async ({ page }) => {
  await openMedia(page)
  const dataTransfer = await page.evaluateHandle((base64) => {
    // Runs in the browser; the node tsconfig has no DOM types, so DataTransfer comes from globalThis.
    const { DataTransfer: BrowserDataTransfer } = globalThis as unknown as {
      DataTransfer: new () => { items: { add(file: File): void } }
    }
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const dt = new BrowserDataTransfer()
    dt.items.add(new File([bytes], 'presunuto.png', { type: 'image/png' }))
    return dt
  }, readFileSync(BACKGROUND).toString('base64'))
  const target = page.getByRole('heading', { name: 'Zatím žádná média' })
  await target.dispatchEvent('dragenter', { dataTransfer })
  await expect(page.getByText('Pusťte soubory sem')).toBeVisible()
  await target.dispatchEvent('dragover', { dataTransfer })
  await target.dispatchEvent('drop', { dataTransfer })
  await expect(page.getByText('Pusťte soubory sem')).toHaveCount(0)
  await expect(card(page, 'presunuto')).toContainText('Obrázek')
})

test('a video shows its first frame with a play glyph and its length', async ({ page }) => {
  await openMedia(page)
  await fileInput(page).setInputFiles(VIDEO)
  const video = card(page, 'smycka')
  await expect(video).toContainText('Video')
  await expect(video.locator('video')).toHaveAttribute('src', /#t=0\.1$/)
  await expect(video.getByText('0:03', { exact: true })).toBeVisible()
  await expect(video.getByText('Soubor nelze zobrazit')).toHaveCount(0)
})

test('uploaded PNG shows a card; logo badge; background reaches the live preview', async ({ page }) => {
  await openMedia(page)
  await fileInput(page).setInputFiles([LOGO, BACKGROUND])
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
  await fileInput(page).setInputFiles(LOGO)
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
  await fileInput(page).setInputFiles([
    { name: 'pozadi-podvecer.png', mimeType: 'image/png', buffer: readFileSync(BACKGROUND) },
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
  await fileInput(page).setInputFiles(BACKGROUND)
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
