import type { SongFile } from '@core/chordpro/model'
import type { BibleData, BibleTranslationInfo } from '@core/bible/model'
import type { OutputFrame } from '@core/live/frame'
import { type MediaItem, MAX_SYNC_MEDIA_BYTES, mediaKindFromName, mimeFromName } from '@core/media/model'
import type { ServicePlan } from '@core/plan/model'
import { type AppSettings, withDefaults } from '@core/settings/model'
import type { Theme } from '@core/theme/model'
import { newId, nowIso } from '@core/util/id'
import type { DisplayInfo, OutputStatus, PromitacApi, SyncStatus } from '@shared/api'
import { has, load, save } from './storage'
import { seedPlans, seedSongs } from './seed'

type Listener<T> = (v: T) => void

function emitter<T>() {
  const listeners = new Set<Listener<T>>()
  return {
    on(cb: Listener<T>) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    emit(v: T) {
      listeners.forEach((l) => l(v))
    }
  }
}

const DISPLAYS: DisplayInfo[] = [
  {
    id: 1,
    label: 'Vestavěný displej',
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    scaleFactor: 2,
    primary: true,
    isControl: true
  },
  {
    id: 2,
    label: 'Projektor (HDMI)',
    bounds: { x: 1512, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    primary: false,
    isControl: false
  }
]

const LOCAL_SYNC: SyncStatus = {
  state: 'local',
  lastSyncedAt: null,
  error: null,
  configured: false,
  user: null,
  org: null,
  builtInConfig: false
}

/** Built-in Bible files served by Vite from /resources in the web build. */
const BIBLE_URLS: Record<string, string> = {
  'cs-bkr': new URL('../../../../../resources/bibles/cs-bkr.json.gz', import.meta.url).href,
  'en-kjv': new URL('../../../../../resources/bibles/en-kjv.json.gz', import.meta.url).href
}

const BIBLE_INFO: BibleTranslationInfo[] = [
  {
    id: 'cs-bkr',
    name: 'Bible kralická (1613)',
    abbreviation: 'BKR',
    language: 'cs',
    builtIn: true,
    license: 'Public Domain'
  },
  {
    id: 'en-kjv',
    name: 'King James Version (1769, Pure Cambridge Edition)',
    abbreviation: 'KJV',
    language: 'en',
    builtIn: true,
    license: 'Public Domain'
  }
]

/** Fetch JSON that may be gzipped (some servers already decode it via Content-Encoding). */
async function gunzipJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Nelze načíst ${url}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(stream).text()) as T
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

