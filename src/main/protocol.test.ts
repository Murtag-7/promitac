import { parseRange, safeJoin } from './protocol'

vi.mock('electron', () => ({ protocol: {}, app: { getPath: () => '/tmp', isPackaged: false } }))

describe('parseRange', () => {
  it('parses open and closed ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  })
  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })
  it('rejects invalid or unsatisfiable ranges', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=2000-', 1000)).toBeNull()
    expect(parseRange('bytes=5-1', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
  })
})

describe('safeJoin', () => {
  it('stays inside the root', () => {
    expect(safeJoin('/data/media', 'a.png')).toBe('/data/media/a.png')
    expect(safeJoin('/data/media', '../settings.json')).toBeNull()
    expect(safeJoin('/data/media', 'sub/../../x')).toBeNull()
  })
})
