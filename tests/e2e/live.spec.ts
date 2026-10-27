import { expect, test, type Page } from '@playwright/test'

const livePreview = (page: Page) => page.getByRole('img', { name: 'Živě', exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible()
})

test('clicking a slide puts it on screen, keys navigate and black out', async ({ page }) => {
  await page
    .getByRole('button', { name: /Světlo nad městem/ })
    .first()
    .click()
  await page.locator('[data-slide-index="0"]').click()
  await expect(livePreview(page)).toContainText('Nad střechami vychází den')
  await expect(page.getByTestId('live-pill')).toContainText('Světlo nad městem')
  await expect(page.locator('[data-slide-index="0"]')).toHaveAttribute('data-state', 'live')
  await expect(page.locator('[data-slide-index="1"]')).toHaveAttribute('data-state', 'next')

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-slide-index="1"]')).toHaveAttribute('data-state', 'live')
  await expect(livePreview(page)).toContainText('Ať každý pozná')

  await page.keyboard.press('b')
  await expect(livePreview(page)).toHaveAttribute('data-overlay', 'black')
  await page.keyboard.press('Escape')
  await expect(livePreview(page)).toHaveAttribute('data-overlay', 'none')

  await page.keyboard.press('r')
  await expect(livePreview(page)).toContainText('Jsi světlo nad městem')
  await page.keyboard.press('m')
  await expect(livePreview(page)).toContainText('svítí dál')
})

test('the output window receives the frame and never shows chords', async ({ page, context }) => {
  await page
    .getByRole('button', { name: /Světlo nad městem/ })
    .first()
    .click()
  await page.locator('[data-slide-index="2"]').click()
  const output = await context.newPage()
  await output.goto('/?output=main')
  const root = output.getByTestId('output-root')
  await expect(root).toContainText('Jsi světlo nad městem')
  const text = (await root.innerText()) ?? ''
  expect(text).not.toMatch(/\[|F#mi|\bDmi\b/)

  await page.keyboard.press('ArrowRight')
  await expect(root).toContainText('Kdo je unavený')
  await page.getByRole('button', { name: /Skrýt text/ }).click()
  await expect(output.locator('[data-overlay="clear"]')).toBeVisible()
  await expect(root).not.toContainText('Kdo je unavený')
})

test('next on the last slide continues with the next plan item', async ({ page }) => {
  await page
    .getByRole('button', { name: /Žehnej, duše má/ })
    .first()
    .click()
  const tiles = page.locator('[data-slide-index]')
  const count = await tiles.count()
  await tiles.nth(count - 1).click()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('live-pill')).toContainText('Žalmy 23')
})

test('alert and countdown appear on the screen', async ({ page }) => {
  await page.getByLabel('Upozornění').fill('Rodiče dítěte č. 12, přijďte prosím')
  await page.getByRole('button', { name: 'Zobrazit', exact: true }).click()
  await expect(livePreview(page)).toContainText('Rodiče dítěte č. 12')
  await page.getByRole('button', { name: 'Skrýt upozornění' }).click()

  await page.getByLabel('Minut').fill('2')
  await page.getByRole('button', { name: 'Spustit odpočet' }).click()
  await expect(livePreview(page)).toContainText('Začínáme za')
  await expect(livePreview(page)).toContainText(/0[12]:[0-5]\d/)
  await page.getByRole('button', { name: 'Zastavit odpočet' }).click()
  await expect(livePreview(page)).not.toContainText('Začínáme za')
})

test('sending a slide ends the countdown', async ({ page }) => {
  await page.getByLabel('Minut').fill('1')
  await page.getByRole('button', { name: 'Spustit odpočet' }).click()
  await expect(livePreview(page)).toContainText('Začínáme za')
  await page
    .getByRole('button', { name: /Světlo nad městem/ })
    .first()
    .click()
  await page.locator('[data-slide-index="0"]').click()
  await expect(livePreview(page)).not.toContainText('Začínáme za')
  await expect(livePreview(page)).toContainText('Nad střechami vychází den')
})

test('the clicker keeps working while typing, Shift+arrows move between items', async ({ page }) => {
  await page
    .getByRole('button', { name: /Světlo nad městem/ })
    .first()
    .click()
  await page.locator('[data-slide-index="0"]').click()
  await page.getByLabel('Upozornění').click()
  await page.keyboard.type('b')
  await expect(page.getByLabel('Upozornění')).toHaveValue('b')
  // A letter typed into a field must not black out the screen …
  await expect(livePreview(page)).toHaveAttribute('data-overlay', 'none')
  // … but a clicker (PageDown) still advances the slide.
  await page.keyboard.press('PageDown')
  await expect(page.locator('[data-slide-index="1"]')).toHaveAttribute('data-state', 'live')
  await page.getByLabel('Upozornění').blur()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.getByTestId('live-pill')).not.toContainText('Světlo nad městem')
})
