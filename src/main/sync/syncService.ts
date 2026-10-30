import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MediaItem } from '@core/media/model'
import type { ServicePlan } from '@core/plan/model'
import type { SupabaseConfig } from '@core/settings/model'
import { SyncEngine } from '@core/sync/engine'
import { classifySyncError, describeOrgError, mediaUploadFailedMessage } from '@core/sync/errors'
import {
  type LocalStore,
  normalizeSyncState,
  type SyncRecord,
  type SyncState,
  type SyncTable,
  withoutPullCursors
} from '@core/sync/model'
import type { Theme } from '@core/theme/model'
import { readTitle } from '@core/chordpro/directives'
import type { ActionResult, OrgInfo, OrgMember, SyncStatus } from '@shared/api'
import type { CollectionRepo } from '../storage/collectionRepo'
import { readJson, writeJsonAtomic } from '../storage/fsUtil'
import type { SettingsRepo } from '../storage/settingsRepo'
import type { SongsRepo } from '../storage/songsRepo'
import type { TombstoneStore } from '../storage/tombstones'
import { FileAuthStorage } from './authStorage'
import { createSupabase, mediaStoragePath, SupabaseOrgApi, SupabaseRemote } from './supabaseRemote'
import { SingleFlight, mediaStorageCleanup } from './syncHelpers'
import { MAX_SYNC_MEDIA_BYTES } from '@core/media/model'

export type SyncedMedia = MediaItem & { storagePath?: string }

/** What sync needs from the media library (implemented over MediaRepo). */
export interface MediaPort {
  list(): Promise<SyncedMedia[]>
  put(item: SyncedMedia): Promise<void>
  remove(id: string, deletedAt: string): Promise<void>
  hasFile(item: SyncedMedia): Promise<boolean>
  readFile(item: SyncedMedia): Promise<Uint8Array>
  writeFile(item: SyncedMedia, data: Uint8Array): Promise<void>
}

export interface SyncDeps {
  songs: SongsRepo
  plans: CollectionRepo<ServicePlan>
  themes: CollectionRepo<Theme>
  media: MediaPort
  tombstones: TombstoneStore
  settings: SettingsRepo
  syncDir: string
  /** URL + anon key baked into the build (optional). */
  builtIn: SupabaseConfig | null
  onStatus: (status: SyncStatus) => void
}

