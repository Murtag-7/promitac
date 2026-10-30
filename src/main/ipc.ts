import { app, ipcMain, shell } from 'electron'
import type { SongFile } from '@core/chordpro/model'
import type { ServicePlan } from '@core/plan/model'
import type { AppSettings } from '@core/settings/model'
import type { Theme } from '@core/theme/model'
import { IPC } from '@shared/ipc'
import type { AppContext } from './context'
import { dataDir } from './paths'

type Handler = (...args: never[]) => unknown

/** Register a handler; errors are logged and re-thrown so the renderer gets a rejected promise. */
function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_e, ...args: unknown[]) => {
    try {
      return await (fn as (...a: unknown[]) => unknown)(...args)
    } catch (err) {
      console.error(`[ipc] ${channel} failed:`, err)
      throw err
    }
  })
}

export interface CoreIpcHooks {
  onLibraryChanged: () => void
  onSettingsChanged: (patch: Partial<AppSettings>) => void
}

export function registerCoreIpc(ctx: AppContext, hooks: CoreIpcHooks): void {
  const onLibraryChanged = hooks.onLibraryChanged
  handle(IPC.appVersion, () => app.getVersion())
  handle(IPC.appOpenDataFolder, async () => {
    await shell.openPath(dataDir())
  })
  handle(IPC.appOpenExternal, async (url: string) => {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
  })

  handle(IPC.songsList, () => ctx.songs.list())
  handle(IPC.songsSave, async (file: SongFile) => {
    await ctx.songs.save(file)
    onLibraryChanged()
  })
  handle(IPC.songsRemove, async (id: string) => {
    await ctx.songs.remove(id)
    onLibraryChanged()
  })

  handle(IPC.plansList, () => ctx.plans.list())
  handle(IPC.plansSave, async (plan: ServicePlan) => {
    await ctx.plans.save(plan)
    onLibraryChanged()
  })
  handle(IPC.plansRemove, async (id: string) => {
    await ctx.plans.remove(id)
    onLibraryChanged()
  })

  handle(IPC.themesList, () => ctx.themes.list())
  handle(IPC.themesSave, async (theme: Theme) => {
    await ctx.themes.save(theme)
    onLibraryChanged()
  })
  handle(IPC.themesRemove, async (id: string) => {
    await ctx.themes.remove(id)
    onLibraryChanged()
  })

  handle(IPC.settingsGet, () => ctx.settings.get())
  handle(IPC.settingsUpdate, async (patch: Partial<AppSettings>) => {
    const next = await ctx.settings.update(patch)
    hooks.onSettingsChanged(patch)
    return next
  })
}
