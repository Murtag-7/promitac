import type { SongFile } from '@core/chordpro/model'
import type { OutputFrame } from '@core/live/frame'
import type { MediaItem } from '@core/media/model'
import type { ServicePlan } from '@core/plan/model'
import type { AppSettings, SupabaseConfig } from '@core/settings/model'
import type { Theme } from '@core/theme/model'
import type { BibleData, BibleTranslationInfo } from '@core/bible/model'

export type Unsubscribe = () => void

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  primary: boolean
  /** The display the control window is currently on. */
  isControl: boolean
}

export type OutputWindowState = 'open' | 'no-display' | 'disabled' | 'error'

export interface OutputStatus {
  outputId: string
  state: OutputWindowState
  displayId: number | null
  displayLabel: string | null
}

export type SyncState = 'local' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  lastSyncedAt: string | null
  error: string | null
  configured: boolean
  user: { id: string; email: string } | null
  org: OrgInfo | null
  /** True when URL + key were baked into the build (user only signs in). */
  builtInConfig: boolean
  /** Records changed locally by the last sync (the UI reloads its data when > 0). */
  changes?: number
  /** Supabase project URL in use (shown in settings). */
  url?: string | null
}

export interface OrgMember {
  userId: string
  email: string
  role: 'admin' | 'member'
  displayName: string | null
}

export interface OrgInfo {
  id: string
  name: string
  role: 'admin' | 'member'
  inviteCode: string | null
}

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface BackupResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
  counts?: { songs: number; plans: number; themes: number; media: number }
}

/** The whole surface the renderer may use. Implemented by preload (Electron) and api/mock (browser). */
export interface PromitacApi {
  platform: 'darwin' | 'win32' | 'linux' | 'web'

  app: {
    version(): Promise<string>
    openDataFolder(): Promise<void>
    /** Absolute path of a File from drag & drop / file input (Electron only, '' in browser). */
    getPathForFile(file: File): string
    openExternal(url: string): Promise<void>
  }

  songs: {
    list(): Promise<SongFile[]>
    save(file: SongFile): Promise<void>
    remove(id: string): Promise<void>
    onExternalChange(cb: () => void): Unsubscribe
  }

  plans: {
    list(): Promise<ServicePlan[]>
    save(plan: ServicePlan): Promise<void>
    remove(id: string): Promise<void>
  }

  themes: {
    list(): Promise<Theme[]>
    save(theme: Theme): Promise<void>
    remove(id: string): Promise<void>
  }

  media: {
    list(): Promise<MediaItem[]>
    /** Import local files (Electron: absolute paths). */
    importPaths(paths: string[]): Promise<MediaItem[]>
    /** Import browser File objects (mock / fallback). */
    importFiles(files: File[]): Promise<MediaItem[]>
    update(item: MediaItem): Promise<void>
    remove(id: string): Promise<void>
    /** URL usable in <img>/<video> in both control and output windows. */
    url(item: Pick<MediaItem, 'id' | 'fileName'>): string
  }

  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }

  displays: {
    list(): Promise<DisplayInfo[]>
    onChange(cb: (displays: DisplayInfo[]) => void): Unsubscribe
  }

  output: {
    /** Control window → all outputs. Never awaits anything network related. */
    setFrame(frame: OutputFrame): void
    /** Output window: receive frames. Calls back immediately with the last frame if any. */
    onFrame(cb: (frame: OutputFrame) => void): Unsubscribe
    status(): Promise<OutputStatus[]>
    onStatus(cb: (status: OutputStatus[]) => void): Unsubscribe
    /** Re-read settings.outputs and open/close windows accordingly. */
    refresh(): Promise<OutputStatus[]>
  }

  bible: {
    listTranslations(): Promise<BibleTranslationInfo[]>
    load(id: string): Promise<BibleData>
    /** Import Zefania XML / OSIS / USFX file content. */
    importTranslation(fileName: string, xml: string): Promise<BibleTranslationInfo>
    removeTranslation(id: string): Promise<void>
  }

  backup: {
    exportZip(opts: { includeMedia: boolean }): Promise<BackupResult>
    importZip(): Promise<BackupResult>
  }

  sync: {
    status(): Promise<SyncStatus>
    onStatus(cb: (status: SyncStatus) => void): Unsubscribe
    configure(config: SupabaseConfig | null): Promise<SyncStatus>
    signUp(email: string, password: string): Promise<ActionResult>
    signIn(email: string, password: string): Promise<ActionResult>
    signOut(): Promise<ActionResult>
    createOrg(name: string): Promise<ActionResult>
    joinOrg(code: string): Promise<ActionResult>
    leaveOrg(): Promise<ActionResult>
    members(): Promise<OrgMember[]>
    setMemberRole(userId: string, role: 'admin' | 'member'): Promise<ActionResult>
    removeMember(userId: string): Promise<ActionResult>
    rotateInviteCode(): Promise<ActionResult>
    syncNow(): Promise<SyncStatus>
  }
}

declare global {
  interface Window {
    promitac?: PromitacApi
  }
}
