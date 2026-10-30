import { SyncEngine } from './engine'
import { AUTH_EXPIRED_MESSAGE, OFFLINE_MESSAGE, SyncRemoteError } from './errors'
import type { SyncRecord, SyncTable } from './model'
import { SEED_UPDATED_AT, SYNC_TABLES, emptySyncState, withoutPullCursors } from './model'
import { MemoryLocal, MemoryRemote } from './testing'

const T0 = '2026-10-27T08:00:00.000Z'

function at(minutes: number, base = T0): string {
  return new Date(Date.parse(base) + minutes * 60_000).toISOString()
}

const SONG_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'

function song(
  id: string,
  title: string,
  updatedAt: string,
  opts: { deleted?: boolean; updatedBy?: string; body?: string } = {}
): SyncRecord {
  const body = opts.body ?? '[G]Sláva na výsostech'
  return {
    table: 'songs',
    id,
    updatedAt,
    deleted: opts.deleted ?? false,
    updatedBy: opts.updatedBy ?? '',
    data: { title, content: `{title: ${title}}\n{x_id: ${id}}\n${body}` }
  }
}

function plan(id: string, title: string, updatedAt: string, deleted = false): SyncRecord {
  return {
    table: 'plans',
    id,
    updatedAt,
    deleted,
    updatedBy: '',
    data: { id, title, date: '2026-11-01', isTemplate: false, items: [], updatedAt }
  }
}

function titleOf(r: SyncRecord | undefined): string | undefined {
  return (r?.data as { title?: string } | undefined)?.title
}

/** A computer with its own local store and clock, talking to a shared remote. */
function device(remote: MemoryRemote, name: string, clock: { now: string }) {
  const local = new MemoryLocal()
  const engine = new SyncEngine({ remote, local, deviceName: name, now: () => clock.now })
  return { local, engine, name }
}

/** Content-only view of a local store, comparable across devices. */
function snapshot(local: MemoryLocal, table: SyncTable) {
  return local.records(table).map((r) => ({ id: r.id, deleted: r.deleted, data: r.data }))
}

describe('emptySyncState', () => {
  it('has a null cursor for every table and no base', () => {
    const s = emptySyncState()
    expect(Object.keys(s.cursors).sort()).toEqual([...SYNC_TABLES].sort())
    expect(Object.values(s.cursors).every((c) => c === null)).toBe(true)
    expect(s.base).toEqual({})
    expect(s.lastSyncedAt).toBeNull()
  })
})

