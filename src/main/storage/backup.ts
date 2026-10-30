import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { ensureDir, readJson, writeFileAtomic, writeJsonAtomic } from './fsUtil'

/**
 * ZIP backup of the whole library.
 *
 * Layout inside the zip mirrors the data folder, so a backup is readable by hand:
 *   manifest.json, settings.json (without secrets), tombstones.json, media.json,
 *   songs/*.chordpro, plans/*.json, themes/*.json, media/* (only when media are included).
 */

export const BACKUP_APP = 'promitac'
export const BACKUP_VERSION = 1
export const PRE_RESTORE_PREFIX = 'pred-obnovou-'

export interface BackupCounts {
  songs: number
  plans: number
  themes: number
  media: number
}

export interface BackupManifest {
  app: typeof BACKUP_APP
  version: number
  createdAt: string
  includeMedia: boolean
  counts: BackupCounts
}

export type BackupErrorCode = 'invalid-zip' | 'not-a-backup' | 'unsupported-version' | 'unsafe-path'

/** A problem with the backup file itself (shown to the user via an error code). */
export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'BackupError'
  }
}

type Folder = 'songs' | 'plans' | 'themes' | 'media'
const LIBRARY_FOLDERS: Folder[] = ['songs', 'plans', 'themes']
const ROOT_FILES = ['tombstones.json', 'media.json'] as const
type RootFile = (typeof ROOT_FILES)[number]

/** Never leave this computer in a backup. */
const SECRET_KEYS = ['supabase', 'aiApiKey'] as const
/** Settings that describe this computer and are kept when restoring (secrets + its name). */
const LOCAL_KEYS = [...SECRET_KEYS, 'deviceName'] as const

const SONG_EXT = /\.(chordpro|cho|crd|chopro)$/i

/** Which files of a library folder belong into a backup. */
function belongsTo(folder: Folder, name: string): boolean {
  if (name.startsWith('.')) return false
  if (folder === 'songs') return SONG_EXT.test(name)
  if (folder === 'media') return true
  return name.endsWith('.json')
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

/** Regular files directly inside a library folder (missing folder → none). */
async function folderFiles(dir: string, folder: Folder): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && belongsTo(folder, e.name))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

async function readOptional(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path))
  } catch {
    return null
  }
}

/** Number of media items in media.json (array or { items: [] }), else the number of files. */
function mediaCount(mediaJson: Uint8Array | null, fileCount: number): number {
  if (!mediaJson) return fileCount
  try {
    const parsed: unknown = JSON.parse(strFromU8(mediaJson))
    if (Array.isArray(parsed)) return parsed.length
    if (isRecord(parsed) && Array.isArray(parsed.items)) return parsed.items.length
  } catch {
    // fall through
  }
  return fileCount
}

/** settings.json without secrets; null when there is no readable settings file. */
async function exportableSettings(settingsFile: string): Promise<Record<string, unknown> | null> {
  const raw = await readOptional(settingsFile)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(strFromU8(raw))
    if (!isRecord(parsed)) return null
    const copy = { ...parsed }
    for (const key of SECRET_KEYS) delete copy[key]
    return copy
  } catch {
    return null
  }
}

export async function createBackupZip(
  libraryDir: string,
  settingsFile: string,
  opts: { includeMedia: boolean }
): Promise<Uint8Array> {
  const entries: Zippable = {}
  const counts: BackupCounts = { songs: 0, plans: 0, themes: 0, media: 0 }

  for (const folder of LIBRARY_FOLDERS) {
    const names = await folderFiles(join(libraryDir, folder), folder)
    for (const name of names) {
      const data = await readOptional(join(libraryDir, folder, name))
      if (!data) continue
      entries[`${folder}/${name}`] = data
      counts[folder]++
    }
  }

  for (const file of ROOT_FILES) {
    const data = await readOptional(join(libraryDir, file))
    if (data) entries[file] = data
  }

  const mediaNames = await folderFiles(join(libraryDir, 'media'), 'media')
  if (opts.includeMedia) {
    for (const name of mediaNames) {
      const data = await readOptional(join(libraryDir, 'media', name))
      // Images and videos are already compressed – store them as they are.
      if (data) entries[`media/${name}`] = [data, { level: 0 }]
    }
  }
  counts.media = mediaCount(await readOptional(join(libraryDir, 'media.json')), mediaNames.length)

  const settings = await exportableSettings(settingsFile)
  if (settings) entries['settings.json'] = strToU8(JSON.stringify(settings, null, 2) + '\n')

  const manifest: BackupManifest = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    includeMedia: opts.includeMedia,
    counts
  }
  entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2) + '\n')

  return zipSync(entries, { level: 6 })
}

