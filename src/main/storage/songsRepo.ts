import { readdir, readFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SongFile } from '@core/chordpro/model'
import { readDirective, readTitle, setDirective } from '@core/chordpro/directives'
import { newId, nowIso } from '@core/util/id'
import { safeFileName, slugify } from '@core/util/slug'
import { ensureDir, writeFileAtomic } from './fsUtil'
import type { TombstoneStore } from './tombstones'

const SONG_EXT = /\.(chordpro|cho|crd|chopro)$/i

/**
 * The song library is a plain folder of `.chordpro` files – readable, portable, easy to back up.
 * Identity (`{x_id}`) and last edit time (`{x_updated}`) live inside each file.
 */
export class SongsRepo {
  /** id → file name, refreshed by list(). */
  private files = new Map<string, string>()
  /** Paths we wrote recently – used to ignore our own writes in the folder watcher. */
  readonly recentWrites = new Map<string, number>()

  constructor(
    private readonly dir: string,
    private readonly trashDir: string,
    private readonly tombstones: TombstoneStore
  ) {}

  get folder(): string {
    return this.dir
  }

  async list(): Promise<SongFile[]> {
    await ensureDir(this.dir)
    const names = (await readdir(this.dir)).filter((n) => SONG_EXT.test(n) && !n.startsWith('.')).sort()
    const out: SongFile[] = []
    const seen = new Set<string>()
    this.files.clear()
    for (const name of names) {
      const path = join(this.dir, name)
      let content: string
      try {
        content = await readFile(path, 'utf8')
      } catch {
        continue
      }
      let id = readDirective(content, 'x_id')?.trim() ?? ''
      let updatedAt = readDirective(content, 'x_updated')?.trim() ?? ''
      let changed = false
      if (!id || seen.has(id)) {
        // Files added by hand (or copied) get their own identity.
        id = newId()
        content = setDirective(content, 'x_id', id)
        changed = true
      }
      if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
        updatedAt = (await stat(path)).mtime.toISOString()
        content = setDirective(content, 'x_updated', updatedAt)
        changed = true
      }
      if (changed) await this.write(path, content)
      seen.add(id)
      this.files.set(id, name)
      out.push({ id, content, updatedAt })
    }
    return out
  }

  async save(file: SongFile): Promise<void> {
    await ensureDir(this.dir)
    if (this.files.size === 0) await this.list()
    let content = setDirective(file.content, 'x_id', file.id)
    content = setDirective(content, 'x_updated', file.updatedAt)
    if (!content.endsWith('\n')) content += '\n'
    const current = this.files.get(file.id)
    const wanted = await this.fileNameFor(readTitle(content), current)
    if (current && current !== wanted) {
      await rename(join(this.dir, current), join(this.dir, wanted)).catch(() => undefined)
    }
    await this.write(join(this.dir, wanted), content)
    this.files.set(file.id, wanted)
    await this.tombstones.clear('songs', file.id)
  }

  async remove(id: string, deletedAt = nowIso()): Promise<void> {
    if (this.files.size === 0) await this.list()
    const name = this.files.get(id)
    if (name) {
      await ensureDir(this.trashDir)
      const stamp = deletedAt.replace(/[:.]/g, '-')
      await rename(join(this.dir, name), join(this.trashDir, `${stamp}-${name}`)).catch(() => undefined)
      this.files.delete(id)
    }
    await this.tombstones.add('songs', id, deletedAt)
  }

  private async write(path: string, content: string): Promise<void> {
    this.recentWrites.set(path, Date.now())
    await writeFileAtomic(path, content)
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
