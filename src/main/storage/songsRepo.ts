import { readdir, readFile, rename, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import type { SongFile } from '@core/chordpro/model'
import { readDirective, readTitle, setDirective } from '@core/chordpro/directives'
import { newId, nowIso } from '@core/util/id'
import { safeFileName, slugify } from '@core/util/slug'
import { decodeText } from '@shared/decodeText'
import { ensureDir, writeFileAtomic } from './fsUtil'
import type { TombstoneStore } from './tombstones'

const SONG_EXT = /\.(chordpro|cho|crd|chopro)$/i
/** File times on some file systems are coarse (FAT: 2 s); smaller differences are not an edit. */
const EDITED_OUTSIDE_SLACK_MS = 3000

/**
 * The song library is a plain folder of `.chordpro` files – readable, portable, easy to back up.
 * Identity (`{x_id}`) and last edit time (`{x_updated}`) live inside each file.
 */
export class SongsRepo {
  /** id → file name, refreshed by list(). */
  private files = new Map<string, string>()
  /** Paths we wrote recently – used to ignore our own writes in the folder watcher. */
  readonly recentWrites = new Map<string, number>()
  /**
   * list/save/remove run one at a time: a save that ran while a scan was rebuilding the id → file
   * map would not find its own file and write a duplicate next to it.
   */
  private queue: Promise<unknown> = Promise.resolve()

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  constructor(
    private readonly dir: string,
    private readonly trashDir: string,
    private readonly tombstones: TombstoneStore
  ) {}

  get folder(): string {
    return this.dir
  }

  list(): Promise<SongFile[]> {
    return this.serial(() => this.scan())
  }

  save(file: SongFile): Promise<void> {
    return this.serial(() => this.saveFile(file))
  }

  remove(id: string, deletedAt = nowIso()): Promise<void> {
    return this.serial(() => this.removeFile(id, deletedAt))
  }

  private async scan(): Promise<SongFile[]> {
    await ensureDir(this.dir)
    const names = (await readdir(this.dir)).filter((n) => SONG_EXT.test(n) && !n.startsWith('.')).sort()
    const out: SongFile[] = []
    const seen = new Set<string>()
    this.files.clear()
    for (const name of names) {
      const path = join(this.dir, name)
      let content: string
      let recoded = false
      try {
        const bytes = await readFile(path)
        content = decodeText(bytes)
        // A hand-dropped file in Windows-1250 is decoded correctly and stored back as UTF-8.
        recoded = !bytes.equals(Buffer.from(content, 'utf8'))
      } catch {
        continue
      }
      let id = readDirective(content, 'x_id')?.trim() ?? ''
      let updatedAt = readDirective(content, 'x_updated')?.trim() ?? ''
      let changed = recoded
      if (!id || seen.has(id)) {
        // Files added by hand (or copied) get their own identity.
        id = newId()
        content = setDirective(content, 'x_id', id)
        changed = true
      }
      const mtime = (await stat(path)).mtime
      if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
        updatedAt = mtime.toISOString()
        content = setDirective(content, 'x_updated', updatedAt)
        changed = true
      } else if (mtime.getTime() - Date.parse(updatedAt) > EDITED_OUTSIDE_SLACK_MS) {
        // We set the file time to {x_updated} on every write, so a newer file time means the
        // file was edited outside the app – that edit gets its own timestamp and syncs.
        updatedAt = mtime.toISOString()
        content = setDirective(content, 'x_updated', updatedAt)
        changed = true
      }
      if (changed) await this.write(path, content, updatedAt)
      seen.add(id)
      this.files.set(id, name)
      out.push({ id, content, updatedAt })
    }
    return out
  }

  private async saveFile(file: SongFile): Promise<void> {
    await ensureDir(this.dir)
    if (this.files.size === 0) await this.scan()
    let content = setDirective(file.content, 'x_id', file.id)
    content = setDirective(content, 'x_updated', file.updatedAt)
    if (!content.endsWith('\n')) content += '\n'
    const current = this.files.get(file.id)
    const wanted = await this.fileNameFor(readTitle(content), current)
    if (current && current !== wanted) {
      await rename(join(this.dir, current), join(this.dir, wanted)).catch(() => undefined)
    }
    await this.write(join(this.dir, wanted), content, file.updatedAt)
    this.files.set(file.id, wanted)
    await this.tombstones.clear('songs', file.id)
  }

  private async removeFile(id: string, deletedAt: string): Promise<void> {
    if (this.files.size === 0) await this.scan()
    const name = this.files.get(id)
    if (name) {
      await ensureDir(this.trashDir)
      const stamp = deletedAt.replace(/[:.]/g, '-')
      await rename(join(this.dir, name), join(this.trashDir, `${stamp}-${name}`)).catch(() => undefined)
      this.files.delete(id)
    }
    await this.tombstones.add('songs', id, deletedAt)
  }

  private async write(path: string, content: string, updatedAt: string): Promise<void> {
    this.recentWrites.set(path, Date.now())
    await writeFileAtomic(path, content)
    const t = new Date(updatedAt)
    if (!Number.isNaN(t.getTime())) await utimes(path, new Date(), t).catch(() => undefined)
  }

  /** `<slug>.chordpro`, unique within the folder (keeps the current name if it already fits). */
  private async fileNameFor(title: string, current: string | undefined): Promise<string> {
    const base = safeFileName(slugify(title || 'bez-nazvu'))
    const taken = new Set([...this.files.values()].filter((n) => n !== current))
    for (let i = 1; ; i++) {
      const candidate = i === 1 ? `${base}.chordpro` : `${base}-${i}.chordpro`
      if (candidate === current || !taken.has(candidate)) {
        if (candidate !== current) {
          const exists = await stat(join(this.dir, candidate)).then(
            () => true,
            () => false
          )
          if (exists) continue
        }
        return candidate
      }
    }
  }
}
