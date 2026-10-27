import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('button', { name: 'Písně' }).click()
})

test('search ignores diacritics', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Hledat' }).fill('zehnej')
  const list = page.getByRole('list', { name: /píse/ })
  await expect(list.getByRole('button', { name: /Žehnej, duše má/ })).toBeVisible()
  await expect(list.getByRole('button')).toHaveCount(1)
})

test('editing ChordPro updates the slide preview and survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: /Ty jsi skála má/ }).click()
  const editor = page.getByTestId('chordpro-editor').locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\n{start_of_bridge: B}\nNový most v písni\n{end_of_bridge}\n')
  await expect(page.getByTestId('song-slides')).toContainText('Nový most v písni')
  await expect(page.getByText('Uloženo')).toBeVisible({ timeout: 5000 })
  await page.reload()
  await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('button', { name: 'Písně' }).click()
  await page.getByRole('button', { name: /Ty jsi skála má/ }).click()
  await expect(page.getByTestId('song-slides')).toContainText('Nový most v písni')
})

test('arrangement chips add and remove sections', async ({ page }) => {
  await page.getByRole('button', { name: /Ty jsi skála má/ }).click()
  const arrangement = page.getByTestId('arrangement')
  await expect(arrangement.locator('li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Refrén', exact: true }).click()
  await expect(arrangement.locator('li')).toHaveCount(3)
  await expect(page.getByTestId('song-slides').locator('[data-slide-index]')).toHaveCount(3)
  await arrangement.getByRole('button', { name: /Smazat Sloka 1/ }).click()
  await expect(arrangement.locator('li')).toHaveCount(2)
})

test('chords are kept in the file but never on the slides', async ({ page }) => {
  await page.getByRole('button', { name: /Ukázková píseň/ }).click()
  await expect(page.getByTestId('chordpro-editor')).toContainText('[G]Ráno')
  await expect(page.getByTestId('song-slides')).toContainText('Ráno když se probouzím')
  await expect(page.getByTestId('song-slides')).not.toContainText('[G]')
})

test('a new song can be created and projected', async ({ page }) => {
  await page.getByRole('button', { name: 'Nová píseň' }).click()
  await page.getByLabel('Název', { exact: true }).fill('Moje nová píseň')
  const editor = page.getByTestId('chordpro-editor').locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\n[C]Ahoj světe, dnes je den\n')
  await page.getByRole('button', { name: 'Promítnout hned' }).click()
  await expect(page.getByTestId('live-pill')).toContainText('Moje nová píseň')
})
