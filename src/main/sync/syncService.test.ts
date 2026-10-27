import { authErrorMessage } from './syncService'

vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false } }))

describe('authErrorMessage', () => {
  it('translates common Supabase auth errors', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Nesprávný e-mail nebo heslo.'
    )
    expect(authErrorMessage({ message: 'Email not confirmed' })).toMatch(/není potvrzený/)
    expect(authErrorMessage({ code: 'user_already_exists' })).toMatch(/už existuje/)
    expect(authErrorMessage(new Error('something else'))).toBeNull()
  })
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServicePlan } from '@core/plan/model'
import { isServicePlan } from '@core/plan/templates'
import { isTheme } from '@core/theme/defaults'
import type { Theme } from '@core/theme/model'
import { SyncEngine } from '@core/sync/engine'
import { MemoryRemote } from '@core/sync/testing'
import { CollectionRepo } from '../storage/collectionRepo'
import { SongsRepo } from '../storage/songsRepo'
import { TombstoneStore } from '../storage/tombstones'
import { createRepoLocalStore, type MediaPort, type SyncedMedia } from './syncService'

function memoryMedia(): MediaPort {
  const items = new Map<string, SyncedMedia>()
  return {
    list: async () => [...items.values()],
    put: async (m) => void items.set(m.id, m),
    remove: async (id) => void items.delete(id),
    hasFile: async () => true,
    readFile: async () => new Uint8Array(),
    writeFile: async () => undefined
  }
}

function computer(name: string, remote: MemoryRemote) {
  const root = mkdtempSync(join(tmpdir(), `promitac-sync-${name}-`))
  const tombstones = new TombstoneStore(join(root, 'tombstones.json'))
  const deps = {
    songs: new SongsRepo(join(root, 'songs'), join(root, 'trash'), tombstones),
    plans: new CollectionRepo<ServicePlan>(join(root, 'plans'), 'plans', tombstones, isServicePlan),
    themes: new CollectionRepo<Theme>(join(root, 'themes'), 'themes', tombstones, isTheme),
    media: memoryMedia(),
    tombstones
  }
  const engine = new SyncEngine({
    remote,
    local: createRepoLocalStore(deps, join(root, 'state.json'), name),
    deviceName: name
  })
  return { ...deps, engine }
}

const SONG_ID = '11111111-1111-4111-8111-111111111111'
const song = (title: string, updatedAt: string) => ({
  id: SONG_ID,
  updatedAt,
  content: `{title: ${title}}\n\n{start_of_verse: V1}\n[G]Text\n{end_of_verse}\n`
})

describe('sync through the file repositories', () => {
  it('propagates songs, edits and deletions between two computers', async () => {
    const remote = new MemoryRemote()
    const a = computer('Notebook', remote)
    const b = computer('Sálový PC', remote)

    await a.songs.save(song('První', '2026-10-01T10:00:00.000Z'))
    expect((await a.engine.syncOnce()).status).toBe('synced')
    expect((await b.engine.syncOnce()).status).toBe('synced')
    expect((await b.songs.list()).map((s) => s.content)).toEqual([expect.stringContaining('{title: První}')])

    await b.songs.save(song('Upraveno', '2026-10-02T10:00:00.000Z'))
    await b.engine.syncOnce()
    await a.engine.syncOnce()
    expect((await a.songs.list())[0]?.content).toContain('{title: Upraveno}')

    await a.songs.remove(SONG_ID, '2026-10-03T10:00:00.000Z')
    await a.engine.syncOnce()
    await b.engine.syncOnce()
    expect(await b.songs.list()).toEqual([])
  })

  it('keeps both versions when two computers edit the same song', async () => {
    const remote = new MemoryRemote()
    const a = computer('Notebook', remote)
    const b = computer('Sálový PC', remote)
    await a.songs.save(song('Společná', '2026-10-01T10:00:00.000Z'))
    await a.engine.syncOnce()
    await b.engine.syncOnce()

    await a.songs.save(song('Verze A', '2026-10-02T10:00:00.000Z'))
    await b.songs.save(song('Verze B', '2026-10-02T11:00:00.000Z'))
    await a.engine.syncOnce()
    await b.engine.syncOnce()
    await a.engine.syncOnce()

    const titlesA = (await a.songs.list()).map((s) => s.content.match(/\{title: (.*)\}/)?.[1]).sort()
    const titlesB = (await b.songs.list()).map((s) => s.content.match(/\{title: (.*)\}/)?.[1]).sort()
    expect(titlesA).toEqual(['Verze A (konflikt – verze z počítače Notebook)', 'Verze B'])
    expect(titlesB).toEqual(titlesA)
  })

  it('syncs plans', async () => {
    const remote = new MemoryRemote()
    const a = computer('A', remote)
    const b = computer('B', remote)
    const plan: ServicePlan = {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Neděle',
      date: '2026-11-01',
      isTemplate: false,
      items: [],
      updatedAt: '2026-10-01T10:00:00.000Z'
    }
    await a.plans.save(plan)
    await a.engine.syncOnce()
    await b.engine.syncOnce()
    expect((await b.plans.list()).map((p) => p.title)).toEqual(['Neděle'])
  })
})
