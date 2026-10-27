import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaRepo } from './mediaRepo'
import { TombstoneStore } from './tombstones'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function setup(maxSyncBytes?: number) {
  const root = mkdtempSync(join(tmpdir(), 'promitac-media-'))
  const dir = join(root, 'media')
  const indexFile = join(root, 'media.json')
  const tombstones = new TombstoneStore(join(root, 'tombstones.json'))
  const repo = new MediaRepo(dir, indexFile, tombstones, maxSyncBytes ? { maxSyncBytes } : {})
  const write = (name: string, bytes: Uint8Array | string): string => {
    const path = join(root, name)
    writeFileSync(path, bytes)
    return path
  }
  return { root, dir, indexFile, tombstones, repo, write }
}

describe('MediaRepo', () => {
  it('copies imported files as <id><ext> and keeps the original name', async () => {
    const { repo, dir, write } = setup()
    const path = write('Velikonoce 2026.PNG', PNG)
    const [item] = await repo.importPaths([path])
    expect(item).toMatchObject({
      name: 'Velikonoce 2026',
      kind: 'image',
      mime: 'image/png',
      size: PNG.byteLength,
      localOnly: false
    })
    expect(item!.fileName).toBe(`${item!.id}.png`)
    expect(readdirSync(dir)).toEqual([item!.fileName])
    expect(readFileSync(join(dir, item!.fileName))).toEqual(Buffer.from(PNG))
    expect(Number.isNaN(Date.parse(item!.updatedAt))).toBe(false)
    expect(await repo.list()).toEqual([item])
  })

  it('detects videos and skips unsupported or missing files', async () => {
    const { repo, write, root } = setup()
    const video = write('smycka.webm', 'webm-bytes')
    const text = write('poznamky.txt', 'hello')
    const added = await repo.importPaths([text, video, join(root, 'missing.jpg'), root])
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ name: 'smycka', kind: 'video', mime: 'video/webm' })
  })

  it('imports buffers (ArrayBuffer and Uint8Array) and skips unsupported names', async () => {
    const { repo, dir } = setup()
    const added = await repo.importBuffers([
      { name: 'logo.webp', data: PNG.slice().buffer },
      { name: 'clip.MOV', data: Uint8Array.from([1, 2, 3]) },
      { name: 'archive.zip', data: new ArrayBuffer(4) }
    ])
    expect(added.map((m) => [m.name, m.kind, m.mime, m.size])).toEqual([
      ['logo', 'image', 'image/webp', PNG.byteLength],
      ['clip', 'video', 'video/quicktime', 3]
    ])
    expect(readdirSync(dir).sort()).toEqual(added.map((m) => m.fileName).sort())
    expect(added[1]!.fileName.endsWith('.mov')).toBe(true)
  })

  it('flags files above the sync limit as local only and keeps them local on update', async () => {
    const { repo, write } = setup(8)
    const small = write('small.jpg', Uint8Array.from([1, 2, 3]))
    const large = write('large.mp4', new Uint8Array(9))
    const [s, l] = await repo.importPaths([small, large])
    expect(s!.localOnly).toBe(false)
    expect(l!.localOnly).toBe(true)
    await repo.update({ ...l!, localOnly: false })
    await repo.update({ ...s!, localOnly: true })
    const list = await repo.list()
    expect(list.find((m) => m.id === l!.id)!.localOnly).toBe(true)
    expect(list.find((m) => m.id === s!.id)!.localOnly).toBe(true)
  })

  it('updates only editable fields and persists the index', async () => {
    const { repo, write, dir, indexFile, tombstones } = setup()
    const [item] = await repo.importPaths([write('a.png', PNG)])
    await repo.update({
      ...item!,
      name: '  Logo sboru  ',
      fileName: '../../evil.png',
      size: 1,
      kind: 'video',
      updatedAt: '2026-10-27T10:00:00.000Z'
    })
    await repo.update({ ...item!, id: 'unknown', name: 'Ignored' })
    const fresh = new MediaRepo(dir, indexFile, tombstones)
    expect(await fresh.list()).toEqual([
      { ...item!, name: 'Logo sboru', updatedAt: '2026-10-27T10:00:00.000Z' }
    ])
  })

  it('removes the file and index entry and records a tombstone', async () => {
    const { repo, write, dir, tombstones } = setup()
    const [a, b] = await repo.importPaths([write('a.png', PNG), write('b.png', PNG)])
    await repo.remove(a!.id, '2026-10-27T12:00:00.000Z')
    expect(readdirSync(dir)).toEqual([b!.fileName])
    expect((await repo.list()).map((m) => m.id)).toEqual([b!.id])
    expect((await tombstones.all()).media).toEqual({ [a!.id]: '2026-10-27T12:00:00.000Z' })
  })

  it('hides entries whose file is missing but keeps them in the index until removed', async () => {
    const { repo, write, dir, indexFile } = setup()
    const [a, b] = await repo.importPaths([write('a.png', PNG), write('b.png', PNG)])
    rmSync(join(dir, a!.fileName))
    expect((await repo.list()).map((m) => m.id)).toEqual([b!.id])
    const index = JSON.parse(readFileSync(indexFile, 'utf8')) as Array<{ id: string }>
    expect(index.map((m) => m.id)).toEqual([a!.id, b!.id])
    writeFileSync(join(dir, a!.fileName), PNG)
    expect((await repo.list()).map((m) => m.id)).toEqual([a!.id, b!.id])
  })

  it('serialises concurrent imports so no entry is lost', async () => {
    const { repo, write, dir, indexFile, tombstones } = setup()
    const paths = Array.from({ length: 6 }, (_, i) => write(`img-${i}.jpg`, PNG))
    await Promise.all(paths.map((p) => repo.importPaths([p])))
    const fresh = new MediaRepo(dir, indexFile, tombstones)
    expect((await fresh.list()).map((m) => m.name).sort()).toEqual(paths.map((_, i) => `img-${i}`).sort())
  })

  it('survives a corrupt or foreign index file', async () => {
    const { repo, indexFile, root } = setup()
    writeFileSync(indexFile, '{ not json')
    expect(await repo.list()).toEqual([])
    expect(readdirSync(root).some((n) => n.startsWith('media.json.corrupt-'))).toBe(true)

    const other = setup()
    writeFileSync(other.indexFile, JSON.stringify([{ id: 'x', fileName: '../secret' }, 42]))
    expect(await other.repo.list()).toEqual([])
    expect(existsSync(other.indexFile)).toBe(true)
  })
})

