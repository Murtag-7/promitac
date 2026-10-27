import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('button', { name: 'Plán' }).click()
})

test('create a plan, add songs and an announcement, reorder, project', async ({ page }) => {
  await page.getByRole('button', { name: 'Nový plán' }).click()
  await page.getByLabel('Název', { exact: true }).fill('Večer chval')
  await page.getByRole('button', { name: 'Nový plán' }).last().click()
  await expect(page.getByLabel('Název', { exact: true })).toHaveValue('Večer chval')

  await page.getByRole('button', { name: 'Píseň', exact: true }).click()
  await page.getByRole('textbox', { name: 'Vyberte píseň' }).fill('svetlo')
  await page.getByRole('list', { name: 'Vyberte píseň' }).getByRole('button', { name: /Světlo nad městem/ }).click()

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
  await items.nth(0).getByRole('button', { name: /Další možnosti/ }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(items.nth(1)).toContainText('Světlo nad městem')

  await page.getByRole('button', { name: 'Promítat tento plán' }).click()
  const cue = page.getByRole('list', { name: 'Večer chval' })
  await expect(cue.getByRole('button')).toHaveCount(3)
})

test('bible passage item shows slides from the bundled Kralice Bible', async ({ page }) => {
  await page.getByRole('button', { name: /Nedělní bohoslužba/ }).first().click()
  await page.getByRole('button', { name: /Žalmy 23/ }).click()
  await expect(page.getByRole('complementary', { name: 'Náhled slajdů' })).toContainText('Hospodin')
})
