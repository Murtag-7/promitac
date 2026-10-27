import { expect, test } from '@playwright/test'

test('main navigation shows all sections', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Hlavní navigace' })
  for (const label of ['Živě', 'Plán', 'Písně', 'Bible', 'Média', 'Nastavení']) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
})

test('help opens from the top bar and with F1', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Nápověda' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nápověda' })
  await expect(dialog).toContainText('Bohoslužba ve čtyřech krocích')
  await expect(dialog).toContainText('Černá obrazovka')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.keyboard.press('F1')
  await expect(dialog).toBeVisible()
})