/** Absolute paths, drive letters, `..` segments, NUL and `:` (Windows streams) are never accepted. */
function isUnsafeEntry(name: string): boolean {
  if (!name || name.includes('\0')) return true
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return true
  return name.split('/').some((segment) => segment === '..' || segment.includes(':'))
}

interface ParsedBackup {
  manifest: BackupManifest
  /** Files per folder that will replace the current ones. */
  folders: Record<Folder, Map<string, Uint8Array>>
  rootFiles: Map<RootFile, Uint8Array>
  settings: Record<string, unknown> | null
  /** Media are restored (and replaced) only when the backup contains them. */
  includeMedia: boolean
}

/** Validate the whole archive before anything on disk is touched. */
function parseBackup(zip: Uint8Array): ParsedBackup {
  let raw: Record<string, Uint8Array>
  try {
    raw = unzipSync(zip)
  } catch {
    throw new BackupError('invalid-zip')
  }

  const files = new Map<string, Uint8Array>()
  for (const [rawName, data] of Object.entries(raw)) {
    const name = rawName.replace(/\\/g, '/')
    if (isUnsafeEntry(name)) throw new BackupError('unsafe-path', rawName)
    if (!name.endsWith('/')) files.set(name, data)
  }

  const manifestBytes = files.get('manifest.json')
  if (!manifestBytes) throw new BackupError('not-a-backup')
  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(manifestBytes))
  } catch {
    throw new BackupError('not-a-backup')
  }
  if (!isRecord(parsed) || parsed.app !== BACKUP_APP || typeof parsed.version !== 'number') {
    throw new BackupError('not-a-backup')
  }
  if (!Number.isInteger(parsed.version) || parsed.version < 1 || parsed.version > BACKUP_VERSION) {
    throw new BackupError('unsupported-version', String(parsed.version))
  }

  const folders: Record<Folder, Map<string, Uint8Array>> = {
    songs: new Map(),
    plans: new Map(),
    themes: new Map(),
    media: new Map()
  }
  const rootFiles = new Map<RootFile, Uint8Array>()
  let settings: Record<string, unknown> | null = null

  for (const [name, data] of files) {
    const parts = name.split('/')
    if (parts.length === 1) {
      const file = parts[0] as RootFile
      if ((ROOT_FILES as readonly string[]).includes(file)) rootFiles.set(file, data)
      else if (name === 'settings.json') {
        try {
          const value: unknown = JSON.parse(strFromU8(data))
          if (isRecord(value)) settings = value
        } catch {
          // A broken settings file in the backup is skipped; the library is still restored.
        }
      }
      continue
    }
    const [folder, fileName] = parts as [string, string]
    // Only plain files directly inside a known folder; anything else (e.g. __MACOSX/) is ignored.
    if (parts.length !== 2 || !fileName) continue
    if (folder === 'songs' || folder === 'plans' || folder === 'themes' || folder === 'media') {
      if (belongsTo(folder, fileName)) folders[folder].set(fileName, data)
    }
  }

  const includeMedia = parsed.includeMedia === true || folders.media.size > 0
  const manifest: BackupManifest = {
    app: BACKUP_APP,
    version: parsed.version,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    includeMedia,
    counts: {
      songs: folders.songs.size,
      plans: folders.plans.size,
      themes: folders.themes.size,
      media: includeMedia ? folders.media.size : 0
    }
  }
  return { manifest, folders, rootFiles, settings, includeMedia }
}

