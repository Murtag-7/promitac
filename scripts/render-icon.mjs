// Renders build/icon.svg to build/icon.png (1024×1024) for electron-builder (icns/ico are derived).
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = readFileSync('build/icon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
await page.locator('svg').screenshot({ path: 'build/icon.png', omitBackground: true })
await browser.close()
console.log('build/icon.png written')
