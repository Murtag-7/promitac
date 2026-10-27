import { copyFile, readFile, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { MAX_SYNC_MEDIA_BYTES, type MediaItem, mediaKindFromName, mimeFromName } from '@core/media/model'
import { newId, nowIso } from '@core/util/id'
import { ensureDir, readJson, writeFileAtomic, writeJsonAtomic } from './fsUtil'
import type { TombstoneStore } from './tombstones'

export interface MediaRepoOptions {
  /** Files larger than this are always "only on this computer" (default: Supabase free-tier limit). */
  maxSyncBytes?: number
}

/** File name inside the media folder: `<id><ext>` – never contains a path separator. */
const SAFE_FILE_NAME = /^[\w-]+(\.[a-z0-9]+)?$/i

function isMediaItem(value: unknown): value is MediaItem {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    (v.kind === 'image' || v.kind === 'video') &&
    typeof v.fileName === 'string' &&
    SAFE_FILE_NAME.test(v.fileName) &&
    typeof v.mime === 'string' &&
    typeof v.size === 'number' &&
    typeof v.localOnly === 'boolean' &&
    typeof v.updatedAt === 'string'
  )
}

/** "Fotky/Velikonoce 2026.JPG" → "Velikonoce 2026" (the extension is shown as the kind instead). */
function displayName(fileName: string): string {
  const base = basename(fileName.replace(/\\/g, '/'))
  const ext = extname(base)
  return (ext ? base.slice(0, -ext.length) : base).trim() || base
}

/**
 * Media library: files copied into `dir` as `<id><ext>`, metadata in one JSON index (`media.json`).
 * The original file name is kept in `name`. All index writes are serialised and atomic.
 */
export class MediaRepo {
  private items: MediaItem[] | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private readonly maxSyncBytes: number

  constructor(
    private readonly dir: string,
    private readonly indexFile: string,
    private readonly tombstones: TombstoneStore,
    options: MediaRepoOptions = {}
  ) {
    this.maxSyncBytes = options.maxSyncBytes ?? MAX_SYNC_MEDIA_BYTES
  }

  /** Items whose file exists on disk (entries with a missing file stay in the index until removed). */
  async list(): Promise<MediaItem[]> {
    const items = await this.serial(() => this.load())
    const present = await Promise.all(items.map((item) => this.fileExists(item.fileName)))
    return items.filter((_, i) => present[i]).map((item) => ({ ...item }))
  }

  /** Copy local files into the library. Unsupported and unreadable files are skipped. */
  async importPaths(paths: string[]): Promise<MediaItem[]> {
    return this.serial(async () => {
      await ensureDir(this.dir)
      const added: MediaItem[] = []
      for (const source of paths) {
        const kind = mediaKindFromName(source)
        if (!kind) continue
        let size: number
        try {
          const info = await stat(source)
          if (!info.isFile()) continue
          size = info.size
        } catch {
          continue
        }
        const item = this.newItem(source, kind, size)
        const target = join(this.dir, item.fileName)
        try {
          await copyFile(source, target)
        } catch (err) {
          console.error('[media] import failed', source, err)
          await rm(target, { force: true })
          continue
        }
        added.push(item)
      }
      return this.append(added)
    })
  }

