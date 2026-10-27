import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

// Generates docs/screenshots/*.png (run with `npm run screenshots`). Skipped in the normal e2e run.
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/screenshots')

const OUT = (name: string): string => resolve('docs/screenshots', `${name}.png`)

async function fresh(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function nav(page: Page, label: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Hlavní navigace' })
    .getByRole('button', { name: label, exact: true })
    .click()
}

async function addMedia(page: Page): Promise<void> {
  await nav(page, 'Média')
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      resolve('tests/fixtures/media/pozadi-podvecer.png'),
      resolve('tests/fixtures/media/logo-sboru.png')
    ])
  await expect(page.getByText('pozadi-podvecer').first()).toBeVisible()
}

for (const size of [
  { w: 1440, h: 900, tag: '' },
  { w: 1280, h: 720, tag: '-1280x720' },
  { w: 1920, h: 1080, tag: '-1920x1080' }
]) {
  test(`live screen ${size.w}x${size.h}`, async ({ page }) => {
    await page.setViewportSize({ width: size.w, height: size.h })
    await fresh(page)
    await page
      .getByRole('button', { name: /Světlo nad městem/ })
      .first()
      .click()
    await page.locator('[data-slide-index="2"]').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: OUT(`zive${size.tag}`) })
  })
}

test('live screen with background image and alert', async ({ page }) => {
  await fresh(page)
  await addMedia(page)
  await nav(page, 'Živě')
  await page
    .getByRole('button', { name: /Žehnej, duše má/ })
    .first()
    .click()
  await page.locator('[data-slide-index="1"]').click()
  await page.getByRole('button', { name: 'Pozadí' }).click()
  await page.getByRole('button', { name: 'pozadi-podvecer' }).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('Upozornění').fill('Rodiče dítěte č. 12, přijďte prosím do dětské místnosti')
  await page.getByRole('button', { name: 'Zobrazit', exact: true }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: OUT('zive-pozadi-upozorneni') })
})

test('projection output', async ({ page, context }) => {
  await fresh(page)
  await page
    .getByRole('button', { name: /Světlo nad městem/ })
    .first()
    .click()
  await page.locator('[data-slide-index="2"]').click()
  const out = await context.newPage()
  await out.setViewportSize({ width: 1920, height: 1080 })
  await out.goto('/?output=main')
  await expect(out.getByTestId('output-root')).toContainText('Jsi světlo nad městem')
  await out.waitForTimeout(600)
  await out.screenshot({ path: OUT('vystup-pisen') })

  await page
    .getByRole('button', { name: /Žalmy 23/ })
    .first()
    .click()
  await page.locator('[data-slide-index="0"]').click()
  await expect(out.getByTestId('output-root')).toContainText('Hospodin')
  await out.waitForTimeout(600)
  await out.screenshot({ path: OUT('vystup-bible') })
})

test('plan screen', async ({ page }) => {
  await fresh(page)
  await nav(page, 'Plán')
  await page
    .getByTestId('plan-items')
    .getByRole('button', { name: /^\d+\s*Světlo nad městem/ })
    .click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT('plan') })
})

test('songs screen with editor', async ({ page }) => {
  await fresh(page)
  await nav(page, 'Písně')
  await page.getByRole('button', { name: /Ukázková píseň/ }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT('pisne-editor') })
})

test('import assistant', async ({ page }) => {
  await fresh(page)
  await page.getByRole('button', { name: 'Import písně' }).click()
  const panel = page.getByRole('dialog', { name: 'Import písně' })
  await panel
    .getByRole('textbox', { name: 'Vložte text písně…' })
    .fill(
      'Večerní světlo\n\n        G         D\n1. Když slunce zapadá za les,\nEmi        C\ntiše zpívám Tobě.\n\nR:\nC         G\nTy jsi mé světlo,\nD            G\nTy jsi můj klid.\n\nR:'
    )
  await panel.getByRole('button', { name: 'Převést' }).click()
  await panel.getByTestId('import-file-input').setInputFiles(resolve('tests/fixtures/ocr/chleb-a-vino.png'))
  await expect(panel.getByTestId('import-card')).toHaveCount(2, { timeout: 90_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT('import-asistent') })
  await panel.getByTestId('import-card').nth(1).getByRole('button', { name: 'Upravit' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: OUT('import-kontrola') })
})

test('bible screen', async ({ page }) => {
  await fresh(page)
  await nav(page, 'Bible')
  await page.getByRole('textbox', { name: /Odkaz/ }).first().fill('J 3,16-18')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.screenshot({ path: OUT('bible') })
})

test('media screen', async ({ page }) => {
  await fresh(page)
  await addMedia(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: OUT('media') })
})

test('settings screens', async ({ page }) => {
  await fresh(page)
  await nav(page, 'Nastavení')
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT('nastaveni-vystupy') })
  await page.getByRole('button', { name: 'Motivy', exact: true }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: OUT('nastaveni-motivy') })
  await page.getByRole('button', { name: 'Sdílená knihovna', exact: true }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT('nastaveni-ucet') })
})

test('light appearance', async ({ page }) => {
  await fresh(page)
  await nav(page, 'Nastavení')
  await page.getByRole('button', { name: 'Obecné', exact: true }).click()
  await page.getByRole('radio', { name: 'Světlý' }).click()
  await nav(page, 'Živě')
  await page
    .getByRole('button', { name: /Světlo nad městem/ })
    .first()
    .click()
  await page.locator('[data-slide-index="0"]').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: OUT('zive-svetly') })
})