describe('SyncEngine', () => {
  let remote: MemoryRemote
  let clock: { now: string }

  beforeEach(() => {
    remote = new MemoryRemote()
    clock = { now: T0 }
  })

  it('pushes local records on the first sync and stamps them with the device name', async () => {
    const a = device(remote, 'Kancelář', clock)
    a.local.put(song(SONG_ID, 'Milost', at(-10)))
    a.local.put(plan(PLAN_ID, 'Neděle', at(-5)))

    const r = await a.engine.syncOnce()

    expect(r).toMatchObject({ status: 'synced', pushed: 2, pulled: 0, conflicts: 0, at: T0 })
    expect(remote.all('songs')).toEqual([{ ...song(SONG_ID, 'Milost', at(-10)), updatedBy: 'Kancelář' }])
    expect(remote.all('plans')).toHaveLength(1)
    expect(a.local.state.base[`songs:${SONG_ID}`]).toBe(at(-10))
    expect(a.local.state.lastSyncedAt).toBe(T0)
  })

  it('is idempotent: a second run pulls and pushes nothing', async () => {
    const a = device(remote, 'A', clock)
    a.local.put(song(SONG_ID, 'Milost', at(-10)))
    await a.engine.syncOnce()
    const applyCallsBefore = a.local.applyCalls.length
    const pushCallsBefore = remote.pushCalls.length

    const r = await a.engine.syncOnce()

    expect(r).toMatchObject({ status: 'synced', pulled: 0, pushed: 0, conflicts: 0 })
    expect(a.local.applyCalls.length).toBe(applyCallsBefore)
    expect(remote.pushCalls.length).toBe(pushCallsBefore)
  })

  it('pulls records created on another computer', async () => {
    const a = device(remote, 'A', clock)
    const b = device(remote, 'B', clock)
    a.local.put(song(SONG_ID, 'Milost', at(-10)))
    await a.engine.syncOnce()

    const r = await b.engine.syncOnce()

    expect(r).toMatchObject({ status: 'synced', pulled: 1, pushed: 0 })
    expect(titleOf(b.local.get('songs', SONG_ID))).toBe('Milost')
    expect((await b.engine.syncOnce()).pulled).toBe(0)
  })

  it('applies a remote edit when the local record is unchanged', async () => {
    const a = device(remote, 'A', clock)
    const b = device(remote, 'B', clock)
    a.local.put(song(SONG_ID, 'Milost', at(-10)))
    await a.engine.syncOnce()
    await b.engine.syncOnce()

    b.local.put(song(SONG_ID, 'Milost (upraveno)', at(1)))
    await b.engine.syncOnce()
    const r = await a.engine.syncOnce()

    expect(r).toMatchObject({ pulled: 1, pushed: 0, conflicts: 0 })
    expect(titleOf(a.local.get('songs', SONG_ID))).toBe('Milost (upraveno)')
  })

  describe('last write wins when both sides changed', () => {
    async function bothEdited(localTime: string, remoteTime: string) {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(plan(PLAN_ID, 'Původní', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()
      b.local.put(plan(PLAN_ID, 'Verze B', remoteTime))
      await b.engine.syncOnce()
      a.local.put(plan(PLAN_ID, 'Verze A', localTime))
      const result = await a.engine.syncOnce()
      await b.engine.syncOnce()
      return { a, b, result }
    }

    it('remote newer → remote version wins everywhere', async () => {
      const { a, b, result } = await bothEdited(at(1), at(2))
      expect(result).toMatchObject({ status: 'synced', conflicts: 1, pulled: 1, pushed: 0 })
      expect(titleOf(a.local.get('plans', PLAN_ID))).toBe('Verze B')
      expect(titleOf(b.local.get('plans', PLAN_ID))).toBe('Verze B')
      expect(titleOf(remote.all('plans')[0])).toBe('Verze B')
    })

    it('local newer → local version wins everywhere', async () => {
      const { a, b, result } = await bothEdited(at(3), at(2))
      expect(result).toMatchObject({ status: 'synced', conflicts: 1, pulled: 0, pushed: 1 })
      expect(titleOf(a.local.get('plans', PLAN_ID))).toBe('Verze A')
      expect(titleOf(b.local.get('plans', PLAN_ID))).toBe('Verze A')
      expect(titleOf(remote.all('plans')[0])).toBe('Verze A')
    })

    it('equal timestamps → remote wins', async () => {
      const { a, b } = await bothEdited(at(2), at(2))
      expect(titleOf(a.local.get('plans', PLAN_ID))).toBe('Verze B')
      expect(titleOf(b.local.get('plans', PLAN_ID))).toBe('Verze B')
    })

    it('compares instants, not strings (server returns other ISO formats)', async () => {
      const { a } = await bothEdited('2026-10-27T08:03:00.000Z', '2026-10-27T09:02:00+02:00')
      // 09:02+02:00 is 07:02Z, i.e. older than the local edit.
      expect(titleOf(a.local.get('plans', PLAN_ID))).toBe('Verze A')
    })
  })

  it('treats identical changes on both sides as no conflict', async () => {
    const a = device(remote, 'A', clock)
    const b = device(remote, 'B', clock)
    a.local.put(plan(PLAN_ID, 'Původní', at(-10)))
    await a.engine.syncOnce()
    await b.engine.syncOnce()
    const same = plan(PLAN_ID, 'Stejně', at(5))
    b.local.put(same)
    await b.engine.syncOnce()
    a.local.put({ ...same, updatedAt: at(6), data: same.data })

    const r = await a.engine.syncOnce()

    expect(r).toMatchObject({ status: 'synced', conflicts: 0, pulled: 0, pushed: 0 })
    expect(await a.engine.syncOnce()).toMatchObject({ pulled: 0, pushed: 0 })
  })

  describe('deletions', () => {
    it('propagate from A to B', async () => {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()

      a.local.put(song(SONG_ID, 'Milost', at(1), { deleted: true }))
      expect((await a.engine.syncOnce()).pushed).toBe(1)
      expect((await b.engine.syncOnce()).pulled).toBe(1)

      expect(b.local.get('songs', SONG_ID)?.deleted).toBe(true)
      expect(remote.all('songs')[0]?.deleted).toBe(true)
    })

    it('propagate from B to A', async () => {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()

      b.local.put(song(SONG_ID, 'Milost', at(1), { deleted: true }))
      await b.engine.syncOnce()
      await a.engine.syncOnce()

      expect(a.local.get('songs', SONG_ID)?.deleted).toBe(true)
    })

    it('a remote deletion never beats a local edit – the edit is kept and re-uploaded', async () => {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()

      b.local.put(song(SONG_ID, 'Milost', at(5), { deleted: true })) // newer deletion
      await b.engine.syncOnce()
      a.local.put(song(SONG_ID, 'Milost (nová sloka)', at(1))) // older edit
      const r = await a.engine.syncOnce()
      await b.engine.syncOnce()

      expect(r).toMatchObject({ conflicts: 1, pushed: 1 })
      for (const d of [a, b]) {
        expect(d.local.get('songs', SONG_ID)?.deleted).toBe(false)
        expect(titleOf(d.local.get('songs', SONG_ID))).toBe('Milost (nová sloka)')
        expect(d.local.records('songs')).toHaveLength(1) // no conflict copy for delete vs edit
      }
    })

    it('a local deletion never beats a remote edit – the edit is restored locally', async () => {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()

      b.local.put(song(SONG_ID, 'Milost (oprava)', at(1)))
      await b.engine.syncOnce()
      a.local.put(song(SONG_ID, 'Milost', at(5), { deleted: true }))
      const r = await a.engine.syncOnce()
      await b.engine.syncOnce()

      expect(r).toMatchObject({ conflicts: 1, pulled: 1, pushed: 0 })
      for (const d of [a, b]) {
        expect(d.local.get('songs', SONG_ID)?.deleted).toBe(false)
        expect(titleOf(d.local.get('songs', SONG_ID))).toBe('Milost (oprava)')
      }
    })

    it('does not upload tombstones of records that never reached the server', async () => {
      const a = device(remote, 'A', clock)
      a.local.put(song(SONG_ID, 'Pokus', at(1), { deleted: true }))

      const r = await a.engine.syncOnce()

      expect(r.pushed).toBe(0)
      expect(remote.all('songs')).toEqual([])
      expect((await a.engine.syncOnce()).pushed).toBe(0)
    })

    it('both sides deleted → nothing to resolve', async () => {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()
      b.local.put(song(SONG_ID, 'Milost', at(2), { deleted: true }))
      await b.engine.syncOnce()
      a.local.put(song(SONG_ID, 'Milost', at(1), { deleted: true, body: 'jiný obsah' }))

      const r = await a.engine.syncOnce()

      expect(r).toMatchObject({ conflicts: 0, pushed: 0 })
      expect(a.local.records('songs')).toHaveLength(1)
    })
  })

  describe('song conflicts', () => {
    it('keeps the losing version as a copy with the computer name on both devices', async () => {
      const a = device(remote, 'Kancelář', clock)
      const b = device(remote, 'Sál', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()

      a.local.put(song(SONG_ID, 'Milost', at(1), { body: '[G]Verze z kanceláře' }))
      await a.engine.syncOnce()
      b.local.put(song(SONG_ID, 'Milost', at(2), { body: '[D]Verze ze sálu' }))
      clock.now = at(3)
      const rb = await b.engine.syncOnce() // B is newer → wins, A's version becomes a copy
      const ra = await a.engine.syncOnce()

      expect(rb).toMatchObject({ status: 'synced', conflicts: 1, pulled: 0, pushed: 2 })
      expect(ra).toMatchObject({ status: 'synced', conflicts: 0, pulled: 2, pushed: 0 })

      for (const d of [a, b]) {
        const songs = d.local.records('songs')
        expect(songs).toHaveLength(2)
        const original = songs.find((s) => s.id === SONG_ID)
        const copy = songs.find((s) => s.id !== SONG_ID)
        expect((original?.data as { content: string }).content).toContain('Verze ze sálu')
        expect(titleOf(copy)).toBe('Milost (konflikt – verze z počítače Kancelář)')
        const content = (copy?.data as { content: string }).content
        expect(content).toContain('{title: Milost (konflikt – verze z počítače Kancelář)}')
        expect(content).toContain(`{x_id: ${copy?.id}}`)
        expect(content).toContain('[G]Verze z kanceláře')
        expect(copy?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
        expect(copy?.updatedAt).toBe(at(3))
        expect(copy?.deleted).toBe(false)
      }
      expect(snapshot(a.local, 'songs')).toEqual(snapshot(b.local, 'songs'))
      expect(await a.engine.syncOnce()).toMatchObject({ pulled: 0, pushed: 0, conflicts: 0 })
      expect(await b.engine.syncOnce()).toMatchObject({ pulled: 0, pushed: 0, conflicts: 0 })
    })

    it('when the remote version wins, the local version becomes the copy', async () => {
      const a = device(remote, 'Kancelář', clock)
      const b = device(remote, 'Sál', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()

      a.local.put(song(SONG_ID, 'Milost', at(1), { body: '[G]Starší z kanceláře' }))
      await a.engine.syncOnce()
      b.local.put(song(SONG_ID, 'Milost', at(0.5), { body: '[D]Ještě starší ze sálu' }))
      const rb = await b.engine.syncOnce()
      await a.engine.syncOnce()

      expect(rb).toMatchObject({ conflicts: 1, pulled: 1, pushed: 1 })
      for (const d of [a, b]) {
        const copy = d.local.records('songs').find((s) => s.id !== SONG_ID)
        expect(titleOf(copy)).toBe('Milost (konflikt – verze z počítače Sál)')
        expect((copy?.data as { content: string }).content).toContain('Ještě starší ze sálu')
        expect((d.local.get('songs', SONG_ID)?.data as { content: string }).content).toContain(
          'Starší z kanceláře'
        )
      }
    })

    it('labels copies of versions from unknown computers', async () => {
      const a = device(remote, 'A', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      // Someone else (old client without a device name) overwrites the song on the server.
      await remote.push('songs', [song(SONG_ID, 'Milost', at(5), { body: 'cizí', updatedBy: '' })])
      a.local.put(song(SONG_ID, 'Milost', at(1), { body: 'moje' }))

      await a.engine.syncOnce()

      const copy = a.local.records('songs').find((s) => s.id !== SONG_ID)
      expect(titleOf(copy)).toBe('Milost (konflikt – verze z počítače A)')
      // …and the other way round: a remote loser without updatedBy is "neznámý".
      const remote2 = new MemoryRemote()
      const c = device(remote2, 'C', clock)
      c.local.put(song(SONG_ID, 'Milost', at(-10)))
      await c.engine.syncOnce()
      await remote2.push('songs', [song(SONG_ID, 'Milost', at(1), { body: 'cizí', updatedBy: '' })])
      c.local.put(song(SONG_ID, 'Milost', at(5), { body: 'moje' }))
      await c.engine.syncOnce()
      const copy2 = c.local.records('songs').find((s) => s.id !== SONG_ID)
      expect(titleOf(copy2)).toBe('Milost (konflikt – verze z počítače neznámý)')
    })

    it('non-song conflicts do not create copies', async () => {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(plan(PLAN_ID, 'P', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()
      a.local.put(plan(PLAN_ID, 'PA', at(1)))
      await a.engine.syncOnce()
      b.local.put(plan(PLAN_ID, 'PB', at(2)))
      await b.engine.syncOnce()
      expect(b.local.records('plans')).toHaveLength(1)
    })
  })

  describe('failures', () => {
    it('offline: remote throwing TypeError("fetch failed") → status offline, local data untouched', async () => {
      const a = device(remote, 'A', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      const before = a.local.records('songs')
      remote.failWith = new TypeError('fetch failed')

      const r = await a.engine.syncOnce()

      expect(r).toEqual({
        status: 'offline',
        error: OFFLINE_MESSAGE,
        pulled: 0,
        pushed: 0,
        conflicts: 0,
        at: T0
      })
      expect(a.local.records('songs')).toEqual(before)
      expect(a.local.applyCalls).toEqual([])
      expect(a.local.state).toEqual(emptySyncState())
    })

    it('recovers after being offline without duplicating anything', async () => {
      const a = device(remote, 'A', clock)
      const b = device(remote, 'B', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()
      a.local.put(song(SONG_ID, 'Milost', at(1), { body: 'A' }))
      await a.engine.syncOnce()
      b.local.put(song(SONG_ID, 'Milost', at(2), { body: 'B' }))
      remote.failPushWith = new TypeError('fetch failed')

      expect((await b.engine.syncOnce()).status).toBe('offline') // conflict resolved locally, upload failed
      remote.failPushWith = null
      expect((await b.engine.syncOnce()).status).toBe('synced')
      await a.engine.syncOnce()

      expect(b.local.records('songs')).toHaveLength(2)
      expect(snapshot(a.local, 'songs')).toEqual(snapshot(b.local, 'songs'))
      expect(remote.all('songs')).toHaveLength(2)
    })

    it('401-like error → status error with a Czech message', async () => {
      const a = device(remote, 'A', clock)
      remote.failWith = new SyncRemoteError('JWT expired', { status: 401, code: 'PGRST303' })

      const r = await a.engine.syncOnce()

      expect(r.status).toBe('error')
      expect(r.error).toBe(AUTH_EXPIRED_MESSAGE)
    })

    it('never throws, even when the local store fails', async () => {
      const a = device(remote, 'A', clock)
      a.local.failListWith = new Error('EACCES: permission denied')

      const r = await a.engine.syncOnce()

      expect(r.status).toBe('error')
      expect(r.error).toContain('permission denied')
    })

    it('never throws when a store throws synchronously or rejects with a non-error', async () => {
      const local = new MemoryLocal()
      local.loadState = () => {
        throw 'state file corrupted'
      }
      const engine = new SyncEngine({ remote, local, deviceName: 'A' })
      await expect(engine.syncOnce()).resolves.toMatchObject({
        status: 'error',
        error: 'state file corrupted'
      })
    })

    it('keeps progress of tables that finished before a failure', async () => {
      const OTHER_ID = '33333333-3333-4333-8333-333333333333'
      await remote.push('songs', [song(OTHER_ID, 'Od souseda', at(-20), { updatedBy: 'B' })])
      const a = device(remote, 'A', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      a.local.put(plan(PLAN_ID, 'Neděle', at(-10)))
      const realPull = remote.pull.bind(remote)
      remote.pull = async (table, cursor) => {
        if (table === 'plans') throw new TypeError('fetch failed')
        return realPull(table, cursor)
      }

      const r = await a.engine.syncOnce()

      expect(r).toMatchObject({ status: 'offline', pulled: 1, pushed: 1 })
      expect(a.local.state.cursors.songs).toBe('1')
      expect(a.local.state.cursors.plans).toBeNull()
      expect(a.local.state.base[`songs:${SONG_ID}`]).toBe(at(-10))
      expect(a.local.state.base[`songs:${OTHER_ID}`]).toBe(at(-20))
      expect(a.local.state.base[`plans:${PLAN_ID}`]).toBeUndefined()
      expect(a.local.state.lastSyncedAt).toBeNull()
    })

    it('runs one sync at a time – concurrent calls share the running sync', async () => {
      const a = device(remote, 'A', clock)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      const [r1, r2] = await Promise.all([a.engine.syncOnce(), a.engine.syncOnce()])
      expect(r1).toBe(r2)
      expect(remote.pushCalls).toHaveLength(1)
      expect((await a.engine.syncOnce()).pushed).toBe(0)
    })
  })

  describe('clock skew', () => {
    it('converges when one computer clock is an hour ahead', async () => {
      const clockA = { now: T0 }
      const clockB = { now: at(60) } // B is 1 hour ahead
      const a = device(remote, 'A', clockA)
      const b = device(remote, 'B', clockB)
      a.local.put(song(SONG_ID, 'Milost', at(-10)))
      await a.engine.syncOnce()
      await b.engine.syncOnce()

      // B edits first (real time 08:01, B clock 09:01) …
      b.local.put(song(SONG_ID, 'Milost', at(61), { body: 'B' }))
      await b.engine.syncOnce()
      // … A edits later in real time (08:05), but its timestamp is "older".
      a.local.put(song(SONG_ID, 'Milost', at(5), { body: 'A' }))
      await a.engine.syncOnce()
      await b.engine.syncOnce()
      expect(snapshot(a.local, 'songs')).toEqual(snapshot(b.local, 'songs'))
      expect(a.local.records('songs')).toHaveLength(2) // nothing lost: the other version is a copy

      // An edit made after pulling a "future" record still propagates (no timestamp comparison
      // without a conflict).
      a.local.put(song(SONG_ID, 'Milost', at(10), { body: 'A2' }))
      await a.engine.syncOnce()
      await b.engine.syncOnce()
      expect((b.local.get('songs', SONG_ID)?.data as { content: string }).content).toContain('A2')

      // B's next edit propagates back too.
      b.local.put(song(SONG_ID, 'Milost', at(70), { body: 'B2' }))
      await b.engine.syncOnce()
      await a.engine.syncOnce()
      expect(snapshot(a.local, 'songs')).toEqual(snapshot(b.local, 'songs'))
      expect((a.local.get('songs', SONG_ID)?.data as { content: string }).content).toContain('B2')
    })
  })

  it('syncs only the configured tables', async () => {
    const local = new MemoryLocal()
    const engine = new SyncEngine({ remote, local, deviceName: 'A', tables: ['songs'] })
    await engine.syncOnce()
    expect(remote.pullCalls.map((c) => c.table)).toEqual(['songs'])
  })

  it('syncs all four tables by default and handles missing cursors in old state files', async () => {
    const local = new MemoryLocal()
    local.state = { cursors: {} as never, base: {}, lastSyncedAt: null }
    const engine = new SyncEngine({ remote, local, deviceName: 'A' })
    expect((await engine.syncOnce()).status).toBe('synced')
    expect(remote.pullCalls.map((c) => c.table)).toEqual(SYNC_TABLES)
  })

  it('treats data equality structurally (key order and undefined fields do not matter)', async () => {
    const a = device(remote, 'A', clock)
    const b = device(remote, 'B', clock)
    const p = plan(PLAN_ID, 'P', at(-10))
    a.local.put(p)
    await a.engine.syncOnce()
    await b.engine.syncOnce()
    const d = p.data as Record<string, unknown>
    const { title: _title, ...rest } = d
    // Same content, different key order + an undefined field, both sides "changed".
    a.local.put({ ...p, updatedAt: at(1), data: { ...d, title: 'X' } })
    b.local.put({ ...p, updatedAt: at(2), data: { extra: undefined, title: 'X', ...rest } })
    await b.engine.syncOnce()
    expect((await a.engine.syncOnce()).conflicts).toBe(0)
  })
})

describe('built-in sample data on a second computer', () => {
  it('an untouched seed record yields to the server without a conflict copy', async () => {
    const remote = new MemoryRemote()
    const clock = { now: T0 }
    const a = device(remote, 'A', clock)
    // Both computers seeded the same sample song and plan (same ids, seed timestamp).
    a.local.put(song(SONG_ID, 'Ukázka', SEED_UPDATED_AT))
    a.local.put(plan(PLAN_ID, 'Ukázková bohoslužba', SEED_UPDATED_AT))
    await a.engine.syncOnce()
    // A prepares Sunday inside the sample plan and edits the sample song.
    clock.now = at(10)
    a.local.put(plan(PLAN_ID, 'Neděle 1. 11.', at(10)))
    a.local.put(song(SONG_ID, 'Ukázka', at(10), { body: '[G]Upraveno na A' }))
    await a.engine.syncOnce()

    // B was set up later, with its own seed (different plan date → different content).
    clock.now = at(60)
    const b = device(remote, 'B', clock)
    const seedPlan = plan(PLAN_ID, 'Ukázková bohoslužba', SEED_UPDATED_AT)
    ;(seedPlan.data as { date: string }).date = '2026-11-08'
    b.local.put(seedPlan)
    b.local.put(song(SONG_ID, 'Ukázka', SEED_UPDATED_AT))
    const res = await b.engine.syncOnce()
    expect(res.conflicts).toBe(0)
    await a.engine.syncOnce()

    for (const d of [a, b]) {
      expect(titleOf(d.local.get('plans', PLAN_ID))).toBe('Neděle 1. 11.')
      expect(d.local.records('songs')).toHaveLength(1)
      expect((d.local.get('songs', SONG_ID)?.data as { content: string }).content).toContain('Upraveno na A')
    }
    expect(remote.all('songs')).toHaveLength(1)
  })
})

describe('after a backup restore', () => {
  it('pulling from the start brings back records the restore removed locally', async () => {
    const remote = new MemoryRemote()
    const clock = { now: T0 }
    const a = device(remote, 'A', clock)
    const b = device(remote, 'B', clock)
    a.local.put(song(SONG_ID, 'Old', T0))
    await a.engine.syncOnce()
    await b.engine.syncOnce()
    const NEW_ID = '33333333-3333-4333-8333-333333333333'
    clock.now = at(5)
    b.local.put(song(NEW_ID, 'Added on B after backup', at(5)))
    await b.engine.syncOnce()
    await a.engine.syncOnce()
    expect(a.local.get('songs', NEW_ID)).toBeDefined()

    // A restores a backup made before B's song: the file is gone, without a tombstone.
    const restored = new MemoryLocal()
    restored.put(song(SONG_ID, 'Old', T0))
    restored.state = withoutPullCursors(a.local.state)
    const a2 = new SyncEngine({ remote, local: restored, deviceName: 'A', now: () => clock.now })
    await a2.syncOnce()
    expect(titleOf(restored.get('songs', NEW_ID))).toBe('Added on B after backup')
  })
})