describe('MediaRepo sync helpers', () => {
  it('put() stores a remote entry, the file can be written later and is then listed', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { MediaRepo } = await import('./mediaRepo')
    const { TombstoneStore } = await import('./tombstones')
    const root = mkdtempSync(join(tmpdir(), 'promitac-media-sync-'))
    const repo = new MediaRepo(
      join(root, 'media'),
      join(root, 'media.json'),
      new TombstoneStore(join(root, 't.json'))
    )
    const item = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Logo',
      kind: 'image' as const,
      fileName: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
      mime: 'image/png',
      size: 3,
      localOnly: false,
      updatedAt: '2026-10-01T00:00:00.000Z',
      storagePath: 'org/aaaaaaaa-logo.png'
    }
    await repo.put(item)
    expect(await repo.list()).toEqual([])
    expect((await repo.all())[0]?.storagePath).toBe('org/aaaaaaaa-logo.png')
    expect(await repo.hasFile(item)).toBe(false)
    await repo.writeFile(item, new Uint8Array([1, 2, 3]))
    expect(await repo.hasFile(item)).toBe(true)
    expect(Array.from(await repo.readFile(item))).toEqual([1, 2, 3])
    expect((await repo.list()).map((m) => m.id)).toEqual([item.id])
    await expect(repo.writeFile({ fileName: '../evil.png' }, new Uint8Array())).rejects.toThrow()
  })
})
