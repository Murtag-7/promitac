import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { OutputFrame } from '@core/live/frame'
import type { MediaItem } from '@core/media/model'
import type { DisplayInfo, OutputStatus, PromitacApi, SyncStatus, Unsubscribe } from '@shared/api'
import { APP_SCHEME, IPC, MEDIA_HOST } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const platform = process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux'

const api: PromitacApi = {
  platform,
  app: {
    version: () => invoke(IPC.appVersion),
    openDataFolder: () => invoke(IPC.appOpenDataFolder),
    getPathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    openExternal: (url) => invoke(IPC.appOpenExternal, url)
  },
  songs: {
    list: () => invoke(IPC.songsList),
    save: (file) => invoke(IPC.songsSave, file),
    remove: (id) => invoke(IPC.songsRemove, id),
    onExternalChange: (cb) => subscribe(IPC.songsExternalChange, () => cb())
  },
  plans: {
    list: () => invoke(IPC.plansList),
    save: (plan) => invoke(IPC.plansSave, plan),
    remove: (id) => invoke(IPC.plansRemove, id)
  },
  themes: {
    list: () => invoke(IPC.themesList),
    save: (theme) => invoke(IPC.themesSave, theme),
    remove: (id) => invoke(IPC.themesRemove, id)
  },
  media: {
    list: () => invoke(IPC.mediaList),
    importPaths: (paths) => invoke(IPC.mediaImportPaths, paths),
    importFiles: async (files) => {
      // Prefer paths (no copy through IPC); fall back to buffers for files without a path.
      const paths = files.map((f) => {
        try {
          return webUtils.getPathForFile(f)
        } catch {
          return ''
        }
      })
      if (paths.every((p) => p)) return invoke<MediaItem[]>(IPC.mediaImportPaths, paths)
      const buffers = await Promise.all(
        files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))
      )
      return invoke<MediaItem[]>(IPC.mediaImportBuffers, buffers)
    },
    update: (item) => invoke(IPC.mediaUpdate, item),
    remove: (id) => invoke(IPC.mediaRemove, id),
    url: (item) => `${APP_SCHEME}://${MEDIA_HOST}/${encodeURIComponent(item.fileName)}`
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    update: (patch) => invoke(IPC.settingsUpdate, patch)
  },
  displays: {
    list: () => invoke(IPC.displaysList),
    onChange: (cb) => subscribe<DisplayInfo[]>(IPC.displaysChanged, cb)
  },
  output: {
    setFrame: (frame) => ipcRenderer.send(IPC.outputSetFrame, frame),
    onFrame: (cb) => {
      const unsub = subscribe<OutputFrame>(IPC.outputFrame, cb)
      void invoke<OutputFrame | null>(IPC.outputGetLastFrame).then((f) => {
        if (f) cb(f)
      })
      return unsub
    },
    status: () => invoke(IPC.outputStatus),
    onStatus: (cb) => subscribe<OutputStatus[]>(IPC.outputStatusChanged, cb),
    refresh: () => invoke(IPC.outputRefresh)
  },
  bible: {
    listTranslations: () => invoke(IPC.bibleList),
    load: (id) => invoke(IPC.bibleLoad, id),
    importTranslation: (fileName, xml) => invoke(IPC.bibleImport, fileName, xml),
    removeTranslation: (id) => invoke(IPC.bibleRemove, id)
  },
  backup: {
    exportZip: (opts) => invoke(IPC.backupExport, opts),
    importZip: () => invoke(IPC.backupImport)
  },
  sync: {
    status: () => invoke(IPC.syncStatus),
    onStatus: (cb) => subscribe<SyncStatus>(IPC.syncStatusChanged, cb),
    configure: (config) => invoke(IPC.syncConfigure, config),
    signUp: (email, password) => invoke(IPC.syncSignUp, email, password),
    signIn: (email, password) => invoke(IPC.syncSignIn, email, password),
    signOut: () => invoke(IPC.syncSignOut),
    createOrg: (name) => invoke(IPC.syncCreateOrg, name),
    joinOrg: (code) => invoke(IPC.syncJoinOrg, code),
    leaveOrg: () => invoke(IPC.syncLeaveOrg),
    members: () => invoke(IPC.syncMembers),
    setMemberRole: (userId, role) => invoke(IPC.syncSetMemberRole, userId, role),
    removeMember: (userId) => invoke(IPC.syncRemoveMember, userId),
    rotateInviteCode: () => invoke(IPC.syncRotateInvite),
    syncNow: () => invoke(IPC.syncNow)
  }
}

contextBridge.exposeInMainWorld('promitac', api)
