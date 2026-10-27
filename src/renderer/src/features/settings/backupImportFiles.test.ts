import { emptySong, type Song } from '@core/chordpro/model'
import { importText } from '@core/import/importText'
import {
  decodeText,
  planSongImport,
  songFingerprint,
  songFromFile,
  type SongParsers
} from './backupImportFiles'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

/** Minimal stand-in for the OpenLyrics parser: <title> + one verse from <lines>. */
const fakeOpenLyrics = (xml: string): Song => {
  const title = /<title>([^<]*)<\/title>/.exec(xml)?.[1]
  const lines = /<lines>([^<]*)<\/lines>/.exec(xml)?.[1]
  if (!title || !lines) throw new Error('not OpenLyrics')
  const song = emptySong('', '')
  song.meta.title = title
  song.sections = [
    { id: 'V1', type: 'verse', lines: [{ kind: 'lyrics', segments: [{ chord: null, text: lines }] }] }
  ]
  return song
}

const parsers: SongParsers = { importText, parseOpenLyrics: fakeOpenLyrics }

const CHORDPRO = '{title: Ranní chvála}\n\n{start_of_verse: V1}\n[G]Ráno vstávám, [D]zpívám\n{end_of_verse}\n'
const PLAIN =
  'Večerní světlo\n\n1. Když slunce zapadá\nnad tichým údolím\n\nR: Světlo zůstává\nv srdcích našich\n'

describe('decodeText', () => {
  it('reads UTF-8 with and without BOM', () => {
    expect(decodeText(enc('Žluťoučký kůň'))).toBe('Žluťoučký kůň')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('Šíp')]))).toBe('Šíp')
  })

  it('falls back to Windows-1250 for old Czech files', () => {
    // "Žluťoučký kůň" in Windows-1250
    const cp1250 = new Uint8Array([
      0x8e, 0x6c, 0x75, 0x9d, 0x6f, 0x75, 0xe8, 0x6b, 0xfd, 0x20, 0x6b, 0xf9, 0xf2
    ])
    expect(decodeText(cp1250)).toBe('Žluťoučký kůň')
  })

  it('reads UTF-16 with BOM', () => {
    const le = new Uint8Array([0xff, 0xfe, 0x7d, 0x01, 0x65, 0x00])
    expect(decodeText(le)).toBe('Že')
  })
})

describe('songFromFile', () => {
  it('imports ChordPro and plain text through importText', () => {
    const a = songFromFile('ranni.chordpro', enc(CHORDPRO), parsers)
    expect(a.meta.title).toBe('Ranní chvála')
    expect(a.sections).toHaveLength(1)
    const b = songFromFile('vecer.txt', enc(PLAIN), parsers)
    expect(b.meta.title).toBe('Večerní světlo')
    expect(b.sections.length).toBeGreaterThanOrEqual(2)
  })

  it('imports OpenLyrics XML through parseOpenLyrics', () => {
    const xml = '<song><title>Píseň z XML</title><lines>Slova písně</lines></song>'
    expect(songFromFile('a.xml', enc(xml), parsers).meta.title).toBe('Píseň z XML')
  })

  it('uses the file name when the song has no title', () => {
    const noTitle = '{start_of_verse: V1}\nJen text bez názvu\n{end_of_verse}\n'
    const song = songFromFile('Moje píseň.cho', enc(noTitle), {
      ...parsers,
      importText: (text) => {
        const r = importText(text)
        r.song.meta.title = ''
        return r
      }
    })
    expect(song.meta.title).toBe('Moje píseň')
  })

  it('reports unsupported, empty and unreadable files', () => {
    expect(() => songFromFile('foto.jpg', enc('x'), parsers)).toThrow('unsupported')
    expect(() => songFromFile('prazdny.txt', enc('  \n\n'), parsers)).toThrow('empty')
    expect(() => songFromFile('jiny.xml', enc('<a/>'), parsers)).toThrow('unreadable')
  })
})

describe('planSongImport', () => {
  it('sorts files into new songs, failures and duplicates', () => {
    const existing = { ...songFromFile('x.chordpro', enc(CHORDPRO), parsers), id: 'e1' }
    const plan = planSongImport(
      [
        { name: 'ranni.chordpro', bytes: enc(CHORDPRO) },
        { name: 'vecer.txt', bytes: enc(PLAIN) },
        { name: 'vecer-kopie.txt', bytes: enc(PLAIN) },
        { name: 'obrazek.png', bytes: enc('x') }
      ],
      [existing],
      parsers
    )
    expect(plan.songs.map((s) => s.fileName)).toEqual(['vecer.txt'])
    expect(plan.duplicates).toEqual(['ranni.chordpro', 'vecer-kopie.txt'])
    expect(plan.failed).toEqual([{ fileName: 'obrazek.png', reason: 'unsupported' }])
  })

  it('treats chords, case and diacritics as the same song', () => {
    const a = importText('{title: Ranní chvála}\n{start_of_verse}\n[G]Ráno vstávám\n{end_of_verse}').song
    const b = importText('{title: ranni chvala}\n{start_of_verse}\nRáno   vstávám\n{end_of_verse}').song
    const c = importText('{title: Ranní chvála}\n{start_of_verse}\nVečer usínám\n{end_of_verse}').song
    expect(songFingerprint(a)).toContain('rano vstavam')
    expect(songFingerprint(a)).toBe(songFingerprint(b))
    expect(songFingerprint(a)).not.toBe(songFingerprint(c))
  })
})
