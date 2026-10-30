/**
 * Supabase implementation of the sync RemoteStore plus the organisation / media helpers.
 * Runs in the Electron main process (never in the renderer, so the session stays out of the UI).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { OrgInfo, OrgMember } from '@shared/api'
import { SyncRemoteError } from '@core/sync/errors'
import type { RemoteStore, SongSyncData, SyncRecord, SyncTable } from '@core/sync/model'
import { slugify } from '@core/util/slug'

export const MEDIA_BUCKET = 'media'
const PULL_PAGE_SIZE = 500
const PUSH_BATCH_SIZE = 200
const REQUEST_TIMEOUT_MS = 60_000

export interface SupabaseConnection {
  url: string
  anonKey: string
}

/** Where supabase-js keeps the session (e.g. an encrypted file in the app data folder). */
export interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export function createSupabase(
  config: SupabaseConnection,
  storage: AuthStorage,
  fetchImpl?: typeof fetch
): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage
    },
    // The sync loop retries on its own schedule; failing fast keeps "offline" quick and predictable.
    db: { retry: false, timeout: REQUEST_TIMEOUT_MS },
    global: fetchImpl ? { fetch: fetchImpl } : {}
  })
}

interface PostgrestErrorLike {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

function toRemoteError(error: PostgrestErrorLike, status: number): SyncRemoteError {
  return new SyncRemoteError(error.message || `HTTP ${status}`, {
    status,
    code: error.code || null,
    details: error.details ?? null,
    hint: error.hint ?? null
  })
}

function toStorageError(error: unknown): SyncRemoteError {
  const e = (error ?? {}) as { message?: unknown; status?: unknown; statusCode?: unknown; code?: unknown }
  const status = typeof e.status === 'number' ? e.status : Number.parseInt(String(e.statusCode ?? ''), 10)
  return new SyncRemoteError(
    typeof e.message === 'string' && e.message ? e.message : 'Storage error',
    {
      status: Number.isFinite(status) ? status : null,
      code: typeof e.code === 'string' ? e.code : typeof e.statusCode === 'string' ? e.statusCode : null
    },
    { cause: error }
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Postgres returns `+00:00` and microseconds; the app uses `Date#toISOString()`. */
function normalizeTimestamp(value: string): string {
  const t = Date.parse(value)
  return Number.isNaN(t) ? value : new Date(t).toISOString()
}

interface Row {
  org_id: string
  id: string
  updated_at: string
  deleted: boolean | null
  updated_by: string | null
  server_updated_at: string
  title?: string | null
  content?: string | null
  data?: unknown
  storage_path?: string | null
  size?: number | null
}

function rowToRecord(table: SyncTable, row: Row): SyncRecord {
  let data: unknown
  if (table === 'songs') {
    data = { title: row.title ?? '', content: row.content ?? '' } satisfies SongSyncData
  } else if (table === 'media') {
    const path = row.storage_path ? { storagePath: row.storage_path } : {}
    data = isObject(row.data) ? { ...row.data, ...path } : row.storage_path ? path : (row.data ?? null)
  } else {
    data = row.data ?? null
  }
  return {
    table,
    id: row.id,
    updatedAt: normalizeTimestamp(row.updated_at),
    deleted: row.deleted === true,
    updatedBy: row.updated_by ?? '',
    data
  }
}

function recordToRow(table: SyncTable, orgId: string, r: SyncRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {
    org_id: orgId,
    id: r.id,
    updated_at: r.updatedAt,
    deleted: r.deleted,
    updated_by: r.updatedBy || null
  }
  if (table === 'songs') {
    const d = isObject(r.data) ? r.data : {}
    row.title = typeof d.title === 'string' ? d.title : ''
    row.content = typeof d.content === 'string' ? d.content : ''
  } else if (table === 'media') {
    if (isObject(r.data)) {
      const { storagePath, ...rest } = r.data
      row.data = rest
      row.storage_path = typeof storagePath === 'string' && storagePath ? storagePath : null
      row.size = typeof rest.size === 'number' && Number.isFinite(rest.size) ? Math.round(rest.size) : null
    } else {
      row.data = null
      row.storage_path = null
      row.size = null
    }
  } else {
    row.data = r.data ?? null
  }
  return row
}

/** PostgREST logic-tree values with reserved characters (`.`, `:`, `,`) must be double-quoted. */
function quoted(value: string): string {
  return `"${value.replace(/"/g, '')}"`
}

export class SupabaseRemote implements RemoteStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly orgId: string
  ) {}

  async pull(
    table: SyncTable,
    cursor: string | null
  ): Promise<{ records: SyncRecord[]; cursor: string | null }> {
    const records: SyncRecord[] = []
    let last: { ts: string; id: string } | null = null
    let nextCursor = cursor
    for (;;) {
      let query = this.client.from(table).select('*').eq('org_id', this.orgId)
      if (last) {
        // Keyset pagination on (server_updated_at, id): rows sharing a timestamp at a page
        // boundary are neither skipped nor repeated.
        query = query.or(
          `server_updated_at.gt.${quoted(last.ts)},and(server_updated_at.eq.${quoted(last.ts)},id.gt.${quoted(last.id)})`
        )
      } else if (cursor) {
        query = query.gt('server_updated_at', cursor)
      }
      const { data, error, status } = await query
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PULL_PAGE_SIZE)
      if (error) throw toRemoteError(error, status)
      const rows = (data ?? []) as Row[]
      for (const row of rows) records.push(rowToRecord(table, row))
      const tail = rows[rows.length - 1]
      if (tail) {
        last = { ts: tail.server_updated_at, id: tail.id }
        // Raw server value (microseconds) – rounding it could skip or repeat rows.
        nextCursor = tail.server_updated_at
      }
      if (rows.length < PULL_PAGE_SIZE) break
    }
    return { records, cursor: nextCursor }
  }

