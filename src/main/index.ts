import { app, type BrowserWindow } from 'electron'
import { nowIso } from '@core/util/id'
import type { AppSettings } from '@core/settings/model'
import { IPC } from '@shared/ipc'
import { createControlWindow } from './controlWindow'
import { createContext } from './context'
import { registerCoreIpc } from './ipc'
import { registerOutputIpc } from './ipcOutput'
import { OutputManager } from './outputWindows'
import { initUserDataPath, paths } from './paths'
import { handleAppProtocol, registerSchemes } from './protocol'
import { seedIfFirstRun } from './storage/seed'

app.setName('Promítač')
initUserDataPath()
registerSchemes()

let controlWindow: BrowserWindow | null = null
let outputs: OutputManager | null = null

process.on('unhandledRejection', (reason) => console.error('[main] unhandled rejection', reason))

function sendToControl(channel: string, payload: unknown): void {
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send(channel, payload)
}

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

    outputs = new OutputManager(
      () => ctx.settings.get(),
      () => controlWindow,
      (status) => sendToControl(IPC.outputStatusChanged, status),
      (displays) => sendToControl(IPC.displaysChanged, displays)
    )
    registerCoreIpc(ctx, {
      onLibraryChanged: () => undefined,
      onSettingsChanged: (patch: Partial<AppSettings>) => {
        if (patch.outputs) void outputs?.refresh()
      }
    })
    registerOutputIpc(outputs, () => controlWindow)

    controlWindow = createControlWindow()
    controlWindow.on('closed', () => {
      controlWindow = null
      outputs?.stop()
      app.quit()
    })
    controlWindow.webContents.once('did-finish-load', () => outputs?.start())
  })

  app.on('before-quit', () => outputs?.stop())
  app.on('window-all-closed', () => app.quit())
}
