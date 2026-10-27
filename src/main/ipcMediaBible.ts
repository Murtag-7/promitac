import { ipcMain } from 'electron'
import { BibleFormatError } from '@core/bible/formats'
import type { MediaItem } from '@core/media/model'
import { IPC } from '@shared/ipc'
import type { BibleRepo } from './storage/bibleRepo'
import type { MediaRepo } from './storage/mediaRepo'

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

/**
 * Electron passes only `message` of a thrown error to the renderer, so the BibleFormatError code
 * travels inside it as `bible-format/<code>` (parsed by features/bible/importErrors.ts).
 */
function withBibleErrorCode(err: unknown): unknown {
  if (err instanceof BibleFormatError) return new Error(`bible-format/${err.code}: ${err.message}`)
  return err
}

export interface MediaBibleDeps {
  media: MediaRepo
  bibles: BibleRepo
  /** Called after the media library changed (e.g. to schedule a sync). */
  onMediaChanged?: () => void
}

export function registerMediaBibleIpc(deps: MediaBibleDeps): void {
  const { media, bibles } = deps
  const changed = (): void => deps.onMediaChanged?.()

  handle(IPC.mediaList, () => media.list())
  handle(IPC.mediaImportPaths, async (paths: string[]) => {
    const added = await media.importPaths(
      Array.isArray(paths) ? paths.filter((p) => typeof p === 'string') : []
    )
    if (added.length > 0) changed()
    return added
  })
  handle(IPC.mediaImportBuffers, async (files: Array<{ name: string; data: ArrayBuffer | Uint8Array }>) => {
    const valid = Array.isArray(files)
      ? files.filter(
          (f) =>
            typeof f?.name === 'string' && (f.data instanceof ArrayBuffer || f.data instanceof Uint8Array)
        )
      : []
    const added = await media.importBuffers(valid)
    if (added.length > 0) changed()
    return added
  })
  handle(IPC.mediaUpdate, async (item: MediaItem) => {
    await media.update(item)
    changed()
  })
  handle(IPC.mediaRemove, async (id: string) => {
    await media.remove(id)
    changed()
  })

  handle(IPC.bibleList, () => bibles.list())
  handle(IPC.bibleLoad, (id: string) => bibles.load(id))
  handle(IPC.bibleImport, async (fileName: string, xml: string) => {
    try {
      return await bibles.import(String(fileName ?? ''), String(xml ?? ''))
    } catch (err) {
      throw withBibleErrorCode(err)
    }
  })
  handle(IPC.bibleRemove, (id: string) => bibles.remove(id))
}
