import { expect, test } from '@playwright/test'
import { launchApp } from './helpers'

test('app starts with the control window', async () => {
  const { app } = await launchApp()
  const win = await app.firstWindow()
  await expect(win).toHaveTitle('Promítač')
  await expect(win.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible()
  await app.close()
})
