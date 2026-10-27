/**
 * Two-way synchronisation of the local library with the organisation's shared library.
 *
 * Per table: pull server changes since the cursor, three-way compare each record with the local
 * copy and the merge base (updatedAt both sides agreed on last time), apply what changed remotely,
 * push what changed locally. Conflicts (both sides changed) are resolved last-write-wins by
 * updatedAt, an edit always beats a deletion, and for songs the losing version is kept as a copy.
 *
 * `syncOnce` never throws: every failure becomes `{ status: 'offline' | 'error' }`.
 */
import { newId } from '../util/id'
import { classifySyncError } from './errors'
import type {
  LocalStore,
  RemoteStore,
  SongSyncData,
  SyncRecord,
  SyncResult,
  SyncState,
  SyncTable
} from './model'
import { SYNC_TABLES, compareTimestamps, normalizeSyncState, recordKey, sameContent } from './model'
import { conflictCopyTitle, renameSongContent } from './songConflict'

export interface SyncEngineOptions {
  remote: RemoteStore
  local: LocalStore
  /** Name of this computer, stored with every upload and shown in song conflict copies. */
  deviceName: string
  now?: () => string
  tables?: SyncTable[]
}

interface TableCounts {
  pulled: number
  pushed: number
  conflicts: number
}

function songData(data: unknown): SongSyncData {
  const d = (data ?? {}) as Partial<SongSyncData>
  return {
    title: typeof d.title === 'string' ? d.title : '',
    content: typeof d.content === 'string' ? d.content : ''
  }
}

export class SyncEngine {
  private readonly remote: RemoteStore
  private readonly local: LocalStore
  private readonly deviceName: string
  private readonly now: () => string
  private readonly tables: SyncTable[]
  private running: Promise<SyncResult> | null = null

  constructor(opts: SyncEngineOptions) {
    this.remote = opts.remote
    this.local = opts.local
    this.deviceName = opts.deviceName
    this.now = opts.now ?? (() => new Date().toISOString())
    this.tables = opts.tables ?? SYNC_TABLES
  }

  /** Run one full sync. Concurrent calls share the sync that is already running. */
  syncOnce(): Promise<SyncResult> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null
      })
    }
    return this.running
  }

  private async run(): Promise<SyncResult> {
    const counts: TableCounts = { pulled: 0, pushed: 0, conflicts: 0 }
    let at = ''
    try {
      at = this.now()
      const state = normalizeSyncState(await this.local.loadState())
      for (const table of this.tables) await this.syncTable(table, state, counts)
      state.lastSyncedAt = at
      await this.local.saveState(state)
      return { status: 'synced', ...counts, at }
    } catch (e) {
      const { status, message } = classifySyncError(e)
      return { status, error: message, ...counts, at: at || safeNow() }
    }
  }

  /** Mutates `state` and `counts`; saves state as soon as anything durable happened. */
  private async syncTable(table: SyncTable, state: SyncState, counts: TableCounts): Promise<void> {
    const cursor = state.cursors[table] ?? null
    const pulled = await this.remote.pull(table, cursor)
    const localRecords = await this.local.list(table)

    const localById = new Map<string, SyncRecord>()
    for (const r of localRecords) localById.set(r.id, { ...r, table })
    // The same record may come twice (pagination, retries) – the later one is newer.
    const remoteById = new Map<string, SyncRecord>()
    for (const r of pulled.records) remoteById.set(r.id, { ...r, table })

    const base = state.base
    const toApply: SyncRecord[] = []
    const copies: SyncRecord[] = []
    const toPush: SyncRecord[] = []
    /** Base entries that hold even if the upload below fails. */
    const baseNow: Record<string, string> = {}
    /** Base entries that only hold once the upload succeeded. */
    const baseAfterPush: Record<string, string> = {}
    const handled = new Set<string>()
    let pulledCount = 0
    let conflicts = 0

    for (const remote of remoteById.values()) {
      const key = recordKey(table, remote.id)
      const local = localById.get(remote.id)

      if (!local) {
        toApply.push(remote)
        baseNow[key] = remote.updatedAt
        pulledCount++
        handled.add(remote.id)
        continue
      }
      if (sameContent(local, remote)) {
        // Already in sync. Adopt the server's timestamp so both sides agree on the base.
        if (local.updatedAt !== remote.updatedAt) toApply.push(remote)
        baseNow[key] = remote.updatedAt
        handled.add(remote.id)
        continue
      }
      // The server still has the version we agreed on (e.g. pulled again after a failed upload):
      // only the local side changed – the loop over local records below uploads it.
      if (remote.updatedAt === base[key]) continue

      handled.add(remote.id)
      if (local.updatedAt === base[key]) {
        toApply.push(remote)
        baseNow[key] = remote.updatedAt
        pulledCount++
        continue
      }

      // Both sides changed since the last sync.
      conflicts++
      const mine = this.stamp(local)
      const remoteWins =
        remote.deleted !== mine.deleted
          ? !remote.deleted // an edit always beats a deletion – never lose content
          : compareTimestamps(remote.updatedAt, mine.updatedAt) >= 0 // ties → server

      if (table === 'songs' && !remote.deleted && !mine.deleted) {
        copies.push(this.conflictCopy(remoteWins ? mine : remote))
      }
      if (remoteWins) {
        toApply.push(remote)
        baseNow[key] = remote.updatedAt
        pulledCount++
      } else {
        toPush.push(mine)
        // We have seen the server version; if the upload fails, the next run must not treat the
        // same server version as a new conflict again.
        baseNow[key] = remote.updatedAt
        baseAfterPush[key] = mine.updatedAt
      }
    }

    for (const local of localById.values()) {
      if (handled.has(local.id)) continue
      const key = recordKey(table, local.id)
      if (local.updatedAt === base[key]) continue
      if (local.deleted && base[key] === undefined) {
        // Created and deleted before it ever reached the server – nothing to tell anyone.
        baseNow[key] = local.updatedAt
        continue
      }
      toPush.push(this.stamp(local))
      baseAfterPush[key] = local.updatedAt
    }

    for (const copy of copies) {
      toPush.push(copy)
      baseAfterPush[recordKey(table, copy.id)] = copy.updatedAt
    }

    // Local writes first (copies before the records that overwrite the losing version), so a
    // failed upload leaves a consistent local library that the next run simply uploads.
    const applyList = [...copies, ...toApply]
    if (applyList.length > 0) await this.local.apply(table, applyList)
    counts.pulled += pulledCount
    counts.conflicts += conflicts
    Object.assign(base, baseNow)
    if (applyList.length > 0 || Object.keys(baseNow).length > 0) await this.local.saveState(state)

    if (toPush.length > 0) {
      await this.remote.push(table, toPush)
      counts.pushed += toPush.length
    }
    Object.assign(base, baseAfterPush)
    state.cursors[table] = pulled.cursor ?? cursor
    await this.local.saveState(state)
  }

  /** A locally changed record was edited on this computer. */
  private stamp(record: SyncRecord): SyncRecord {
    return { ...record, updatedBy: this.deviceName }
  }

  private conflictCopy(loser: SyncRecord): SyncRecord {
    const id = newId()
    const updatedAt = this.now()
    const { title, content } = songData(loser.data)
    const newTitle = conflictCopyTitle(title, loser.updatedBy)
    return {
      table: 'songs',
      id,
      updatedAt,
      deleted: false,
      updatedBy: this.deviceName,
      data: { title: newTitle, content: renameSongContent(content, id, newTitle, updatedAt) }
    }
  }
}

function safeNow(): string {
  return new Date().toISOString()
}
