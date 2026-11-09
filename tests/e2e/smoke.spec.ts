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
  // The short operator guide is bundled and readable offline; its screenshot is left out in the app
  // and the link to the detailed guide points to GitHub.
  await dialog.getByRole('button', { name: 'Otevřít návod' }).click()
  const guide = dialog.getByTestId('guide')
  await expect(guide).toContainText('Tři věci, které musíte vědět')
  await expect(guide.getByRole('table').first()).toBeVisible()
  await expect(guide.locator('img')).toHaveCount(0)
  await expect(guide.getByRole('link', { name: 'podrobném návodu' })).toHaveAttribute(
    'href',
    'https://github.com/Murtag-7/promitac/blob/main/docs/NAVOD-PODROBNY.md'
  )
})
