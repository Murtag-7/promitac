import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { APP_SCHEME, BUNDLE_HOST } from '@shared/ipc'

export function rendererUrl(query = ''): string {
  const dev = process.env.ELECTRON_RENDERER_URL
  const q = query ? `?${query}` : ''
  return dev ? `${dev}/index.html${q}` : `${APP_SCHEME}://${BUNDLE_HOST}/index.html${q}`
}

export function preloadPath(): string {
  return join(import.meta.dirname, '../preload/index.cjs')
}

export function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    title: 'Promítač',
    backgroundColor: '#0d0e10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.once('ready-to-show', () => win.show())
  // External links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(rendererUrl().split('/index.html')[0] ?? '')) e.preventDefault()
  })
  void win.loadURL(rendererUrl())
  return win
}
