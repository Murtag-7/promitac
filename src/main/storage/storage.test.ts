import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServicePlan } from '@core/plan/model'
import { SEED_UPDATED_AT } from '@core/sync/model'
import { CollectionRepo } from './collectionRepo'
import { seedIfFirstRun } from './seed'
import { readJson } from './fsUtil'
import { SettingsRepo } from './settingsRepo'
import { SongsRepo } from './songsRepo'
import { TombstoneStore } from './tombstones'

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'promitac-storage-'))
  const tombstones = new TombstoneStore(join(root, 'tombstones.json'))
  const songs = new SongsRepo(join(root, 'songs'), join(root, 'trash'), tombstones)
  return { root, tombstones, songs, songsDir: join(root, 'songs') }
}

const song = (id: string, title: string, body = '[G]Text') => ({
  id,
  updatedAt: '2026-10-01T10:00:00.000Z',
  content: `{title: ${title}}\n\n{start_of_verse: V1}\n${body}\n{end_of_verse}\n`
})

describe('SongsRepo', () => {
  it('saves and lists songs as .chordpro files with identity inside', async () => {
    const { songs, songsDir } = setup()
    await songs.save(song('a1', 'Žehnej, duše má'))
    expect(readdirSync(songsDir)).toEqual(['zehnej-duse-ma.chordpro'])
    const list = await songs.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'a1', updatedAt: '2026-10-01T10:00:00.000Z' })
    expect(list[0]?.content).toContain('{x_id: a1}')
  })

  it('renames the file when the title changes', async () => {
    const { songs, songsDir } = setup()
    await songs.save(song('a1', 'První'))
    await songs.save(song('a1', 'Druhý název'))
    expect(readdirSync(songsDir)).toEqual(['druhy-nazev.chordpro'])
  })

  it('gives songs with the same title distinct files', async () => {
    const { songs, songsDir } = setup()
    await songs.save(song('a1', 'Haleluja'))
    await songs.save(song('a2', 'Haleluja'))
    expect(readdirSync(songsDir).sort()).toEqual(['haleluja-2.chordpro', 'haleluja.chordpro'])
    expect((await songs.list()).map((s) => s.id).sort()).toEqual(['a1', 'a2'])
  })

  it('assigns an id to hand-added files without x_id and to duplicated ids', async () => {
    const { songs, songsDir } = setup()
    await songs.list()
    writeFileSync(join(songsDir, 'rucne.cho'), '{title: Ručně}\n[C]Ahoj\n')
    writeFileSync(join(songsDir, 'kopie.chordpro'), '{title: Kopie}\n{x_id: same}\n')
    writeFileSync(join(songsDir, 'original.chordpro'), '{title: Originál}\n{x_id: same}\n')
    const list = await songs.list()
    expect(list).toHaveLength(3)
    expect(new Set(list.map((s) => s.id)).size).toBe(3)
    expect(readFileSync(join(songsDir, 'rucne.cho'), 'utf8')).toMatch(/\{x_id: [0-9a-f-]{36}\}/)
    expect(list.every((s) => !Number.isNaN(Date.parse(s.updatedAt)))).toBe(true)
  })

  it('moves removed songs to the trash and records a tombstone', async () => {
    const { songs, songsDir, root, tombstones } = setup()
    await songs.save(song('a1', 'Smazat'))
    await songs.remove('a1', '2026-10-02T00:00:00.000Z')
    expect(readdirSync(songsDir)).toEqual([])
    expect(readdirSync(join(root, 'trash'))).toHaveLength(1)
    expect((await tombstones.all()).songs).toEqual({ a1: '2026-10-02T00:00:00.000Z' })
    await songs.save(song('a1', 'Smazat'))
    expect((await tombstones.all()).songs).toEqual({})
  })

  it('handles titles with characters forbidden on Windows', async () => {
    const { songs, songsDir } = setup()
    await songs.save(song('a1', 'Co je: "pravda"? <Ano|Ne>'))
    expect(readdirSync(songsDir)).toEqual(['co-je-pravda-ano-ne.chordpro'])
  })
})

