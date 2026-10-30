import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { nowIso } from '@core/util/id'
import { ensureDir, quarantine, writeJsonAtomic } from './fsUtil'
import type { SyncTable, TombstoneStore } from './tombstones'

/** One JSON file per item (`<id>.json`) – used for plans and themes. */
export class CollectionRepo<T extends { id: string }> {
  constructor(
    private readonly dir: string,
    private readonly table: SyncTable,
    private readonly tombstones: TombstoneStore,
    private readonly validate: (value: unknown) => value is T
  ) {}

  async list(): Promise<T[]> {
    await ensureDir(this.dir)
    const out: T[] = []
    for (const name of (await readdir(this.dir)).filter((n) => n.endsWith('.json')).sort()) {
      const path = join(this.dir, name)
      try {
        const value: unknown = JSON.parse(await readFile(path, 'utf8'))
        if (this.validate(value)) out.push(value)
        else await quarantine(path)
      } catch {
        // Broken file: keep it aside for manual recovery and carry on.
        await quarantine(path)
      }
    }
    return out
  }

  async save(item: T): Promise<void> {
    if (!/^[\w-]+$/.test(item.id)) throw new Error(`Invalid id: ${item.id}`)
    await writeJsonAtomic(join(this.dir, `${item.id}.json`), item)
    await this.tombstones.clear(this.table, item.id)
  }

  async remove(id: string, deletedAt = nowIso()): Promise<void> {
    if (/^[\w-]+$/.test(id)) await rm(join(this.dir, `${id}.json`), { force: true })
    await this.tombstones.add(this.table, id, deletedAt)
  }
}
