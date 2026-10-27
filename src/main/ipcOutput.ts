import { ipcMain, type BrowserWindow } from 'electron'
import type { OutputFrame } from '@core/live/frame'
import { IPC } from '@shared/ipc'
import type { OutputManager } from './outputWindows'

export function registerOutputIpc(
  outputs: OutputManager,
  getControlWindow: () => BrowserWindow | null
): void {
  // Fire-and-forget from the control window: the frame goes straight to every output window.
  ipcMain.on(IPC.outputSetFrame, (e, frame: OutputFrame) => {
    const control = getControlWindow()
    if (control && e.sender !== control.webContents) return
    outputs.setFrame(frame)
  })
  ipcMain.handle(IPC.outputGetLastFrame, () => outputs.getLastFrame())
  ipcMain.handle(IPC.outputStatus, async () => outputs.refresh())
  ipcMain.handle(IPC.outputRefresh, async () => outputs.refresh())
  ipcMain.handle(IPC.displaysList, () => outputs.displays())
}
