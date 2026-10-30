import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { BackupError, createBackupZip, restoreBackupZip } from './backup'

const SONG_A =
  '{title: Svítá den}\n{x_id: song-a}\n\n{start_of_verse: V1}\n[G]Svítá den a [D]ptáci zpívají\n{end_of_verse}\n'
const SONG_B =
  '{title: Večerní píseň}\n{x_id: song-b}\n\n{start_of_verse: V1}\n[C]Den se chýlí\n{end_of_verse}\n'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

interface Fixture {
  root: string
  libraryDir: string
  settingsFile: string
  backupsDir: string
}

function write(path: string, data: string | Uint8Array): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, data)
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

/** A small but complete library: 1 song, 1 plan, 1 user theme, 1 media file, secrets in settings. */
function setup(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'promitac-backup-'))
  const libraryDir = join(root, 'library')
  const settingsFile = join(root, 'settings.json')
  const backupsDir = join(root, 'backups')
  write(join(libraryDir, 'songs', 'svita-den.chordpro'), SONG_A)
  write(join(libraryDir, 'plans', 'plan-1.json'), json({ id: 'plan-1', title: 'Neděle', items: [] }))
  write(join(libraryDir, 'themes', 'theme-1.json'), json({ id: 'theme-1', name: 'Tmavý' }))
  write(join(libraryDir, 'tombstones.json'), json({ songs: { gone: '2026-01-01T00:00:00.000Z' } }))
  write(
    join(libraryDir, 'media.json'),
    json([{ id: 'm1', name: 'Logo', kind: 'image', fileName: 'm1-logo.png', size: PNG.length }])
  )
  write(join(libraryDir, 'media', 'm1-logo.png'), PNG)
  write(join(libraryDir, 'trash', 'old.chordpro'), SONG_B)
  write(
    settingsFile,
    json({
      linesPerSlide: 3,
      deviceName: 'Notebook u pultu',
      uiTheme: 'dark',
      supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-secret' },
      aiApiKey: 'gemini-secret-1234',
      aiProvider: 'gemini'
    })
  )
  return { root, libraryDir, settingsFile, backupsDir }
}

function readJsonFile(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function manifestZip(extra: Record<string, Uint8Array>): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(
      JSON.stringify({ app: 'promitac', version: 1, createdAt: '2026-10-01T10:00:00.000Z', counts: {} })
    ),
    ...extra
  })
}

