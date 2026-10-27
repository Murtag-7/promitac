import { expect, test } from '@playwright/test'

test('main navigation shows all sections', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Hlavní navigace' })
  for (const label of ['Živě', 'Plán', 'Písně', 'Bible', 'Média', 'Nastavení']) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
})
