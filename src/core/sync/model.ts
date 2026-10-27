/**
 * Data model of the background synchronisation between this computer and the shared library of
 * the organisation ("sbor") on Supabase. Platform independent – the engine talks to the server
 * and to the local storage only through the RemoteStore / LocalStore interfaces.
 */

export type SyncTable = 'songs' | 'plans' | 'themes' | 'media'

export const SYNC_TABLES: SyncTable[] = ['songs', 'plans', 'themes', 'media']

/**
 * One synchronised entity.
 * - songs:  data = { title: string; content: string }  (content = ChordPro text)
 * - plans / themes: data = the JSON object (ServicePlan / Theme)
 * - media:  data = MediaItem (+ storagePath?: string once the file is in Supabase Storage)
 * Deleted entities are kept as tombstones (`deleted: true`) so the deletion reaches other computers.
 */
export interface SyncRecord {
  table: SyncTable
  id: string
  /** ISO timestamp of the last edit, set by the computer that made it (last-write-wins). */
  updatedAt: string
  deleted: boolean
  data: unknown
  /** Name of the computer that made the last edit (shown in conflict copies). */
  updatedBy: string
}

export interface SongSyncData {
  title: string
  content: string
}

export interface SyncState {
  /** Opaque per-table pull cursor returned by the remote (server time of the last pulled change). */
  cursors: Record<SyncTable, string | null>
  /** `${table}:${id}` → updatedAt both sides agreed on at the last sync (the merge base). */
  base: Record<string, string>
  lastSyncedAt: string | null
}

export function emptySyncState(): SyncState {
  return { cursors: { songs: null, plans: null, themes: null, media: null }, base: {}, lastSyncedAt: null }
}

/**
 * The next sync pulls every record again (the merge base stays). Used after a backup restore:
 * records the restore removed locally – without tombstones – come back from the server.
 */
export function withoutPullCursors(state: SyncState): SyncState {
  return { ...state, cursors: emptySyncState().cursors }
}

/** Fill in anything missing from a state file written by an older version (or a corrupted one). */
export function normalizeSyncState(state: Partial<SyncState> | null | undefined): SyncState {
  const empty = emptySyncState()
  if (!state || typeof state !== 'object') return empty
  const cursors = { ...empty.cursors }
  for (const t of SYNC_TABLES) {
    const c = (state.cursors as Partial<Record<SyncTable, unknown>> | undefined)?.[t]
    cursors[t] = typeof c === 'string' ? c : null
  }
  const base: Record<string, string> = {}
  if (state.base && typeof state.base === 'object') {
    for (const [k, v] of Object.entries(state.base)) if (typeof v === 'string') base[k] = v
  }
  return { cursors, base, lastSyncedAt: typeof state.lastSyncedAt === 'string' ? state.lastSyncedAt : null }
}

export function recordKey(table: SyncTable, id: string): string {
  return `${table}:${id}`
}

export interface RemoteStore {
  /** Changes made on the server after `cursor` (null = everything), oldest first. */
  pull(table: SyncTable, cursor: string | null): Promise<{ records: SyncRecord[]; cursor: string | null }>
  /** Insert or overwrite records (by id). */
  push(table: SyncTable, records: SyncRecord[]): Promise<void>
}

export interface LocalStore {
  /** All local records of the table, including tombstones of deleted ones. */
  list(table: SyncTable): Promise<SyncRecord[]>
  /** Write records coming from the server (create, overwrite or delete when `deleted`), in order. */
  apply(table: SyncTable, records: SyncRecord[]): Promise<void>
  loadState(): Promise<SyncState>
  saveState(state: SyncState): Promise<void>
}

export interface SyncResult {
  status: 'synced' | 'offline' | 'error'
  /** Czech, user facing. */
  error?: string
  /** Records written locally because of changes from other computers. */
  pulled: number
  /** Records uploaded (local changes, conflict winners and conflict copies). */
  pushed: number
  conflicts: number
  at: string
}

/**
 * Structural equality of JSON-like values: object key order does not matter and keys holding
 * `undefined` count as missing (that is what a JSON / jsonb round trip does).
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    // NaN never survives JSON anyway; treat undefined and null alike only inside objects (below).
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => jsonEqual(v, b[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined)
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined)
  if (ak.length !== bk.length) return false
  return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && jsonEqual(ao[k], bo[k]))
}

/** Same visible content: both deleted, or both alive with equal data. */
/**
 * Timestamp of the built-in sample data (songs, the "Neděle" template, the sample plan). A record
 * that still carries it was never edited on this computer, so it always yields to the server's
 * version – a newly joined computer must never overwrite what the sbor already prepared.
 */
export const SEED_UPDATED_AT = '2000-01-01T00:00:00.000Z'

export function sameContent(a: SyncRecord, b: SyncRecord): boolean {
  if (a.deleted && b.deleted) return true
  return a.deleted === b.deleted && jsonEqual(a.data, b.data)
}

/** Order two ISO timestamps as instants (formats may differ: `Z` vs `+00:00`, ms vs µs). */
export function compareTimestamps(a: string, b: string): number {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a < b ? -1 : a > b ? 1 : 0
  return ta - tb
}
