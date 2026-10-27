import { app, ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { createControlWindow } from './controlWindow'
import { initUserDataPath } from './paths'
import { handleAppProtocol, registerSchemes } from './protocol'

app.setName('Promítač')
initUserDataPath()
registerSchemes()

let controlWindow: BrowserWindow | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (controlWindow) {
      if (controlWindow.isMinimized()) controlWindow.restore()
      controlWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    handleAppProtocol()
    ipcMain.handle(IPC.appVersion, () => app.getVersion())
    controlWindow = createControlWindow()
    controlWindow.on('closed', () => {
      controlWindow = null
      app.quit()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