  async push(table: SyncTable, records: SyncRecord[]): Promise<void> {
    // Ids that are not UUIDs (built-in themes like "classic-dark") are local-only by design;
    // sending them would make Postgres reject the whole batch.
    const rows = records.filter((r) => UUID_RE.test(r.id)).map((r) => recordToRow(table, this.orgId, r))
    for (let i = 0; i < rows.length; i += PUSH_BATCH_SIZE) {
      const batch = rows.slice(i, i + PUSH_BATCH_SIZE)
      const { error, status } = await this.client.from(table).upsert(batch, { onConflict: 'org_id,id' })
      if (error) throw toRemoteError(error, status)
    }
  }
}

interface OrgJson {
  id?: unknown
  name?: unknown
  role?: unknown
  invite_code?: unknown
}

function toOrgInfo(value: unknown): OrgInfo | null {
  if (!isObject(value)) return null
  const o = value as OrgJson
  if (typeof o.id !== 'string') return null
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : '',
    role: o.role === 'admin' ? 'admin' : 'member',
    inviteCode: typeof o.invite_code === 'string' ? o.invite_code : null
  }
}

interface MemberRow {
  user_id: string
  email: string | null
  role: string
  display_name: string | null
}

/** Storage object name of a media file: `<org id>/<media id>-<ascii file name>`. */
export function mediaStoragePath(orgId: string, mediaId: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext =
    dot > 0
      ? fileName
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
      : ''
  const name = slugify(stem)
  return `${orgId}/${mediaId}-${ext ? `${name}.${ext}` : name}`
}

export class SupabaseOrgApi {
  constructor(private readonly client: SupabaseClient) {}

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error, status } = await this.client.rpc(fn, args ?? {})
    if (error) throw toRemoteError(error, status)
    return data as T
  }

  async myOrg(): Promise<OrgInfo | null> {
    return toOrgInfo(await this.rpc<unknown>('my_org'))
  }

  async createOrg(name: string): Promise<OrgInfo> {
    return this.requireOrg(await this.rpc<unknown>('create_org', { p_name: name }))
  }

  async joinOrg(code: string): Promise<OrgInfo> {
    return this.requireOrg(await this.rpc<unknown>('join_org', { p_code: code }))
  }

  async leaveOrg(): Promise<void> {
    await this.rpc('leave_org')
  }

  async members(): Promise<OrgMember[]> {
    const rows = (await this.rpc<MemberRow[] | null>('list_members')) ?? []
    return rows.map((r) => ({
      userId: r.user_id,
      email: r.email ?? '',
      role: r.role === 'admin' ? 'admin' : 'member',
      displayName: r.display_name ?? null
    }))
  }

  async setMemberRole(userId: string, role: 'admin' | 'member'): Promise<void> {
    await this.rpc('set_member_role', { p_user: userId, p_role: role })
  }

  async removeMember(userId: string): Promise<void> {
    await this.rpc('remove_member', { p_user: userId })
  }

  async rotateInviteCode(): Promise<string> {
    const code = await this.rpc<unknown>('rotate_invite_code')
    if (typeof code !== 'string') throw new SyncRemoteError('Unexpected response from rotate_invite_code')
    return code
  }

  /** Upload (or replace) a media file; returns its storage path. */
  async uploadMedia(
    orgId: string,
    id: string,
    fileName: string,
    data: Uint8Array,
    mime: string
  ): Promise<string> {
    const path = mediaStoragePath(orgId, id, fileName)
    const { error } = await this.client.storage
      .from(MEDIA_BUCKET)
      .upload(path, data, { contentType: mime, upsert: true })
    if (error) throw toStorageError(error)
    return path
  }

  async downloadMedia(path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(MEDIA_BUCKET).download(path)
    if (error) throw toStorageError(error)
    return new Uint8Array(await data.arrayBuffer())
  }

  async removeMedia(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const { error } = await this.client.storage.from(MEDIA_BUCKET).remove(paths)
    if (error) throw toStorageError(error)
  }

  private requireOrg(value: unknown): OrgInfo {
    const org = toOrgInfo(value)
    if (!org) throw new SyncRemoteError('Unexpected response from the server')
    return org
  }
}
