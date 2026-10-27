import { readJson, writeJsonAtomic } from './fsUtil'

/** Same names as the sync tables in src/core/sync. */
export type SyncTable = 'songs' | 'plans' | 'themes' | 'media'

export type Tombstones = Record<SyncTable, Record<string, string>>

const EMPTY = (): Tombstones => ({ songs: {}, plans: {}, themes: {}, media: {} })

/** Deleted record ids with deletion time – needed so deletions sync to other computers. */
export class TombstoneStore {
  private cache: Tombstones | null = null

  constructor(private readonly file: string) {}

  async all(): Promise<Tombstones> {
    if (!this.cache) this.cache = { ...EMPTY(), ...(await readJson<Partial<Tombstones>>(this.file, {})) }
    return this.cache
  }

  invalidate(): void {
    this.cache = null
  }

  async add(table: SyncTable, id: string, deletedAt: string): Promise<void> {
    const t = await this.all()
    t[table][id] = deletedAt
    await writeJsonAtomic(this.file, t)
  }

  async clear(table: SyncTable, id: string): Promise<void> {
    const t = await this.all()
    if (!(id in t[table])) return
    delete t[table][id]
    await writeJsonAtomic(this.file, t)
  }
}
