import {
  app,
  type BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import type { BackupResult } from '@shared/api'
import { IPC } from '@shared/ipc'
import {
  type BackupCounts,
  BackupError,
  createBackupZip,
  latestPreRestoreBackup,
  restoreBackupZip
} from './storage/backup'
import { writeFileAtomic } from './storage/fsUtil'

export interface BackupIpcDeps {
  libraryDir: () => string
  settingsFile: () => string
  backupsDir: () => string
  getWindow: () => BrowserWindow | null
  /** Called after a successful restore (reset caches, restart watchers, nudge sync…). */
  onRestored: () => void
}

/** `promitac-zaloha-2026-10-27.zip` (local date). */
export function defaultBackupName(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `promitac-zaloha-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`
}

/** Counts from the manifest of a zip we just created. */
function countsOf(zip: Uint8Array): BackupCounts | undefined {
  try {
    const manifest = unzipSync(zip, { filter: (f) => f.name === 'manifest.json' })['manifest.json']
    if (!manifest) return undefined
    return (JSON.parse(strFromU8(manifest)) as { counts?: BackupCounts }).counts
  } catch {
    return undefined
  }
}

/**
 * Errors go back as codes the renderer translates (`invalid-zip`, `not-a-backup`,
 * `unsupported-version`, `unsafe-path`); anything else as its message.
 */
function failure(err: unknown): BackupResult {
  if (err instanceof BackupError) return { ok: false, error: err.code }
  console.error('[backup] failed', err)
  return { ok: false, error: err instanceof Error ? err.message : String(err) }
}

export function registerBackupIpc(deps: BackupIpcDeps): void {
  ipcMain.handle(IPC.backupExport, async (_e, opts?: { includeMedia?: boolean }): Promise<BackupResult> => {
    try {
      const win = deps.getWindow()
      const options: SaveDialogOptions = {
        defaultPath: join(app.getPath('documents'), defaultBackupName()),
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      }
      const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (choice.canceled || !choice.filePath) return { ok: false, canceled: true }
      const path = choice.filePath.toLowerCase().endsWith('.zip') ? choice.filePath : `${choice.filePath}.zip`
      const zip = await createBackupZip(deps.libraryDir(), deps.settingsFile(), {
        includeMedia: opts?.includeMedia === true
      })
      await writeFileAtomic(path, zip)
      return { ok: true, path, counts: countsOf(zip) }
    } catch (err) {
      return failure(err)
    }
  })

  ipcMain.handle(IPC.backupImport, async (): Promise<BackupResult> => {
    try {
      const win = deps.getWindow()
      const options: OpenDialogOptions = {
        defaultPath: app.getPath('documents'),
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
        properties: ['openFile']
      }
      const choice = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      const file = choice.filePaths[0]
      if (choice.canceled || !file) return { ok: false, canceled: true }
      const zip = new Uint8Array(await readFile(file))
      const counts = await restoreBackupZip(zip, deps.libraryDir(), deps.settingsFile(), deps.backupsDir())
      deps.onRestored()
      // `path` = where the state before the restore was saved, so the user can go back.
      const saved = await latestPreRestoreBackup(deps.backupsDir())
      return { ok: true, counts, ...(saved ? { path: saved } : {}) }
    } catch (err) {
      return failure(err)
    }
  })
}
