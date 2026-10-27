import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CollectionRepo } from './collectionRepo'
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
