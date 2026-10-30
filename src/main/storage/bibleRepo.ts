import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import type { BibleData, BibleTranslationInfo } from '@core/bible/model'
import { parseBibleXml } from '@core/bible/formats'
import { slugify } from '@core/util/slug'
import { ensureDir, readJson, writeFileAtomic } from './fsUtil'

const gunzipAsync = promisify(gunzip)
const gzipAsync = promisify(gzip)

const SUFFIX = '.json.gz'
const SAFE_ID = /^[\w-]+$/

function isBibleData(value: unknown): value is BibleData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.name === 'string' && Array.isArray(v.books)
}

function infoOf(data: BibleData, builtIn: boolean): BibleTranslationInfo {
  const info: BibleTranslationInfo = {
    id: data.id,
    name: data.name,
    abbreviation: data.abbreviation,
    language: data.language,
    builtIn
  }
  if (data.license) info.license = data.license
  if (data.source) info.source = data.source
  return info
}

/**
 * Bible translations: read-only bundled ones (`<bundledDir>/index.json` + `<id>.json.gz`) and
 * translations imported by the user (`<userDir>/<id>.json.gz`, the same compact JSON gzipped).
 */
export class BibleRepo {
  private readonly data = new Map<string, BibleData>()
  private readonly importedInfo = new Map<string, BibleTranslationInfo>()
  private bundled: BibleTranslationInfo[] | null = null

  constructor(
    private readonly bundledDir: string,
    private readonly userDir: string
  ) {}

  async list(): Promise<BibleTranslationInfo[]> {
    const bundled = await this.bundledList()
    const imported = await this.importedList()
    return [...bundled, ...imported].map((t) => ({ ...t }))
  }

  /** Full text of a translation (cached in memory after the first load). */
  async load(id: string): Promise<BibleData> {
    const cached = this.data.get(id)
    if (cached) return cached
    if (!SAFE_ID.test(id)) throw new Error(`Invalid Bible id: ${id}`)
    const builtIn = (await this.bundledList()).some((t) => t.id === id)
    const file = join(builtIn ? this.bundledDir : this.userDir, `${id}${SUFFIX}`)
    const data = await this.readGz(file)
    data.id = id
    this.data.set(id, data)
    return data
  }

  /**
   * Import a Zefania / OSIS / USFX file. Throws BibleFormatError for unusable files. The id never
   * collides with a bundled or an already imported translation (`en-kjv` → `en-kjv-2` …).
   */
  async import(fileName: string, xml: string): Promise<BibleTranslationInfo> {
    const data = parseBibleXml(fileName, xml)
    const taken = new Set([
      ...(await this.bundledList()).map((t) => t.id),
      ...(await this.importedList()).map((t) => t.id)
    ])
    const base = SAFE_ID.test(data.id) ? data.id : slugify(data.id || data.name)
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    data.id = id
    await ensureDir(this.userDir)
    await writeFileAtomic(join(this.userDir, `${id}${SUFFIX}`), await gzipAsync(JSON.stringify(data)))
    const info = infoOf(data, false)
    this.data.set(id, data)
    this.importedInfo.set(id, info)
    return { ...info }
  }

  /** Remove an imported translation. Bundled translations cannot be removed. */
  async remove(id: string): Promise<void> {
    if ((await this.bundledList()).some((t) => t.id === id)) {
      throw new Error(`Built-in translation ${id} cannot be removed`)
    }
    if (!SAFE_ID.test(id)) return
    await rm(join(this.userDir, `${id}${SUFFIX}`), { force: true })
    this.data.delete(id)
    this.importedInfo.delete(id)
  }

  private async bundledList(): Promise<BibleTranslationInfo[]> {
    if (!this.bundled) {
      const raw = await readJson<unknown>(join(this.bundledDir, 'index.json'), [])
      const rows = Array.isArray(raw) ? (raw as Array<Partial<BibleTranslationInfo> | null>) : []
      this.bundled = rows
        .filter((t): t is BibleTranslationInfo => typeof t?.id === 'string' && SAFE_ID.test(t.id))
        .map((t) => ({ ...t, builtIn: true }))
    }
    return this.bundled
  }

  /** Imported translations; metadata is read once per file and kept in memory. */
  private async importedList(): Promise<BibleTranslationInfo[]> {
    let names: string[]
    try {
      names = await readdir(this.userDir)
    } catch {
      return []
    }
    const bundledIds = new Set((await this.bundledList()).map((t) => t.id))
    const out: BibleTranslationInfo[] = []
    for (const name of names.filter((n) => n.endsWith(SUFFIX)).sort()) {
      const id = name.slice(0, -SUFFIX.length)
      if (!SAFE_ID.test(id) || bundledIds.has(id)) continue
      let info = this.importedInfo.get(id)
      if (!info) {
        try {
          const data = await this.readGz(join(this.userDir, name))
          data.id = id
          info = infoOf(data, false)
          this.importedInfo.set(id, info)
        } catch (err) {
          console.error('[bible] skipping unreadable translation', name, err)
          continue
        }
      }
      out.push(info)
    }
    return out
  }

  private async readGz(file: string): Promise<BibleData> {
    const json = (await gunzipAsync(await readFile(file))).toString('utf8')
    const value: unknown = JSON.parse(json)
    if (!isBibleData(value)) throw new Error(`Not a Bible file: ${file}`)
    return value
  }
}