/** Czech messages for the common Supabase Auth errors (sign in / sign up). */
export function authErrorMessage(err: unknown): string | null {
  const e = err as { code?: string; message?: string; status?: number }
  const code = e?.code ?? ''
  const msg = (e?.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return 'Nesprávný e-mail nebo heslo.'
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'E-mail ještě není potvrzený – otevřete odkaz, který vám přišel e-mailem.'
  if (code === 'user_already_exists' || msg.includes('already registered'))
    return 'Účet s tímto e-mailem už existuje.'
  if (code === 'weak_password' || msg.includes('password should be'))
    return 'Heslo je příliš slabé – použijte aspoň 8 znaků.'
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit'))
    return 'Příliš mnoho pokusů – zkuste to prosím za chvíli.'
  if (code === 'validation_failed' || msg.includes('invalid email')) return 'Zkontrolujte e-mailovou adresu.'
  return null
}

const INTERVAL_MS = 60_000
const DEBOUNCE_MS = 5_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Background synchronisation with the shared library on Supabase. Lives in the main process and
 * only ever touches local files and the network – the live output never waits for it.
 */
export class SyncService {
  private client: SupabaseClient | null = null
  private orgApi: SupabaseOrgApi | null = null
  private auth: FileAuthStorage
  private timer: NodeJS.Timeout | null = null
  private debounce: NodeJS.Timeout | null = null
  private applying = false
  /** Set after a backup restore: the next sync pulls everything again. */
  private fullPullPending = false
  /** One sync at a time – the timer, the debounce and sign-in all go through here. */
  private readonly flight = new SingleFlight(() => this.runSync())
  private current: SyncStatus = {
    state: 'local',
    lastSyncedAt: null,
    error: null,
    configured: false,
    user: null,
    org: null,
    builtInConfig: false
  }

  constructor(private readonly deps: SyncDeps) {
    this.auth = new FileAuthStorage(join(deps.syncDir, 'session.bin'))
  }

  status(): SyncStatus {
    return this.current
  }

  private set(patch: Partial<SyncStatus>): void {
    this.current = { ...this.current, ...patch }
    this.deps.onStatus(this.current)
  }

  private async config(): Promise<SupabaseConfig | null> {
    if (this.deps.builtIn?.url && this.deps.builtIn.anonKey) return this.deps.builtIn
    const s = await this.deps.settings.get()
    return s.supabase?.url && s.supabase.anonKey ? s.supabase : null
  }

  async start(): Promise<void> {
    const cfg = await this.config()
    this.set({
      builtInConfig: Boolean(this.deps.builtIn?.url),
      configured: Boolean(cfg),
      url: cfg?.url ?? null
    })
    if (!cfg) {
      this.set({ state: 'local' })
      return
    }
    this.client = createSupabase(cfg, this.auth)
    this.orgApi = new SupabaseOrgApi(this.client)
    this.client.auth.onAuthStateChange((_event, session) => {
      this.set({ user: session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null })
    })
    await this.refreshIdentity()
    this.timer = setInterval(() => void this.syncNow(), INTERVAL_MS)
    void this.syncNow()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.debounce) clearTimeout(this.debounce)
    this.timer = null
    this.debounce = null
  }

  /** Called after every local edit – syncs a few seconds later. */
  notifyLocalChange(): void {
    if (this.applying || !this.current.org) return
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.syncNow(), DEBOUNCE_MS)
  }

  private orgCacheFile(): string {
    return join(this.deps.syncDir, 'org.json')
  }

  private async refreshIdentity(): Promise<void> {
    if (!this.client || !this.orgApi) return
    try {
      const { data } = await this.client.auth.getSession()
      const user = data.session?.user
      if (!user) {
        this.set({ user: null, org: null, state: 'signed-out', error: null })
        return
      }
      this.set({ user: { id: user.id, email: user.email ?? '' } })
      try {
        const org = await this.orgApi.myOrg()
        await writeJsonAtomic(this.orgCacheFile(), org)
        this.set({ org, state: org ? this.current.state : 'local' })
      } catch (err) {
        // Offline at start: keep working with the organisation we knew last time.
        const cached = await readJson<OrgInfo | null>(this.orgCacheFile(), null)
        const c = classifySyncError(err)
        this.set({ org: cached, state: c.status, error: c.message })
      }
    } catch (err) {
      const c = classifySyncError(err)
      this.set({ state: c.status, error: c.message })
    }
  }

  async configure(config: SupabaseConfig | null): Promise<SyncStatus> {
    this.stop()
    if (this.client) await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    this.client = null
    this.orgApi = null
    await this.auth.clear()
    await this.deps.settings.update({ supabase: config ?? undefined })
    this.set({ user: null, org: null, error: null, lastSyncedAt: null })
    await this.start()
    return this.current
  }

  private async run<T>(fn: () => Promise<T>): Promise<ActionResult & { value?: T }> {
    if (!this.client || !this.orgApi) return { ok: false, error: 'Nejdřív připojte Supabase.' }
    try {
      const value = await fn()
      return { ok: true, value }
    } catch (err) {
      return { ok: false, error: authErrorMessage(err) ?? describeOrgError(err) }
    }
  }

  async signUp(email: string, password: string): Promise<ActionResult> {
    const r = await this.run(async () => {
      const { error } = await this.client!.auth.signUp({ email, password })
      if (error) throw error
    })
    await this.refreshIdentity()
    return { ok: r.ok, error: r.error }
  }

  async signIn(email: string, password: string): Promise<ActionResult> {
    const r = await this.run(async () => {
      const { error } = await this.client!.auth.signInWithPassword({ email, password })
      if (error) throw error
    })
    await this.refreshIdentity()
    if (r.ok) void this.syncNow()
    return { ok: r.ok, error: r.error }
  }

  async signOut(): Promise<ActionResult> {
    const r = await this.run(async () => {
      await this.client!.auth.signOut({ scope: 'local' })
    })
    await this.auth.clear()
    this.set({ user: null, org: null, state: 'signed-out', error: null })
    return { ok: r.ok, error: r.error }
  }

  private async orgChanged(org: OrgInfo | null): Promise<void> {
    await writeJsonAtomic(this.orgCacheFile(), org)
    this.set({ org, state: org ? 'syncing' : 'local' })
    if (org) void this.syncNow()
  }

  async createOrg(name: string): Promise<ActionResult> {
    const r = await this.run(() => this.orgApi!.createOrg(name))
    if (r.ok) await this.orgChanged(r.value ?? null)
    return { ok: r.ok, error: r.error }
  }

  async joinOrg(code: string): Promise<ActionResult> {
    const r = await this.run(() => this.orgApi!.joinOrg(code))
    if (r.ok) await this.orgChanged(r.value ?? null)
    return { ok: r.ok, error: r.error }
  }

  async leaveOrg(): Promise<ActionResult> {
    const r = await this.run(() => this.orgApi!.leaveOrg())
    if (r.ok) await this.orgChanged(null)
    return { ok: r.ok, error: r.error }
  }

  async members(): Promise<OrgMember[]> {
    const r = await this.run(() => this.orgApi!.members())
    return r.value ?? []
  }

  async setMemberRole(userId: string, role: 'admin' | 'member'): Promise<ActionResult> {
    return this.run(() => this.orgApi!.setMemberRole(userId, role))
  }

  async removeMember(userId: string): Promise<ActionResult> {
    return this.run(() => this.orgApi!.removeMember(userId))
  }

  async rotateInviteCode(): Promise<ActionResult> {
    const r = await this.run(() => this.orgApi!.rotateInviteCode())
    if (r.ok && this.current.org) this.set({ org: { ...this.current.org, inviteCode: r.value ?? null } })
    return { ok: r.ok, error: r.error }
  }

  syncNow(): Promise<SyncStatus> {
    return this.flight.run()
  }

  /**
   * After a backup restore: records the restore removed locally have no tombstones and the pull
   * cursors are already past them, so the next sync starts pulling from the beginning.
   */
  restoreHappened(): void {
    this.fullPullPending = true
    this.notifyLocalChange()
  }

  private async resetPullCursors(): Promise<void> {
    const names = await readdir(this.deps.syncDir).catch(() => [] as string[])
    for (const name of names.filter((n) => /^state-.+\.json$/.test(n))) {
      const file = join(this.deps.syncDir, name)
      const state = normalizeSyncState(await readJson<Partial<SyncState> | null>(file, null))
      await writeJsonAtomic(file, withoutPullCursors(state))
    }
  }

  private async runSync(): Promise<SyncStatus> {
    const org = this.current.org
    if (!this.client || !this.orgApi || !org || !this.current.user) return this.current
    this.set({ state: 'syncing' })
    if (this.fullPullPending) {
      this.fullPullPending = false
      await this.resetPullCursors()
    }
    const deviceName = (await this.deps.settings.get()).deviceName
    let failedUploads = 0
    try {
      failedUploads = await this.uploadMediaFiles(org.id)
    } catch (err) {
      console.warn('[sync] media upload skipped', err)
    }
    const engine = new SyncEngine({
      remote: new SupabaseRemote(this.client, org.id),
      local: createRepoLocalStore(this.deps, join(this.deps.syncDir, `state-${org.id}.json`), deviceName),
      deviceName
    })
    this.applying = true
    const result = await engine.syncOnce().finally(() => {
      this.applying = false
    })
    try {
      await this.downloadMissingMedia()
    } catch (err) {
      console.warn('[sync] media download skipped', err)
    }
    if (result.status === 'synced') await this.cleanUpDeletedMedia(org.id)
    const mediaProblem = result.status === 'synced' && failedUploads > 0
    this.set({
      state: mediaProblem ? 'error' : result.status,
      error: mediaProblem ? mediaUploadFailedMessage(failedUploads) : (result.error ?? null),
      lastSyncedAt: result.status === 'synced' ? result.at : this.current.lastSyncedAt,
      changes: result.pulled
    })
    return this.current
  }

  /**
   * Upload files of media that should be shared but are not in Storage yet. A file that fails
   * (e.g. the free quota is full) is skipped so the others still go up; returns how many failed.
   */
  private async uploadMediaFiles(orgId: string): Promise<number> {
    let failed = 0
    for (const item of await this.deps.media.list()) {
      if (item.storagePath || item.localOnly || item.size > MAX_SYNC_MEDIA_BYTES) continue
      if (!(await this.deps.media.hasFile(item))) continue
      try {
        const path = await this.orgApi!.uploadMedia(
          orgId,
          item.id,
          item.fileName,
          await this.deps.media.readFile(item),
          item.mime
        )
        await this.deps.media.put({
          ...item,
          storagePath: path || mediaStoragePath(orgId, item.id, item.fileName),
          updatedAt: new Date().toISOString()
        })
      } catch (err) {
        failed++
        console.warn('[sync] media upload failed', item.id, err)
      }
    }
    return failed
  }

  /** Remove Storage files of shared media that were deleted, so the free quota does not fill up. */
  private async cleanUpDeletedMedia(orgId: string): Promise<void> {
    const file = join(this.deps.syncDir, `media-paths-${orgId}.json`)
    try {
      const known = await readJson<Record<string, string>>(file, {})
      const tombstones = (await this.deps.tombstones.all()).media
      const plan = mediaStorageCleanup(known, await this.deps.media.list(), tombstones)
      if (plan.remove.length > 0) await this.orgApi!.removeMedia(plan.remove)
      await writeJsonAtomic(file, plan.known)
    } catch (err) {
      // Not removed this time – the entries stay in the file and the next sync tries again.
      console.warn('[sync] media cleanup skipped', err)
    }
  }

  private async downloadMissingMedia(): Promise<void> {
    for (const item of await this.deps.media.list()) {
      if (!item.storagePath || (await this.deps.media.hasFile(item))) continue
      await this.deps.media.writeFile(item, await this.orgApi!.downloadMedia(item.storagePath))
    }
  }
}

