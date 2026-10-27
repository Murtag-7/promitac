import { app, type BrowserWindow } from 'electron'
import { nowIso } from '@core/util/id'
import { createControlWindow } from './controlWindow'
import { createContext } from './context'
import { registerCoreIpc } from './ipc'
import { initUserDataPath, paths } from './paths'
import { handleAppProtocol, registerSchemes } from './protocol'
import { seedIfFirstRun } from './storage/seed'

app.setName('Promítač')
initUserDataPath()
registerSchemes()

let controlWindow: BrowserWindow | null = null

process.on('unhandledRejection', (reason) => console.error('[main] unhandled rejection', reason))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (controlWindow) {
      if (controlWindow.isMinimized()) controlWindow.restore()
      controlWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    handleAppProtocol()
    const ctx = createContext()
    try {
      await seedIfFirstRun(paths.library(), ctx.songs, ctx.plans, nowIso())
    } catch (err) {
      console.error('[main] seeding failed', err)
    }
    registerCoreIpc(ctx, () => undefined)
    controlWindow = createControlWindow()
    controlWindow.on('closed', () => {
      controlWindow = null
      app.quit()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