/** In-browser implementation of the whole API (localStorage + BroadcastChannel). */
export function createMockApi(): PromitacApi {
  const now = nowIso()
  if (!has('songs')) save('songs', seedSongs(now))
  if (!has('plans')) save('plans', seedPlans(now))

  let songs = load<SongFile[]>('songs', [])
  let plans = load<ServicePlan[]>('plans', [])
  let themes = load<Theme[]>('themes', [])
  let media = load<MediaItem[]>('media', [])
  let settings = withDefaults(load<Partial<AppSettings>>('settings', {}))
  const mediaUrls = new Map<string, string>()
  const importedBibles = new Map<string, BibleData>()

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('promitac-output') : null
  const frames = emitter<OutputFrame>()
  const statusEmitter = emitter<OutputStatus[]>()
  let lastFrame: OutputFrame | null = null
  channel?.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { type: string; frame?: OutputFrame }
    if (msg.type === 'frame' && msg.frame) {
      lastFrame = msg.frame
      frames.emit(msg.frame)
    } else if (msg.type === 'request-frame' && lastFrame) {
      channel.postMessage({ type: 'frame', frame: lastFrame })
    }
  })

  const outputStatus = (): OutputStatus[] =>
    settings.outputs.map((o) => ({
      outputId: o.id,
      state: o.enabled ? 'open' : 'disabled',
      displayId: o.enabled ? 2 : null,
      displayLabel: o.enabled ? 'Projektor (HDMI)' : null
    }))

  return {
    platform: 'web',
    app: {
      version: async () => '0.1.0-web',
      openDataFolder: async () => undefined,
      getPathForFile: () => '',
      openExternal: async (url) => {
        window.open(url, '_blank', 'noopener')
      }
    },
    songs: {
      list: async () => songs.map((s) => ({ ...s })),
      save: async (file) => {
        songs = [...songs.filter((s) => s.id !== file.id), { ...file }]
        save('songs', songs)
      },
      remove: async (id) => {
        songs = songs.filter((s) => s.id !== id)
        save('songs', songs)
      },
      onExternalChange: () => () => undefined
    },
    plans: {
      list: async () => structuredClone(plans),
      save: async (plan) => {
        plans = [...plans.filter((p) => p.id !== plan.id), structuredClone(plan)]
        save('plans', plans)
      },
      remove: async (id) => {
        plans = plans.filter((p) => p.id !== id)
        save('plans', plans)
      }
    },
    themes: {
      list: async () => structuredClone(themes),
      save: async (theme) => {
        themes = [...themes.filter((t) => t.id !== theme.id), structuredClone(theme)]
        save('themes', themes)
      },
      remove: async (id) => {
        themes = themes.filter((t) => t.id !== id)
        save('themes', themes)
      }
    },
    media: {
      list: async () => media.filter((m) => mediaUrls.has(m.id)).map((m) => ({ ...m })),
      importPaths: async () => [],
      importFiles: async (files) => {
        const added: MediaItem[] = []
        for (const file of files) {
          const kind = mediaKindFromName(file.name)
          if (!kind) continue
          const id = newId()
          mediaUrls.set(id, URL.createObjectURL(file))
          const item: MediaItem = {
            id,
            name: file.name.replace(/\.[^.]+$/, ''),
            kind,
            fileName: `${id}-${file.name}`,
            mime: file.type || mimeFromName(file.name),
            size: file.size,
            localOnly: file.size > MAX_SYNC_MEDIA_BYTES,
            updatedAt: nowIso()
          }
          added.push(item)
        }
        media = [...media, ...added]
        save('media', media)
        return added
      },
      update: async (item) => {
        media = media.map((m) => (m.id === item.id ? { ...item } : m))
        save('media', media)
      },
      remove: async (id) => {
        media = media.filter((m) => m.id !== id)
        save('media', media)
      },
      url: (item) => mediaUrls.get(item.id) ?? ''
    },
    settings: {
      get: async () => structuredClone(settings),
      update: async (patch) => {
        settings = withDefaults({ ...settings, ...patch })
        save('settings', settings)
        statusEmitter.emit(outputStatus())
        return structuredClone(settings)
      }
    },
    displays: {
      list: async () => DISPLAYS,
      onChange: () => () => undefined
    },
    output: {
      setFrame: (frame) => {
        lastFrame = frame
        channel?.postMessage({ type: 'frame', frame })
      },
      onFrame: (cb) => {
        const off = frames.on(cb)
        channel?.postMessage({ type: 'request-frame' })
        return () => {
          off()
        }
      },
      status: async () => outputStatus(),
      onStatus: (cb) => {
        const off = statusEmitter.on(cb)
        return () => {
          off()
        }
      },
      refresh: async () => outputStatus()
    },
    bible: {
      listTranslations: async () => [
        ...BIBLE_INFO,
        ...[...importedBibles.values()].map((b) => ({
          id: b.id,
          name: b.name,
          abbreviation: b.abbreviation,
          language: b.language,
          builtIn: false
        }))
      ],
      load: async (id) => {
        const imported = importedBibles.get(id)
        if (imported) return imported
        const url = BIBLE_URLS[id]
        if (!url) throw new Error(`Neznámý překlad ${id}`)
        return gunzipJson<BibleData>(url)
      },
      importTranslation: async (fileName, xml) => {
        const { parseBibleXml } = await import('@core/bible/formats')
        const data = parseBibleXml(fileName, xml)
        importedBibles.set(data.id, data)
        return {
          id: data.id,
          name: data.name,
          abbreviation: data.abbreviation,
          language: data.language,
          builtIn: false
        }
      },
      removeTranslation: async (id) => {
        importedBibles.delete(id)
      }
    },
    backup: {
      exportZip: async () => ({ ok: false, error: 'Záloha je dostupná jen v desktopové aplikaci.' }),
      importZip: async () => ({ ok: false, error: 'Obnova je dostupná jen v desktopové aplikaci.' })
    },
    sync: {
      status: async () => LOCAL_SYNC,
      onStatus: () => () => undefined,
      configure: async () => LOCAL_SYNC,
      signUp: async () => ({ ok: false, error: 'V ukázce v prohlížeči není synchronizace dostupná.' }),
      signIn: async () => ({ ok: false, error: 'V ukázce v prohlížeči není synchronizace dostupná.' }),
      signOut: async () => ({ ok: true }),
      createOrg: async () => ({ ok: false, error: 'Nedostupné v ukázce.' }),
      joinOrg: async () => ({ ok: false, error: 'Nedostupné v ukázce.' }),
      leaveOrg: async () => ({ ok: false, error: 'Nedostupné v ukázce.' }),
      members: async () => [],
      setMemberRole: async () => ({ ok: false }),
      removeMember: async () => ({ ok: false }),
      rotateInviteCode: async () => ({ ok: false }),
      syncNow: async () => LOCAL_SYNC
    }
  }
}
