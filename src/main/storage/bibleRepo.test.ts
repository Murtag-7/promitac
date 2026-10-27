import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { BibleFormatError } from '@core/bible/formats'
import type { BibleData } from '@core/bible/model'
import { BibleRepo } from './bibleRepo'

const FIXTURES = resolve(process.cwd(), 'tests/fixtures/bible')
const zefania = readFileSync(join(FIXTURES, 'zefania-kjv.xml'), 'utf8')
const usfx = readFileSync(join(FIXTURES, 'usfx-bkr.xml'), 'utf8')

const tinyBkr: BibleData = {
  id: 'cs-bkr',
  name: 'Bible kralická (1613)',
  abbreviation: 'BKR',
  language: 'cs',
  books: [{ id: 'JHN', chapters: [[], [], ['a', 'b']] }]
}

/** Bundled dir with one translation whose id collides with the imported KJV fixture ("en-kjv"). */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'promitac-bible-'))
  const bundledDir = join(root, 'bundled')
  const userDir = join(root, 'user')
  mkdirSync(bundledDir)
  writeFileSync(
    join(bundledDir, 'index.json'),
    JSON.stringify([
      { id: 'cs-bkr', name: 'Bible kralická (1613)', abbreviation: 'BKR', language: 'cs', builtIn: true },
      { id: 'en-kjv', name: 'King James Version', abbreviation: 'KJV', language: 'en', builtIn: true }
    ])
  )
  writeFileSync(join(bundledDir, 'cs-bkr.json.gz'), gzipSync(JSON.stringify(tinyBkr)))
  return { root, bundledDir, userDir, repo: new BibleRepo(bundledDir, userDir) }
}

describe('BibleRepo', () => {
  it('lists bundled translations as built-in when nothing is imported', async () => {
    const { repo } = setup()
    expect(await repo.list()).toEqual([
      { id: 'cs-bkr', name: 'Bible kralická (1613)', abbreviation: 'BKR', language: 'cs', builtIn: true },
      { id: 'en-kjv', name: 'King James Version', abbreviation: 'KJV', language: 'en', builtIn: true }
    ])
  })

  it('loads a bundled translation from gzip and caches it', async () => {
    const { repo } = setup()
    const data = await repo.load('cs-bkr')
    expect(data.books[0]!.chapters[2]).toEqual(['a', 'b'])
    expect(await repo.load('cs-bkr')).toBe(data)
  })

  it('imports a file with an id that never collides with bundled or earlier imports', async () => {
    const { repo, userDir } = setup()
    const first = await repo.import('kjv.xml', zefania)
    const second = await repo.import('kjv.xml', zefania)
    expect(first).toMatchObject({ id: 'en-kjv-2', abbreviation: 'KJV', language: 'en', builtIn: false })
    expect(second.id).toBe('en-kjv-3')
    expect(readdirSync(userDir).sort()).toEqual(['en-kjv-2.json.gz', 'en-kjv-3.json.gz'])
    const ids = (await repo.list()).map((t) => [t.id, t.builtIn])
    expect(ids).toEqual([
      ['cs-bkr', true],
      ['en-kjv', true],
      ['en-kjv-2', false],
      ['en-kjv-3', false]
    ])
  })

  it('stores imports as gzip JSON that round-trips through a fresh repo', async () => {
    const { repo, bundledDir, userDir } = setup()
    const info = await repo.import('Moje Bible.usfx.xml', usfx)
    const raw = JSON.parse(gunzipSync(readFileSync(join(userDir, `${info.id}.json.gz`))).toString('utf8'))
    expect(raw.id).toBe(info.id)

    const fresh = new BibleRepo(bundledDir, userDir)
    const listed = (await fresh.list()).find((t) => t.id === info.id)
    expect(listed).toEqual(info)
    const loaded = await fresh.load(info.id)
    expect(loaded).toEqual(await repo.load(info.id))
    expect(loaded.books.find((b) => b.id === 'GEN')!.chapters[0]![0]).toMatch(/^Na počátk/)
  })

  it('rejects files that are not Bibles with a coded BibleFormatError', async () => {
    const { repo, userDir } = setup()
    const err = await repo.import('song.xml', '<song><title>x</title></song>').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BibleFormatError)
    expect((err as BibleFormatError).code).toBe('unknown-format')
    const bad = await repo.import('broken.xml', '').catch((e: unknown) => e)
    expect(bad).toBeInstanceOf(BibleFormatError)
    expect(() => readdirSync(userDir)).toThrow()
  })

  it('removes imported translations but never bundled ones', async () => {
    const { repo, userDir } = setup()
    const info = await repo.import('kjv.xml', zefania)
    await repo.remove(info.id)
    expect(readdirSync(userDir)).toEqual([])
    expect((await repo.list()).map((t) => t.id)).toEqual(['cs-bkr', 'en-kjv'])
    await expect(repo.load(info.id)).rejects.toThrow()
    await expect(repo.remove('cs-bkr')).rejects.toThrow(/cannot be removed/)
  })

  it('ignores unreadable or unsafe files in the user folder and invalid ids', async () => {
    const { repo, userDir } = setup()
    mkdirSync(userDir)
    writeFileSync(join(userDir, 'broken.json.gz'), 'not gzip')
    writeFileSync(join(userDir, 'en-kjv.json.gz'), gzipSync(JSON.stringify(tinyBkr)))
    writeFileSync(join(userDir, 'notes.txt'), 'x')
    expect((await repo.list()).map((t) => t.id)).toEqual(['cs-bkr', 'en-kjv'])
    await expect(repo.load('../bundled/cs-bkr')).rejects.toThrow(/Invalid Bible id/)
  })

  it('reads the real bundled translations shipped in resources/bibles', async () => {
    const userDir = mkdtempSync(join(tmpdir(), 'promitac-bible-user-'))
    const repo = new BibleRepo(resolve(process.cwd(), 'resources/bibles'), userDir)
    const list = await repo.list()
    expect(list.map((t) => [t.id, t.abbreviation, t.builtIn])).toEqual([
      ['cs-bkr', 'BKR', true],
      ['en-kjv', 'KJV', true]
    ])
    const imported = await repo.import('kjv.xml', zefania)
    expect(imported.id).toBe('en-kjv-2')
    const bkr = await repo.load('cs-bkr')
    expect(bkr.books.find((b) => b.id === 'JHN')!.chapters[2]![15]).toMatch(/^Nebo tak Bůh miloval svět/)
  })
})
