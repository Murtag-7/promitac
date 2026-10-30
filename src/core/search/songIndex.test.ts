import { parseChordPro } from '../chordpro/parse'
import type { Song } from '../chordpro/model'
import { SongIndex } from './songIndex'

const song = (id: string, text: string): Song => ({ ...parseChordPro(text), id })

const SONGS: Song[] = [
  song(
    'zehnej',
    '{title: Žehnej, duše má}\n{artist: Vymyšlená Autorka}\n{tags: chvály}\n{start_of_verse}\n[G]Slunce vychází nad krajem\n[D]a já zpívám dál\n{end_of_verse}'
  ),
  song(
    'hospodine',
    '{title: Hospodine, Ty jsi můj pastýř}\n{tags: žalmy, advent}\n{start_of_verse}\n[C]Vedeš mě k vodám tichým\n{end_of_verse}'
  ),
  song(
    'haleluja',
    '{title: Haleluja zní}\n{artist: Jan Novák}\n{start_of_verse}\n[D]Ozvěna letí údolím\n{end_of_verse}\n{start_of_chorus}\n[G]Zvony bijí k ránu\n{end_of_chorus}'
  ),
  song(
    'grace',
    '{title: Amazing Grace}\n{artist: John Newton}\n{tags: hymn}\n{start_of_verse}\nAmazing grace! how sweet the sound\nThat saved a wretch like me!\n{end_of_verse}'
  )
]

const ids = (index: SongIndex, q: string): string[] => index.search(q).map((r) => r.id)

describe('SongIndex', () => {
  const index = new SongIndex()
  index.setAll(SONGS)

  it('reports its size', () => {
    expect(index.size).toBe(4)
  })

  it('finds titles without diacritics', () => {
    expect(ids(index, 'zehnej')[0]).toBe('zehnej')
    expect(ids(index, 'zehnej duse')).toEqual(['zehnej'])
    expect(ids(index, 'Žehnej')[0]).toBe('zehnej')
  })

  it('searches by first line', () => {
    expect(ids(index, 'slunce vychazi')).toEqual(['zehnej'])
  })

  it('searches the whole lyrics', () => {
    expect(ids(index, 'zvony biji')).toEqual(['haleluja'])
  })

  it('searches by artist', () => {
    expect(ids(index, 'novak')).toEqual(['haleluja'])
    expect(ids(index, 'newton')).toEqual(['grace'])
  })

  it('searches by tag', () => {
    expect(ids(index, 'zalmy')).toEqual(['hospodine'])
    expect(ids(index, 'chvaly')).toEqual(['zehnej'])
  })

  it('matches prefixes', () => {
    expect(ids(index, 'hosp')).toEqual(['hospodine'])
  })

  it('tolerates typos in longer words', () => {
    expect(ids(index, 'halelja')).toEqual(['haleluja'])
  })

  it('requires all terms to match', () => {
    expect(ids(index, 'haleluja newton')).toEqual([])
  })

  it('ranks title matches above lyric matches', () => {
    const idx = new SongIndex()
    idx.setAll([
      song('lyrics', '{title: Jiná píseň}\n{start_of_verse}\nPrvní řádek\nsvětlo svítí\n{end_of_verse}'),
      song('title', '{title: Světlo}\n{start_of_verse}\nNěco jiného\n{end_of_verse}')
    ])
    expect(ids(idx, 'svetlo')).toEqual(['title', 'lyrics'])
  })

  it('returns [] for an empty or whitespace query', () => {
    expect(index.search('')).toEqual([])
    expect(index.search('   ')).toEqual([])
  })

  it('respects the limit and returns scores', () => {
    const results = index.search('a', 2)
    expect(results.length).toBeLessThanOrEqual(2)
    for (const r of results) expect(r.score).toBeGreaterThan(0)
  })

  it('finds text stored in NFD form with a plain query', () => {
    const idx = new SongIndex()
    const nfd = song('nfd', '{title: Kř}\n{start_of_verse}\nŽehnej mi, Pane\n{end_of_verse}')
    const line = nfd.sections[0]?.lines[0]
    if (line?.kind === 'lyrics' && line.segments[0])
      line.segments[0].text = 'Žehnej mi, Pane'.normalize('NFD')
    nfd.meta.title = 'Křížová cesta'.normalize('NFD')
    idx.setAll([nfd])
    expect(ids(idx, 'zehnej')).toEqual(['nfd'])
    expect(ids(idx, 'krizova')).toEqual(['nfd'])
    expect(ids(idx, 'Křížová')).toEqual(['nfd'])
  })

  it('upserts and removes songs', () => {
    const idx = new SongIndex()
    idx.setAll(SONGS)
    idx.upsert(song('zehnej', '{title: Nový název}'))
    expect(idx.size).toBe(4)
    expect(ids(idx, 'zehnej')).toEqual([])
    expect(ids(idx, 'novy nazev')).toEqual(['zehnej'])

    idx.upsert(song('new', '{title: Úplně nová}'))
    expect(idx.size).toBe(5)
    expect(ids(idx, 'uplne')).toEqual(['new'])

    idx.remove('new')
    idx.remove('does-not-exist')
    expect(idx.size).toBe(4)
    expect(ids(idx, 'uplne')).toEqual([])
  })

  it('replaces everything on setAll and tolerates duplicate ids', () => {
    const idx = new SongIndex()
    idx.setAll(SONGS)
    idx.setAll([song('a', '{title: První}'), song('a', '{title: Druhá}')])
    expect(idx.size).toBe(1)
    expect(ids(idx, 'druha')).toEqual(['a'])
    expect(ids(idx, 'zehnej')).toEqual([])
  })
})
