import { expect, type Page, test } from '@playwright/test'

async function openSettings(page: Page, section?: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Hlavní navigace' })
  await nav.getByRole('button', { name: 'Nastavení', exact: true }).click()
  if (section) {
    await page
      .getByRole('navigation', { name: 'Nastavení' })
      .getByRole('button', { name: section, exact: true })
      .click()
  }
}

test.describe('Nastavení → Výstupy', () => {
  test('shows the connected displays and the output card', async ({ page }) => {
    await page.goto('/')
    await openSettings(page)
    await expect(page.getByRole('heading', { name: 'Výstupy na plátno' })).toBeVisible()
    const map = page.getByRole('list', { name: 'Rozložení monitorů' })
    await expect(map.getByText('Projektor (HDMI)')).toBeVisible()
    await expect(map.getByText('Vestavěný displej')).toBeVisible()
    // The projector is the one in use (auto = first external display) and carries the output name.
    await expect(map.locator('li[data-active]')).toHaveCount(1)
    await expect(map.locator('li[data-active]')).toContainText('Projektor (HDMI)')
    await expect(map.locator('li[data-active]')).toContainText('Plátno')
    await expect(page.getByTestId('output-state-main')).toContainText('Promítá na: Projektor (HDMI)')
  })

  test('display, window mode, theme and name persist after reload', async ({ page }) => {
    await page.goto('/')
    await openSettings(page)

    await page.getByRole('combobox', { name: 'Monitor: Plátno' }).click()
    await page.getByRole('option', { name: /Projektor \(HDMI\) · 1920 × 1080/ }).click()
    await page.getByRole('switch', { name: /Zobrazit v okně.*: Plátno/ }).click()
    await page.getByRole('combobox', { name: 'Motiv výstupu: Plátno' }).click()
    await page.getByRole('option', { name: 'Vysoký kontrast' }).click()
    const name = page.getByRole('textbox', { name: 'Název výstupu' })
    await name.fill('Hlavní plátno')
    await name.press('Enter')
    await expect(page.getByTestId('output-card-main')).toContainText('Hlavní plátno')

    await page.reload()
    await openSettings(page)
    await expect(page.getByRole('combobox', { name: 'Monitor: Hlavní plátno' })).toContainText(
      'Projektor (HDMI) · 1920 × 1080'
    )
    await expect(page.getByRole('switch', { name: /Zobrazit v okně.*: Hlavní plátno/ })).toBeChecked()
    await expect(page.getByRole('combobox', { name: 'Motiv výstupu: Hlavní plátno' })).toContainText(
      'Vysoký kontrast'
    )
  })

  test('switching an output off persists and shows it as off', async ({ page }) => {
    await page.goto('/')
    await openSettings(page)
    const enabled = page.getByRole('switch', { name: 'Zapnuto: Plátno' })
    await expect(enabled).toBeChecked()
    await enabled.click()
    await expect(page.getByTestId('output-state-main')).toContainText('Vypnuto')
    await expect(page.getByRole('button', { name: 'Test obrazu' })).toBeDisabled()
    await page.reload()
    await openSettings(page)
    await expect(page.getByRole('switch', { name: 'Zapnuto: Plátno' })).not.toBeChecked()
  })

  test('adding and removing outputs keeps at least one', async ({ page }) => {
    await page.goto('/')
    await openSettings(page)
    await expect(page.getByRole('button', { name: /Odebrat výstup/ })).toHaveCount(0)
    const cards = page.locator('[data-testid^="output-card-"]')
    await expect(cards).toHaveCount(1)
    await page.getByRole('button', { name: 'Přidat výstup' }).click()
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(1)).toContainText('Výstup 2')
    // Both outputs are listed on the display map as well.
    await expect(page.getByTestId('display-map')).toContainText('Výstup 2')
    await page.getByRole('button', { name: 'Odebrat výstup Výstup 2' }).click()
    await expect(cards).toHaveCount(1)
    await expect(page.getByTestId('display-map')).not.toContainText('Výstup 2')
    await expect(page.getByRole('button', { name: /Odebrat výstup/ })).toHaveCount(0)
  })

  test('"Test obrazu" shows the identify label in the previews for 4 s', async ({ page }) => {
    await page.goto('/')
    await openSettings(page)
    await page.getByRole('button', { name: 'Test obrazu' }).click()
    const label = 'Výstup „Plátno“'
    await expect(page.getByRole('img', { name: 'Náhled výstupu Plátno' })).toContainText(label)
    await expect(page.getByRole('button', { name: 'Ukončit test' })).toBeVisible()

    // The test keeps running when the operator goes to the Live screen.
    await page
      .getByRole('navigation', { name: 'Hlavní navigace' })
      .getByRole('button', { name: 'Živě', exact: true })
      .click()
    const livePreview = page.getByRole('img', { name: 'Živě', exact: true })
    await expect(livePreview).toContainText(label)
    // …and ends by itself.
    await expect(livePreview).not.toContainText(label, { timeout: 6000 })
  })
})

test.describe('Nastavení → Obecné', () => {
  test('light theme applies immediately and persists', async ({ page }) => {
    await page.goto('/')
    await openSettings(page, 'Obecné')
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)light(\s|$)/)
    await page.getByRole('radio', { name: 'Světlý' }).click()
    await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/)
    await page.getByRole('radio', { name: '3', exact: true }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/)
    await openSettings(page, 'Obecné')
    await expect(page.getByRole('radio', { name: '3', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('app-version')).toHaveText('Verze 0.1.0-web')
  })

  test('device name is saved on blur', async ({ page }) => {
    await page.goto('/')
    await openSettings(page, 'Obecné')
    const input = page.getByRole('textbox', { name: 'Název tohoto počítače' })
    await input.fill('Notebook u pultu')
    await input.blur()
    await page.reload()
    await openSettings(page, 'Obecné')
    await expect(page.getByRole('textbox', { name: 'Název tohoto počítače' })).toHaveValue('Notebook u pultu')
  })
})