/** Defence in depth: the resolved target must stay inside the library folder. */
function insideLibrary(libraryDir: string, target: string): string {
  const root = resolve(libraryDir)
  const full = resolve(target)
  const rel = relative(root, full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new BackupError('unsafe-path', target)
  return full
}

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function uniquePreRestorePath(backupsDir: string): Promise<string> {
  const base = `${PRE_RESTORE_PREFIX}${stamp()}`
  for (let i = 1; ; i++) {
    const candidate = join(backupsDir, i === 1 ? `${base}.zip` : `${base}-${i}.zip`)
    if (!(await exists(candidate))) return candidate
  }
}

/** The automatic backup written by the most recent restore (null if none). */
export async function latestPreRestoreBackup(backupsDir: string): Promise<string | null> {
  try {
    const names = (await readdir(backupsDir)).filter(
      (n) => n.startsWith(PRE_RESTORE_PREFIX) && n.endsWith('.zip')
    )
    if (names.length === 0) return null
    const withTimes = await Promise.all(
      names.map(async (n) => ({ n, t: (await stat(join(backupsDir, n))).mtimeMs }))
    )
    withTimes.sort((a, b) => b.t - a.t || b.n.localeCompare(a.n))
    return join(backupsDir, withTimes[0]!.n)
  } catch {
    return null
  }
}

/**
 * Restore a backup made by createBackupZip.
 * 1. The archive is validated completely (manifest, every path) – on failure nothing is touched.
 * 2. The current state is saved to `backupsDir/pred-obnovou-<time>.zip`.
 * 3. New files are staged inside the library folder, then moved into place, so a failed write
 *    (e.g. full disk) leaves the library as it was.
 * Secrets and the device name of this computer are kept.
 */
export async function restoreBackupZip(
  zip: Uint8Array,
  libraryDir: string,
  settingsFile: string,
  backupsDir: string
): Promise<BackupCounts> {
  const backup = parseBackup(zip)
  const replaced: Folder[] = backup.includeMedia ? [...LIBRARY_FOLDERS, 'media'] : [...LIBRARY_FOLDERS]
  const rootFiles = [...backup.rootFiles.keys()].filter((f) => f !== 'media.json' || backup.includeMedia)

  // Safety copy of what is there now (with media when the restore replaces them).
  await ensureDir(backupsDir)
  const current = await createBackupZip(libraryDir, settingsFile, { includeMedia: backup.includeMedia })
  await writeFileAtomic(await uniquePreRestorePath(backupsDir), current)

  await ensureDir(libraryDir)
  const staging = insideLibrary(libraryDir, join(libraryDir, `.restore-${randomUUID()}`))
  try {
    for (const folder of replaced) {
      await mkdir(join(staging, folder), { recursive: true })
      for (const [name, data] of backup.folders[folder]) {
        await writeFile(insideLibrary(staging, join(staging, folder, name)), data)
      }
    }
    for (const file of rootFiles) {
      const data = backup.rootFiles.get(file)
      if (data) await writeFile(join(staging, file), data)
    }

    // Everything is on disk – swap folder contents (keeps the folders themselves, e.g. for watchers).
    for (const folder of replaced) {
      const target = insideLibrary(libraryDir, join(libraryDir, folder))
      await ensureDir(target)
      for (const e of await readdir(target, { withFileTypes: true })) {
        if (e.isFile() && !e.name.startsWith('.')) await rm(join(target, e.name), { force: true })
      }
      for (const name of backup.folders[folder].keys()) {
        await rename(join(staging, folder, name), insideLibrary(libraryDir, join(target, name)))
      }
    }
    for (const file of rootFiles) {
      await rename(join(staging, file), insideLibrary(libraryDir, join(libraryDir, file)))
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }

  if (backup.settings) {
    const currentSettings = await readJson<Record<string, unknown> | null>(settingsFile, null)
    const next: Record<string, unknown> = { ...backup.settings }
    for (const key of LOCAL_KEYS) {
      delete next[key]
      if (isRecord(currentSettings) && currentSettings[key] !== undefined) next[key] = currentSettings[key]
    }
    await ensureDir(dirname(settingsFile))
    await writeJsonAtomic(settingsFile, next)
  }

  return backup.manifest.counts
}