  /** Store files received as bytes (drag & drop without a path). Unsupported files are skipped. */
  async importBuffers(files: Array<{ name: string; data: ArrayBuffer | Uint8Array }>): Promise<MediaItem[]> {
    return this.serial(async () => {
      await ensureDir(this.dir)
      const added: MediaItem[] = []
      for (const file of files) {
        const kind = mediaKindFromName(file.name)
        if (!kind) continue
        const bytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data)
        const item = this.newItem(file.name, kind, bytes.byteLength)
        await writeFileAtomic(join(this.dir, item.fileName), bytes)
        added.push(item)
      }
      return this.append(added)
    })
  }

  /**
   * Change the editable fields (name, localOnly, updatedAt) of an existing item. The stored file
   * mapping (fileName, kind, mime, size) is never taken from the caller. Unknown ids are ignored.
   */
  async update(item: MediaItem): Promise<void> {
    await this.serial(async () => {
      const items = await this.load()
      const index = items.findIndex((m) => m.id === item.id)
      const current = items[index]
      if (!current) return
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : current.name
      const next: MediaItem = {
        ...current,
        name,
        localOnly: current.size > this.maxSyncBytes ? true : Boolean(item.localOnly),
        updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : nowIso()
      }
      if (item.width !== undefined) next.width = item.width
      if (item.height !== undefined) next.height = item.height
      const updated = [...items]
      updated[index] = next
      await this.persist(updated)
    })
  }

  /** Delete the file and the index entry, and record a tombstone so the deletion syncs. */
  async remove(id: string, deletedAt = nowIso()): Promise<void> {
    await this.serial(async () => {
      const items = await this.load()
      const item = items.find((m) => m.id === id)
      if (item) {
        await rm(join(this.dir, item.fileName), { force: true })
        await this.persist(items.filter((m) => m.id !== id))
      }
      await this.tombstones.add('media', id, deletedAt)
    })
  }

  /** Forget the cached index (after a backup restore rewrote it). */
  invalidate(): void {
    this.items = null
  }

  // ---- Synchronisation helpers ----

  /** Every index entry, also those whose file has not been downloaded yet. */
  async all(): Promise<Array<MediaItem & { storagePath?: string }>> {
    return (await this.serial(() => this.load())).map((item) => ({ ...item }))
  }

  /** Insert or replace an entry coming from another computer (the file may follow later). */
  async put(item: MediaItem & { storagePath?: string }): Promise<void> {
    if (!isMediaItem(item)) return
    await this.serial(async () => {
      const items = await this.load()
      await this.persist([...items.filter((m) => m.id !== item.id), { ...item }])
      await this.tombstones.clear('media', item.id)
    })
  }

  async hasFile(item: Pick<MediaItem, 'fileName'>): Promise<boolean> {
    return SAFE_FILE_NAME.test(item.fileName) && this.fileExists(item.fileName)
  }

  async readFile(item: Pick<MediaItem, 'fileName'>): Promise<Uint8Array> {
    if (!SAFE_FILE_NAME.test(item.fileName)) throw new Error('Invalid media file name')
    return new Uint8Array(await readFile(join(this.dir, item.fileName)))
  }

  async writeFile(item: Pick<MediaItem, 'fileName'>, data: Uint8Array): Promise<void> {
    if (!SAFE_FILE_NAME.test(item.fileName)) throw new Error('Invalid media file name')
    await ensureDir(this.dir)
    await writeFileAtomic(join(this.dir, item.fileName), data)
  }

  private newItem(sourceName: string, kind: MediaItem['kind'], size: number): MediaItem {
    const id = newId()
    const ext = extname(sourceName).toLowerCase()
    return {
      id,
      name: displayName(sourceName),
      kind,
      fileName: `${id}${ext}`,
      mime: mimeFromName(sourceName),
      size,
      localOnly: size > this.maxSyncBytes,
      updatedAt: nowIso()
    }
  }

  private async append(added: MediaItem[]): Promise<MediaItem[]> {
    if (added.length > 0) await this.persist([...(await this.load()), ...added])
    return added.map((item) => ({ ...item }))
  }

  private async load(): Promise<MediaItem[]> {
    if (!this.items) {
      const raw = await readJson<unknown>(this.indexFile, [])
      this.items = Array.isArray(raw) ? raw.filter(isMediaItem) : []
    }
    return this.items
  }

  private async persist(items: MediaItem[]): Promise<void> {
    await writeJsonAtomic(this.indexFile, items)
    this.items = items
  }

  private async fileExists(fileName: string): Promise<boolean> {
    try {
      return (await stat(join(this.dir, fileName))).isFile()
    } catch {
      return false
    }
  }

  /** Run index operations one after another so concurrent IPC calls never lose an update. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn)
    this.queue = run.catch(() => undefined)
    return run
  }
}
