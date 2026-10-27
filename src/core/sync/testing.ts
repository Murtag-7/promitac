/**
 * In-memory implementations of RemoteStore / LocalStore for tests (and for trying the engine
 * without a server). The fake remote mimics the Supabase contract: every push stamps a fresh,
 * monotonically increasing server sequence that serves as the pull cursor.
 */
import type { LocalStore, RemoteStore, SyncRecord, SyncState, SyncTable } from './model'
import { emptySyncState } from './model'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class MemoryRemote implements RemoteStore {
  private rows = new Map<string, { record: SyncRecord; seq: number }>()
  private seq = 0
  /** When set, every call rejects with this value (simulates network / auth failures). */
  failWith: unknown = null
  /** When set, only `push` rejects with this value. */
  failPushWith: unknown = null
  pullCalls: Array<{ table: SyncTable; cursor: string | null }> = []
  pushCalls: Array<{ table: SyncTable; records: SyncRecord[] }> = []

  async pull(
    table: SyncTable,
    cursor: string | null
  ): Promise<{ records: SyncRecord[]; cursor: string | null }> {
    this.pullCalls.push({ table, cursor })
    if (this.failWith) throw this.failWith
    const since = cursor === null ? 0 : Number(cursor)
    const items = [...this.rows.values()]
      .filter((r) => r.record.table === table && r.seq > since)
      .sort((a, b) => a.seq - b.seq)
    const last = items[items.length - 1]
    return { records: items.map((i) => clone(i.record)), cursor: last ? String(last.seq) : cursor }
  }

  async push(table: SyncTable, records: SyncRecord[]): Promise<void> {
    this.pushCalls.push({ table, records: clone(records) })
    if (this.failWith) throw this.failWith
    if (this.failPushWith) throw this.failPushWith
    for (const r of records) {
      this.rows.set(`${table}:${r.id}`, { record: clone({ ...r, table }), seq: ++this.seq })
    }
  }

  /** Server-side view of a table (tests only). */
  all(table: SyncTable): SyncRecord[] {
    return [...this.rows.values()].filter((r) => r.record.table === table).map((r) => clone(r.record))
  }
}

export class MemoryLocal implements LocalStore {
  private tables: Record<SyncTable, Map<string, SyncRecord>> = {
    songs: new Map(),
    plans: new Map(),
    themes: new Map(),
    media: new Map()
  }
  state: SyncState = emptySyncState()
  applyCalls: Array<{ table: SyncTable; records: SyncRecord[] }> = []
  saveStateCalls = 0
  failListWith: unknown = null

  /** Simulates an edit made by the user on this computer. */
  put(record: SyncRecord): void {
    this.tables[record.table].set(record.id, clone(record))
  }

  get(table: SyncTable, id: string): SyncRecord | undefined {
    const r = this.tables[table].get(id)
    return r ? clone(r) : undefined
  }

  records(table: SyncTable): SyncRecord[] {
    return [...this.tables[table].values()].map(clone).sort((a, b) => a.id.localeCompare(b.id))
  }

  async list(table: SyncTable): Promise<SyncRecord[]> {
    if (this.failListWith) throw this.failListWith
    return [...this.tables[table].values()].map(clone)
  }

  async apply(table: SyncTable, records: SyncRecord[]): Promise<void> {
    this.applyCalls.push({ table, records: clone(records) })
    for (const r of records) this.tables[table].set(r.id, clone(r))
  }

  async loadState(): Promise<SyncState> {
    return clone(this.state)
  }

  async saveState(state: SyncState): Promise<void> {
    this.saveStateCalls++
    this.state = clone(state)
  }
}
