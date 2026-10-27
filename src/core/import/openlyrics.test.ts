import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseChordPro } from '../chordpro/parse'
import { serializeChordPro } from '../chordpro/serialize'
import { parseOpenLyrics } from './openlyrics'

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/openlyrics', import.meta.url))
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')
const cp = (xml: string): string => serializeChordPro(parseOpenLyrics(xml), { includeAppMeta: false })

const wrap = (lyrics: string, properties = '<titles><title>T</title></titles>'): string =>
  `<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8"><properties>${properties}</properties><lyrics>${lyrics}</lyrics></song>`

describe('parseOpenLyrics – 0.8 with <chord name>', () => {
  const xml = fixture('ranni-zpev-0.8.xml')

  it('reads the properties', () => {
    const song = parseOpenLyrics(xml)
    expect(song.meta).toEqual({
      title: 'Ranní zpěv',
      artist: 'Jan Vymyšlený, Petra Smyšlená',
      copyright: '2020 Ukázkové nakladatelství',
      ccli: '1234567',
      key: 'G',
      tags: ['Ráno', 'Chvála'],
      extra: []
    })
    expect(song.id).toBe('')
  })

  it('converts verses, chords, line breaks and verse order', () => {
    expect(cp(xml)).toBe(
      [
        '{title: Ranní zpěv}',
        '{artist: Jan Vymyšlený, Petra Smyšlená}',
        '{key: G}',
        '{ccli: 1234567}',
        '{copyright: 2020 Ukázkové nakladatelství}',
        '{tags: Ráno, Chvála}',
        '{arrangement: V1 C V2 C B C}',
        '',
        '{start_of_verse: V1}',
        '[G]Ráno vstávám [D]s písní,',
        '[Em]slunce hřeje [C]tvář.',
        '{end_of_verse}',
        '',
        '{start_of_chorus: C}',
        '[C]Zpívej, [G]duše má,',
        '[Am]chval ho [D]stále.',
        '{end_of_chorus}',
        '',
        '{start_of_verse: V2}',
        '[G]Večer sedám [D]v tichu,',
        'hvězdy svítí nad [C]námi.',
        '{end_of_verse}',
        '',
        '{start_of_bridge: B}',
        'Ty jsi blízko,',
        'Ty jsi tu.',
        '',
        'Ty jsi blízko,',
        'vždycky tu.',
        '{end_of_bridge}',
        ''
      ].join('\n')
    )
  })

  it('round-trips through ChordPro', () => {
    const song = parseOpenLyrics(xml)
    expect(parseChordPro(serializeChordPro(song))).toEqual(song)
  })
})

describe('parseOpenLyrics – 0.9 with <chord root structure bass>', () => {
  const xml = fixture('vecerni-modlitba-0.9.xml')

  it('maps chord roots, structures, bass notes and chords wrapping text', () => {
    expect(cp(xml)).toBe(
      [
        '{title: Večerní modlitba}',
        '{artist: Eva Smyšlená}',
        '{key: D}',
        '{arrangement: V1 C V2 C E}',
        '',
        '{start_of_verse: V1}',
        '[D]Den se [A]chýlí k [Hm]spánku,',
        '[G]tichne [A7]celý svět.',
        '{end_of_verse}',
        '',
        '{start_of_chorus: C}',
        '[G]Pane, [D/Fis]zůstaň s námi,',
        '[Em7]buď nám [Asus4]blízko.',
        '{end_of_chorus}',
        '',
        '{start_of_verse: V2}',
        'Tiše [D]zhasínají okna,',
        'noc [Hm]přichází.',
        '{end_of_verse}',
        '',
        '{start_of_ending: E}',
        '[D]Amen.',
        '{end_of_ending}',
        ''
      ].join('\n')
    )
  })
})

describe('parseOpenLyrics – details', () => {
  it('maps verse names to section types and ids', () => {
    const song = parseOpenLyrics(
      wrap(
        ['v1', 'v2', 'c', 'c2', 'p', 'b', 'i', 'e', 'o', 'x']
          .map((n) => `<verse name="${n}"><lines>${n}</lines></verse>`)
          .join('')
      )
    )
    expect(song.sections.map((s) => [s.id, s.type])).toEqual([
      ['V1', 'verse'],
      ['V2', 'verse'],
      ['C', 'chorus'],
      ['C2', 'chorus'],
      ['P', 'prechorus'],
      ['B', 'bridge'],
      ['I', 'intro'],
      ['E', 'ending'],
      ['O', 'outro'],
      ['V3', 'verse']
    ])
  })

  it('gives duplicate ids the next free one and maps the verse order through them', () => {
    const song = parseOpenLyrics(
      wrap(
        '<verse name="c"><lines>A</lines></verse><verse name="c1"><lines>B</lines></verse>',
        '<titles><title>T</title></titles><verseOrder>c1 c C1 neznámý</verseOrder>'
      )
    )
    // Numbered names keep their number (c1 → C), the unnumbered duplicate gets the next free id.
    expect(song.sections.map((s) => s.id)).toEqual(['C2', 'C'])
    expect(song.arrangement).toEqual(['C', 'C2', 'C'])
  })

  it('stores no arrangement when the verse order equals the verse order of the file', () => {
    const song = parseOpenLyrics(
      wrap(
        '<verse name="v1"><lines>A</lines></verse>',
        '<titles><title>T</title></titles><verseOrder>v1</verseOrder>'
      )
    )
    expect(song.arrangement).toEqual([])
  })

  it('reads the 0.7 style <line> elements', () => {
    const song = parseOpenLyrics(
      wrap('<verse name="v1"><lines><line>Prvni</line><line>Druhý</line></lines></verse>')
    )
    expect(serializeChordPro(song, { includeAppMeta: false })).toContain('Prvni\nDruhý')
  })

  it('keeps chords at the end of a line', () => {
    const song = parseOpenLyrics(wrap('<verse name="v1"><lines>Amen <chord name="G"/></lines></verse>'))
    expect(serializeChordPro(song)).toContain('Amen [G]')
  })

  it('throws on XML that is not OpenLyrics', () => {
    expect(() => parseOpenLyrics('<html><body/></html>')).toThrow(/OpenLyrics/)
    expect(() => parseOpenLyrics('<song><title>OpenSong</title><lyrics>[V1] a</lyrics></song>')).toThrow(
      /OpenLyrics/
    )
  })

  it('throws on malformed XML and on non-XML text', () => {
    expect(() => parseOpenLyrics('<song><lyrics></song>')).toThrow(/OpenLyrics/)
    expect(() => parseOpenLyrics('jen text')).toThrow(/OpenLyrics/)
    expect(() => parseOpenLyrics('')).toThrow(/OpenLyrics/)
  })
})