/** LocalStore over the app's file repositories (songs folder, plan/theme JSON files, media index). */
export function createRepoLocalStore(
  d: Pick<SyncDeps, 'songs' | 'plans' | 'themes' | 'media' | 'tombstones'>,
  stateFile: string,
  deviceName: string
): LocalStore {
  const tomb = async (table: SyncTable): Promise<SyncRecord[]> =>
    Object.entries((await d.tombstones.all())[table]).map(([id, at]) => ({
      table,
      id,
      updatedAt: at,
      deleted: true,
      data: null,
      updatedBy: deviceName
    }))
  return {
    list: async (table) => {
      if (table === 'songs') {
        const songs = await d.songs.list()
        return [
          ...songs.map((s) => ({
            table,
            id: s.id,
            updatedAt: s.updatedAt,
            deleted: false,
            data: { title: readTitle(s.content), content: s.content },
            updatedBy: deviceName
          })),
          ...(await tomb(table))
        ]
      }
      const items: Array<{ id: string; updatedAt: string }> =
        table === 'plans'
          ? await d.plans.list()
          : table === 'themes'
            ? await d.themes.list()
            : await d.media.list()
      return [
        ...items
          .filter((i) => UUID.test(i.id))
          .map((i) => ({
            table,
            id: i.id,
            updatedAt: i.updatedAt,
            deleted: false,
            data: i,
            updatedBy: deviceName
          })),
        ...(await tomb(table))
      ]
    },
    apply: async (table, records) => {
      for (const r of records) {
        if (table === 'songs') {
          if (r.deleted) await d.songs.remove(r.id, r.updatedAt)
          else {
            const data = r.data as { content?: string }
            await d.songs.save({ id: r.id, content: data.content ?? '', updatedAt: r.updatedAt })
          }
        } else if (table === 'plans') {
          if (r.deleted) await d.plans.remove(r.id, r.updatedAt)
          else await d.plans.save({ ...(r.data as ServicePlan), id: r.id, updatedAt: r.updatedAt })
        } else if (table === 'themes') {
          if (r.deleted) await d.themes.remove(r.id, r.updatedAt)
          else await d.themes.save({ ...(r.data as Theme), id: r.id, updatedAt: r.updatedAt })
        } else {
          if (r.deleted) await d.media.remove(r.id, r.updatedAt)
          else await d.media.put({ ...(r.data as SyncedMedia), id: r.id, updatedAt: r.updatedAt })
        }
      }
    },
    loadState: async () => normalizeSyncState(await readJson<Partial<SyncState> | null>(stateFile, null)),
    saveState: (state) => writeJsonAtomic(stateFile, state)
  }
}
