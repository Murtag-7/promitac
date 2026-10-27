import { readDirective, readTitle, removeDirective, setDirective } from './directives'

const SONG = '{title: Píseň}\n{key: G}\n\n{start_of_verse: V1}\n[G]Text\n{end_of_verse}\n'

describe('directives', () => {
  it('reads values with colon or space syntax', () => {
    expect(readDirective(SONG, 'key')).toBe('G')
    expect(readDirective('{x_id abc}', 'x_id')).toBe('abc')
    expect(readDirective(SONG, 'artist')).toBeNull()
    expect(readTitle('{t: Krátký}')).toBe('Krátký')
    expect(readTitle('{tags: chvály}\n{tempo: 90}')).toBe('')
    expect(readDirective('{x_idx: 1}', 'x_id')).toBeNull()
    expect(readDirective('{x_id}', 'x_id')).toBe('')
  })
  it('replaces an existing directive in place', () => {
    expect(setDirective(SONG, 'key', 'A')).toBe(SONG.replace('{key: G}', '{key: A}'))
  })
  it('inserts a new directive after the header, before the first section', () => {
    const out = setDirective(SONG, 'x_id', '123')
    expect(out.split('\n').slice(0, 3)).toEqual(['{title: Píseň}', '{key: G}', '{x_id: 123}'])
    expect(readDirective(out, 'x_id')).toBe('123')
  })
  it('inserts at the top of a file without header', () => {
    expect(setDirective('[G]Text', 'x_id', '1')).toBe('{x_id: 1}\n[G]Text')
  })
  it('removes a directive', () => {
    expect(removeDirective(SONG, 'key')).toBe(
      '{title: Píseň}\n\n{start_of_verse: V1}\n[G]Text\n{end_of_verse}\n'
    )
  })
})