/** Snapshot of every file below a folder (relative path → content), to prove nothing changed. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string, prefix: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) walk(join(d, e.name), rel)
      else out[rel] = readFileSync(join(d, e.name)).toString('base64')
    }
  }
  walk(dir, '')
  return out
}

describe('createBackupZip', () => {
  it('packs the library with a manifest and counts', async () => {
    const f = setup()
    const zip = await createBackupZip(f.libraryDir, f.settingsFile, { includeMedia: true })
    const files = unzipSync(zip)
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>
    expect(manifest).toMatchObject({
      app: 'promitac',
      version: 1,
      includeMedia: true,
      counts: { songs: 1, plans: 1, themes: 1, media: 1 }
    })
    expect(Date.parse(String(manifest.createdAt))).not.toBeNaN()
    expect(strFromU8(files['songs/svita-den.chordpro']!)).toBe(SONG_A)
    expect(files['plans/plan-1.json']).toBeDefined()
    expect(files['themes/theme-1.json']).toBeDefined()
    expect(files['tombstones.json']).toBeDefined()
    expect(files['media.json']).toBeDefined()
    expect(Array.from(files['media/m1-logo.png']!)).toEqual(Array.from(PNG))
    // The trash folder is not part of a backup.
    expect(Object.keys(files).some((k) => k.startsWith('trash'))).toBe(false)
  })

  it('never exports secrets (Supabase config, AI key)', async () => {
    const f = setup()
    const zip = await createBackupZip(f.libraryDir, f.settingsFile, { includeMedia: false })
    const files = unzipSync(zip)
    const raw = strFromU8(files['settings.json']!)
    const settings = JSON.parse(raw) as Record<string, unknown>
    expect(settings.linesPerSlide).toBe(3)
    expect(settings).not.toHaveProperty('supabase')
    expect(settings).not.toHaveProperty('aiApiKey')
    for (const secret of ['anon-secret', 'gemini-secret-1234', 'abc.supabase.co']) {
      expect(raw).not.toContain(secret)
    }
  })

  it('leaves media files out unless asked, but keeps the media list', async () => {
    const f = setup()
    const files = unzipSync(await createBackupZip(f.libraryDir, f.settingsFile, { includeMedia: false }))
    expect(Object.keys(files).filter((k) => k.startsWith('media/'))).toEqual([])
    expect(files['media.json']).toBeDefined()
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>
    expect(manifest.includeMedia).toBe(false)
  })

  it('works for an empty, fresh data folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'promitac-backup-empty-'))
    const zip = await createBackupZip(join(root, 'library'), join(root, 'settings.json'), {
      includeMedia: true
    })
    const files = unzipSync(zip)
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>
    expect(manifest.counts).toEqual({ songs: 0, plans: 0, themes: 0, media: 0 })
  })
})

describe('restoreBackupZip', () => {
  it('round trip: restores the library, keeps secrets and saves the current state first', async () => {
    const f = setup()
    const zip = await createBackupZip(f.libraryDir, f.settingsFile, { includeMedia: true })

    // The user keeps working: a new song, an edited plan, a deleted theme, new settings + keys.
    write(join(f.libraryDir, 'songs', 'vecerni-pisen.chordpro'), SONG_B)
    write(join(f.libraryDir, 'plans', 'plan-1.json'), json({ id: 'plan-1', title: 'Změněno', items: [] }))
    write(join(f.libraryDir, 'themes', 'theme-1.json'), json({ id: 'theme-1', name: 'Jiný' }))
    write(join(f.libraryDir, 'media', 'm2-new.png'), PNG)
    write(
      f.settingsFile,
      json({
        linesPerSlide: 6,
        deviceName: 'Nový počítač',
        supabase: { url: 'https://new.supabase.co', anonKey: 'new-anon' },
        aiApiKey: 'new-ai-key-9876'
      })
    )

    const counts = await restoreBackupZip(zip, f.libraryDir, f.settingsFile, f.backupsDir)
    expect(counts).toEqual({ songs: 1, plans: 1, themes: 1, media: 1 })

    expect(readdirSync(join(f.libraryDir, 'songs'))).toEqual(['svita-den.chordpro'])
    expect(readFileSync(join(f.libraryDir, 'songs', 'svita-den.chordpro'), 'utf8')).toBe(SONG_A)
    expect(readJsonFile(join(f.libraryDir, 'plans', 'plan-1.json')).title).toBe('Neděle')
    expect(readJsonFile(join(f.libraryDir, 'themes', 'theme-1.json')).name).toBe('Tmavý')
    expect(readdirSync(join(f.libraryDir, 'media'))).toEqual(['m1-logo.png'])
    expect(readJsonFile(join(f.libraryDir, 'tombstones.json'))).toEqual({
      songs: { gone: '2026-01-01T00:00:00.000Z' }
    })
    // Trash is left alone and no staging folders remain.
    expect(existsSync(join(f.libraryDir, 'trash', 'old.chordpro'))).toBe(true)
    expect(readdirSync(f.libraryDir).filter((n) => n.startsWith('.'))).toEqual([])

    const settings = readJsonFile(f.settingsFile)
    expect(settings.linesPerSlide).toBe(3)
    // Secrets and the device name belong to this computer.
    expect(settings.supabase).toEqual({ url: 'https://new.supabase.co', anonKey: 'new-anon' })
    expect(settings.aiApiKey).toBe('new-ai-key-9876')
    expect(settings.deviceName).toBe('Nový počítač')

    // The state just before the restore was saved as a backup of its own.
    const saved = readdirSync(f.backupsDir)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatch(/^pred-obnovou-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/)
    const before = unzipSync(readFileSync(join(f.backupsDir, saved[0]!)))
    expect(strFromU8(before['songs/vecerni-pisen.chordpro']!)).toBe(SONG_B)
    expect(before['media/m2-new.png']).toBeDefined()
    expect(strFromU8(before['settings.json']!)).not.toContain('new-ai-key-9876')
  })

  it('keeps the media folder when the backup was made without media', async () => {
    const f = setup()
    const zip = await createBackupZip(f.libraryDir, f.settingsFile, { includeMedia: false })
    write(join(f.libraryDir, 'media', 'm2-new.png'), PNG)
    const mediaJsonBefore = readFileSync(join(f.libraryDir, 'media.json'), 'utf8')
    const counts = await restoreBackupZip(zip, f.libraryDir, f.settingsFile, f.backupsDir)
    expect(counts.media).toBe(0)
    expect(readdirSync(join(f.libraryDir, 'media')).sort()).toEqual(['m1-logo.png', 'm2-new.png'])
    expect(readFileSync(join(f.libraryDir, 'media.json'), 'utf8')).toBe(mediaJsonBefore)
  })

  it('rejects a file that is not a zip and touches nothing', async () => {
    const f = setup()
    const before = snapshot(f.root)
    await expect(
      restoreBackupZip(new Uint8Array([1, 2, 3, 4, 5]), f.libraryDir, f.settingsFile, f.backupsDir)
    ).rejects.toMatchObject({ code: 'invalid-zip' })
    expect(snapshot(f.root)).toEqual(before)
    expect(existsSync(f.backupsDir)).toBe(false)
  })

  it('rejects a zip without a valid Promítač manifest and touches nothing', async () => {
    const f = setup()
    const before = snapshot(f.root)
    const noManifest = zipSync({ 'songs/x.chordpro': strToU8(SONG_B) })
    await expect(restoreBackupZip(noManifest, f.libraryDir, f.settingsFile, f.backupsDir)).rejects.toThrow(
      BackupError
    )
    const otherApp = zipSync({
      'manifest.json': strToU8(JSON.stringify({ app: 'other', version: 1 })),
      'songs/x.chordpro': strToU8(SONG_B)
    })
    await expect(
      restoreBackupZip(otherApp, f.libraryDir, f.settingsFile, f.backupsDir)
    ).rejects.toMatchObject({ code: 'not-a-backup' })
    const broken = zipSync({ 'manifest.json': strToU8('{not json') })
    await expect(restoreBackupZip(broken, f.libraryDir, f.settingsFile, f.backupsDir)).rejects.toMatchObject({
      code: 'not-a-backup'
    })
    const future = zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'promitac', version: 99 })) })
    await expect(restoreBackupZip(future, f.libraryDir, f.settingsFile, f.backupsDir)).rejects.toMatchObject({
      code: 'unsupported-version'
    })
    expect(snapshot(f.root)).toEqual(before)
  })

  it.each([
    ['../evil.txt'],
    ['songs/../../evil.chordpro'],
    ['songs/..\\..\\evil.chordpro'],
    ['/tmp/evil.chordpro'],
    ['C:/evil.chordpro'],
    ['media/C:evil.png']
  ])('rejects a zip-slip entry %s and writes nothing anywhere', async (entry) => {
    const f = setup()
    const before = snapshot(f.root)
    const zip = manifestZip({ 'songs/ok.chordpro': strToU8(SONG_B), [entry]: strToU8('evil') })
    await expect(restoreBackupZip(zip, f.libraryDir, f.settingsFile, f.backupsDir)).rejects.toMatchObject({
      code: 'unsafe-path'
    })
    expect(snapshot(f.root)).toEqual(before)
    expect(existsSync(join(f.root, 'evil.txt'))).toBe(false)
    expect(existsSync(join(f.root, 'evil.chordpro'))).toBe(false)
  })

  it('ignores unknown and hidden entries from other zip tools', async () => {
    const f = setup()
    const zip = manifestZip({
      'songs/nova.chordpro': strToU8(SONG_B),
      'songs/.DS_Store': strToU8('junk'),
      '__MACOSX/songs/._nova.chordpro': strToU8('junk'),
      'README.txt': strToU8('hello')
    })
    const counts = await restoreBackupZip(zip, f.libraryDir, f.settingsFile, f.backupsDir)
    expect(counts.songs).toBe(1)
    expect(readdirSync(join(f.libraryDir, 'songs'))).toEqual(['nova.chordpro'])
    expect(existsSync(join(f.libraryDir, 'README.txt'))).toBe(false)
    expect(existsSync(join(f.libraryDir, '__MACOSX'))).toBe(false)
    // No settings.json in the backup → current settings stay as they are.
    expect(readJsonFile(f.settingsFile).linesPerSlide).toBe(3)
  })
})
