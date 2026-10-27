import { app, type BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '@core/settings/model'
import { nowIso } from '@core/util/id'
import { IPC } from '@shared/ipc'
import { createControlWindow } from './controlWindow'
import { createContext } from './context'
import { registerCoreIpc } from './ipc'
import { registerBackupIpc } from './ipcBackup'
import { registerMediaBibleIpc } from './ipcMediaBible'
import { registerOutputIpc } from './ipcOutput'
import { registerSyncIpc } from './ipcSync'
import { OutputManager } from './outputWindows'
import { initUserDataPath, paths } from './paths'
import { handleAppProtocol, registerSchemes } from './protocol'
import { seedIfFirstRun } from './storage/seed'
import { SyncService, type MediaPort } from './sync/syncService'

app.setName('Promítač')
initUserDataPath()
registerSchemes()

let controlWindow: BrowserWindow | null = null
let outputs: OutputManager | null = null
let sync: SyncService | null = null
let songsWatcher: FSWatcher | null = null

process.on('unhandledRejection', (reason) => console.error('[main] unhandled rejection', reason))

function sendToControl(channel: string, payload: unknown): void {
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send(channel, payload)
}

/** Songs dropped into the library folder by hand show up without restarting the app. */
function watchSongsFolder(ctx: ReturnType<typeof createContext>): void {
  songsWatcher?.close()
  let timer: NodeJS.Timeout | null = null
  try {
    songsWatcher = watch(paths.songs(), (_event, file) => {
      if (!file) return
      const full = join(paths.songs(), file.toString())
      const ours = ctx.songs.recentWrites.get(full)
      if (ours && Date.now() - ours < 3000) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        sendToControl(IPC.songsExternalChange, null)
        sync?.notifyLocalChange()
      }, 800)
    })
  } catch (err) {
    console.warn('[main] songs folder watch unavailable', err)
  }
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

    const media: MediaPort = {
      list: () => ctx.media.all(),
      put: (item) => ctx.media.put(item),
      remove: (id, deletedAt) => ctx.media.remove(id, deletedAt),
      hasFile: (item) => ctx.media.hasFile(item),
      readFile: (item) => ctx.media.readFile(item),
      writeFile: (item, data) => ctx.media.writeFile(item, data)
    }
    const builtInUrl = process.env.PROMITAC_SUPABASE_URL ?? ''
    const builtInKey = process.env.PROMITAC_SUPABASE_ANON_KEY ?? ''
    sync = new SyncService({
      songs: ctx.songs,
      plans: ctx.plans,
      themes: ctx.themes,
      media,
      tombstones: ctx.tombstones,
      settings: ctx.settings,
      syncDir: paths.sync(),
      builtIn: builtInUrl && builtInKey ? { url: builtInUrl, anonKey: builtInKey } : null,
      onStatus: (status) => sendToControl(IPC.syncStatusChanged, status)
    })

    registerCoreIpc(ctx, {
      onLibraryChanged: () => sync?.notifyLocalChange(),
      onSettingsChanged: (patch: Partial<AppSettings>) => {
        if (patch.outputs) void outputs?.refresh()
      }
    })
    registerOutputIpc(outputs, () => controlWindow)
    registerMediaBibleIpc({
      media: ctx.media,
      bibles: ctx.bibles,
      onMediaChanged: () => sync?.notifyLocalChange()
    })
    registerBackupIpc({
      libraryDir: paths.library,
      settingsFile: paths.settings,
      backupsDir: paths.backups,
      getWindow: () => controlWindow,
      onRestored: () => {
        // The restore rewrote files on disk – drop cached copies, then let outputs and sync catch up.
        ctx.settings.invalidate()
        ctx.tombstones.invalidate()
        ctx.media.invalidate()
        void outputs?.refresh()
        watchSongsFolder(ctx)
        sync?.notifyLocalChange()
      }
    })
    registerSyncIpc(sync)

    controlWindow = createControlWindow()
    controlWindow.on('closed', () => {
      controlWindow = null
      outputs?.stop()
      app.quit()
    })
    controlWindow.webContents.once('did-finish-load', () => {
      outputs?.start()
      // Sync starts after the UI is up and never blocks it.
      setTimeout(() => void sync?.start(), 1500)
    })
    watchSongsFolder(ctx)
  })

  app.on('before-quit', () => {
    outputs?.stop()
    sync?.stop()
    songsWatcher?.close()
  })
  app.on('window-all-closed', () => app.quit())
}