interface Item {
  id: string
  name: string
}
const isItem = (v: unknown): v is Item =>
  typeof v === 'object' && v !== null && typeof (v as Item).id === 'string'

describe('CollectionRepo', () => {
  it('saves, lists and removes items', async () => {
    const { root, tombstones } = setup()
    const repo = new CollectionRepo<Item>(join(root, 'plans'), 'plans', tombstones, isItem)
    await repo.save({ id: 'p1', name: 'Neděle' })
    await repo.save({ id: 'p2', name: 'Středa' })
    expect((await repo.list()).map((p) => p.id)).toEqual(['p1', 'p2'])
    await repo.remove('p1')
    expect((await repo.list()).map((p) => p.id)).toEqual(['p2'])
    expect(Object.keys((await tombstones.all()).plans)).toEqual(['p1'])
  })

  it('skips a corrupt file and keeps it aside instead of overwriting', async () => {
    const { root, tombstones } = setup()
    const dir = join(root, 'plans')
    const repo = new CollectionRepo<Item>(dir, 'plans', tombstones, isItem)
    await repo.save({ id: 'ok', name: 'OK' })
    writeFileSync(join(dir, 'broken.json'), '{"id": "broken", ')
    writeFileSync(join(dir, 'wrong.json'), '[1,2,3]')
    expect((await repo.list()).map((p) => p.id)).toEqual(['ok'])
    const files = readdirSync(dir)
    expect(files.some((f) => f.startsWith('broken.json.corrupt-'))).toBe(true)
    expect(files.some((f) => f.startsWith('wrong.json.corrupt-'))).toBe(true)
  })

  it('rejects ids that could escape the folder', async () => {
    const { root, tombstones } = setup()
    const repo = new CollectionRepo<Item>(join(root, 'plans'), 'plans', tombstones, isItem)
    await expect(repo.save({ id: '../evil', name: 'x' })).rejects.toThrow()
  })
})

describe('SettingsRepo', () => {
  it('creates defaults and merges updates', async () => {
    const { root } = setup()
    const file = join(root, 'settings.json')
    const repo = new SettingsRepo(file)
    const s = await repo.get()
    expect(s.linesPerSlide).toBe(4)
    expect(existsSync(file)).toBe(true)
    await repo.update({ linesPerSlide: 2 })
    expect((await new SettingsRepo(file).get()).linesPerSlide).toBe(2)
  })

  it('survives a corrupt settings file', async () => {
    const { root } = setup()
    const file = join(root, 'settings.json')
    writeFileSync(file, 'nonsense{')
    const s = await new SettingsRepo(file).get()
    expect(s.outputs).toHaveLength(1)
    expect(await readJson(file, null)).not.toBeNull()
  })
})

describe('seedIfFirstRun', () => {
  it('two computers seed identical records with the seed timestamp', async () => {
    const seedOnce = async (now: string) => {
      const { root, songs, tombstones } = setup()
      const plans = new CollectionRepo<ServicePlan>(
        join(root, 'plans'),
        'plans',
        tombstones,
        (v): v is ServicePlan => typeof v === 'object' && v !== null && 'id' in v
      )
      await seedIfFirstRun(join(root, 'library'), songs, plans, now)
      return { songs: await songs.list(), plans: await plans.list() }
    }
    const a = await seedOnce('2026-10-27T08:00:00.000Z')
    const b = await seedOnce('2026-11-30T19:00:00.000Z')
    expect(a.songs.length).toBeGreaterThan(0)
    expect(b.songs.map((s) => s.content)).toEqual(a.songs.map((s) => s.content))
    for (const s of a.songs) expect(s.updatedAt).toBe(SEED_UPDATED_AT)
    const items = (r: { plans: ServicePlan[] }) =>
      r.plans.map((p) => ({ id: p.id, updatedAt: p.updatedAt, items: p.items.map((i) => i.id) }))
    expect(items(b)).toEqual(items(a))
    for (const p of a.plans) expect(p.updatedAt).toBe(SEED_UPDATED_AT)
  })
})

