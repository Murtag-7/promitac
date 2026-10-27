import { SingleFlight, mediaStorageCleanup } from './syncHelpers'

describe('SingleFlight', () => {
  it('never runs two tasks at once and coalesces callers into one follow-up run', async () => {
    let active = 0
    let maxActive = 0
    let runs = 0
    let release: (() => void) | null = null
    const flight = new SingleFlight(async () => {
      active++
      runs++
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((r) => (release = r))
      active--
      return runs
    })
    const first = flight.run()
    const second = flight.run()
    const third = flight.run()
    expect(second).toBe(third)
    release!()
    expect(await first).toBe(1)
    await new Promise((r) => setImmediate(r))
    release!()
    expect(await second).toBe(2)
    expect(runs).toBe(2)
    expect(maxActive).toBe(1)
  })

  it('a failed run does not block the next one', async () => {
    let n = 0
    const flight = new SingleFlight(async () => {
      n++
      if (n === 1) throw new Error('offline')
      return n
    })
    const a = flight.run()
    const b = flight.run()
    await expect(a).rejects.toThrow('offline')
    expect(await b).toBe(2)
    expect(await flight.run()).toBe(3)
  })
})

describe('mediaStorageCleanup', () => {
  it('removes files of deleted media and remembers the rest', () => {
    const res = mediaStorageCleanup(
      { a: 'org/a.png', b: 'org/b.mp4', c: 'org/c.jpg' },
      [{ id: 'a', storagePath: 'org/a.png' }, { id: 'd', storagePath: 'org/d.png' }, { id: 'e' }],
      { b: '2026-10-27T08:00:00.000Z' }
    )
    expect(res.remove).toEqual(['org/b.mp4'])
    // c vanished without a tombstone (e.g. a restore) – keep the shared file and remember it.
    expect(res.known).toEqual({ a: 'org/a.png', d: 'org/d.png', c: 'org/c.jpg' })
  })
})
