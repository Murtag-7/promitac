import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page
    .getByRole('navigation', { name: 'Hlavní navigace' })
    .getByRole('button', { name: 'Plán' })
    .click()
})

test('create a plan, add songs and an announcement, reorder, project', async ({ page }) => {
  await page.getByRole('button', { name: 'Nový plán' }).click()
  const popover = page.getByRole('dialog')
  await popover.getByLabel('Název', { exact: true }).fill('Večer chval')
  await popover.getByRole('button', { name: 'Nový plán' }).click()
  await expect(page.getByRole('textbox', { name: 'Název', exact: true })).toHaveValue('Večer chval')

  await page.getByRole('button', { name: 'Píseň', exact: true }).click()
  await page.getByRole('textbox', { name: 'Vyberte píseň' }).fill('svetlo')
  await page
    .getByRole('list', { name: 'Vyberte píseň' })
    .getByRole('button', { name: /Světlo nad městem/ })
    .click()

  await page.getByRole('button', { name: 'Píseň', exact: true }).click()
  await page.getByRole('textbox', { name: 'Vyberte píseň' }).fill('skala')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: 'Text / oznámení' }).click()
  await page.getByLabel('Nadpis').fill('Oznámení')
  await page.getByLabel('Text', { exact: true }).fill('Kafe po bohoslužbě')

  const items = page.getByTestId('plan-items').locator('li')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('Světlo nad městem')

  // keyboard reorder with dnd-kit: focus handle, space, arrow down, space
  await items
    .nth(0)
    .getByRole('button', { name: /Přesunout/ })
    .focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  await page.keyboard.press('Space')
  await expect(items.nth(1)).toContainText('Světlo nad městem')

  await page.getByRole('button', { name: 'Promítat tento plán' }).click()
  const cue = page.getByRole('list', { name: 'Večer chval' })
  await expect(cue.getByRole('button', { name: /^Promítnout:/ })).toHaveCount(3)
})

test('bible passage item shows slides from the bundled Kralice Bible', async ({ page }) => {
  await page
    .getByRole('button', { name: /Nedělní bohoslužba/ })
    .first()
    .click()
  await page
    .getByTestId('plan-items')
    .getByRole('button', { name: /^\d+\s*Žalmy 23/ })
    .click()
  await expect(page.getByRole('complementary', { name: 'Náhled slajdů' })).toContainText('Hospodin')
})

test('a removed item can be put back from the toast', async ({ page }) => {
  await page.getByRole('button', { name: 'Nový plán' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Nový plán' }).click()
  await page.getByRole('button', { name: 'Prázdný slajd' }).click()
  await page.getByRole('button', { name: 'Text / oznámení' }).click()
  const items = page.getByTestId('plan-items').locator('li')
  await expect(items).toHaveCount(2)

  await items.nth(0).getByRole('button', { name: 'Odebrat z plánu' }).click()
  await expect(items).toHaveCount(1)
  await page.getByRole('button', { name: 'Vrátit' }).click()
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('Prázdný slajd')
})

test('the long date in the header changes the plan date', async ({ page }) => {
  await page.getByRole('button', { name: 'Nový plán' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Nový plán' }).click()
  await expect(page.getByRole('button', { name: /^Změnit datum:/ })).toBeVisible()
  await page.getByLabel('Datum', { exact: true }).fill('2030-12-24')
  await expect(page.getByRole('button', { name: /^Změnit datum:/ })).toContainText('24. prosince 2030')
})