describe('SongsRepo concurrency', () => {
  it('a save that overlaps a folder scan never creates a second file for the same song', async () => {
    const { songs, songsDir } = setup()
    for (let i = 0; i < 60; i++) await songs.save(song(`id-${i}`, `Píseň ${i}`))
    const fresh = new SongsRepo(
      songsDir,
      join(songsDir, '..', 'trash'),
      new TombstoneStore(join(songsDir, '..', 't.json'))
    )
    await fresh.list()
    // Start the save at different moments of the scan, so one of them lands mid-scan.
    for (let ticks = 0; ticks < 40; ticks += 2) {
      const scan = fresh.list()
      for (let t = 0; t < ticks; t++) await new Promise((r) => setImmediate(r))
      await Promise.all([scan, fresh.save(song('id-7', 'Píseň 7', `[G]Upraveno ${ticks}`))])
    }
    const files = readdirSync(songsDir).filter((n) => n.endsWith('.chordpro'))
    expect(files).toHaveLength(60)
    const list = await fresh.list()
    expect(list).toHaveLength(60)
    expect(list.find((s) => s.id === 'id-7')?.content).toContain('Upraveno 38')
  })
})

describe('SongsRepo – hand-dropped files', () => {
  it('reads a Windows-1250 file correctly and stores it back as UTF-8', async () => {
    const { songs, songsDir } = setup()
    await songs.list()
    // "{title: Žluťoučký kůň}\nPěl ďábelské ódy" in Windows-1250
    const cp1250 = Buffer.from([
      0x7b, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x3a, 0x20, 0x8e, 0x6c, 0x75, 0x9d, 0x6f, 0x75, 0xe8, 0x6b, 0xfd,
      0x20, 0x6b, 0xf9, 0xf2, 0x7d, 0x0a, 0x50, 0xec, 0x6c, 0x20, 0xef, 0xe1, 0x62, 0x65, 0x6c, 0x73, 0x6b,
      0xe9, 0x20, 0xf3, 0x64, 0x79, 0x0a
    ])
    writeFileSync(join(songsDir, 'stara.cho'), cp1250)
    const [file] = await songs.list()
    expect(file?.content).toContain('{title: Žluťoučký kůň}')
    expect(file?.content).toContain('Pěl ďábelské ódy')
    expect(readFileSync(join(songsDir, 'stara.cho'), 'utf8')).toContain('Pěl ďábelské ódy')
  })

  it('reads files with Windows line endings without losing their identity', async () => {
    const { songs, songsDir } = setup()
    await songs.list()
    writeFileSync(join(songsDir, 'crlf.chordpro'), '{title: Okno}\r\n{x_id: crlf-1}\r\n\r\nText\r\n')
    const list = await songs.list()
    expect(list.map((s) => s.id)).toEqual(['crlf-1'])
  })
})

describe('SongsRepo – edits outside the app', () => {
  it('keeps the timestamp of files it wrote itself', async () => {
    const { songs } = setup()
    await songs.save(song('a1', 'Píseň'))
    const [file] = await new SongsRepo(
      songs.folder,
      join(songs.folder, '..', 'trash'),
      new TombstoneStore(join(songs.folder, '..', 't2.json'))
    ).list()
    expect(file?.updatedAt).toBe('2026-10-01T10:00:00.000Z')
  })

  it('gives a file edited by hand a new timestamp so the edit syncs', async () => {
    const { songs, songsDir } = setup()
    await songs.save(song('a1', 'Píseň'))
    const path = join(songsDir, 'pisen.chordpro')
    writeFileSync(path, readFileSync(path, 'utf8').replace('[G]Text', '[G]Text opravený'))
    const before = Date.now()
    const [file] = await songs.list()
    expect(Date.parse(file!.updatedAt)).toBeGreaterThan(before - 5000)
    expect(file?.content).toContain(`{x_updated: ${file!.updatedAt}}`)
    expect(file?.content).toContain('Text opravený')
  })
})
