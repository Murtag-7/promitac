import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseChordPro } from '../chordpro/parse'
import { lineText } from '../chordpro/text'
import type { Song } from '../chordpro/model'
import { importText } from './importText'
import { songToChordSheet, songToPlainText } from './plaintext'

const SONGS = fileURLToPath(new URL('../../../tests/fixtures/songs', import.meta.url))
const fixture = (name: string): Song => parseChordPro(readFileSync(join(SONGS, name), 'utf8'))

const SONG = parseChordPro(`{title: Světlo}
{start_of_intro}
[G] [D]
{end_of_intro}
{start_of_verse: V1}
[G]Text první [D]sloky
{comment: tiše}
ráno, když se [C]probouzí den
{end_of_verse}
{start_of_chorus}
[C]Text re[G]frénu

[Am]zpívej
{end_of_chorus}
{start_of_verse: V2}
Druhá sloka
{end_of_verse}
{start_of_chorus: C2}
Druhý refrén
{end_of_chorus}
{start_of_prechorus}
Před
{end_of_prechorus}
{start_of_bridge}
Most
{end_of_bridge}
{start_of_interlude}
[C]Mezi
{end_of_interlude}
{start_of_outro}
Dohra
{end_of_outro}
{start_of_tag}
Tag
{end_of_tag}
{start_of_ending}
Konec
{end_of_ending}`)

describe('songToPlainText', () => {
  it('writes the title, Czech markers and lyrics without chords', () => {
    expect(songToPlainText(SONG)).toBe(
      [
        'Světlo',
        '',
        '1.',
        'Text první sloky',
        'ráno, když se probouzí den',
        '',
        'R:',
        'Text refrénu',
        'zpívej',
        '',
        '2.',
        'Druhá sloka',
        '',
        'R2:',
        'Druhý refrén',
        '',
        'Předrefrén:',
        'Před',
        '',
        'Most:',
        'Most',
        '',
        'Mezihra:',
        'Mezi',
        '',
        'Dohra:',
        'Dohra',
        '',
        'Tag:',
        'Tag',
        '',
        'Závěr:',
        'Konec',
        ''
      ].join('\n')
    )
  })

  it('handles a song without title or sections', () => {
    expect(songToPlainText(parseChordPro(''))).toBe('')
    expect(songToPlainText(parseChordPro('{title: Jen název}'))).toBe('Jen název\n')
  })
})

describe('songToChordSheet', () => {
  it('writes chord lines above the lyrics at the right columns', () => {
    const sheet = songToChordSheet(SONG)
    expect(sheet.split('\n').slice(0, 14)).toEqual([
      'Světlo',
      '',
      'Předehra:',
      'G D',
      '',
      '1.',
      'G          D',
      'Text první sloky',
      '              C',
      'ráno, když se probouzí den',
      '',
      'R:',
      'C      G',
      'Text refrénu'
    ])
  })

  it('keeps at least one space between chords that would touch', () => {
    const song = parseChordPro('{title: X}\n[G]a[D]b[Emi]c')
    expect(songToChordSheet(song)).toBe('X\n\n1.\nG D Emi\nabc\n')
  })

  it('writes chords standing past the end of the text', () => {
    const song = parseChordPro('{title: X}\n[G]Haleluja   [D]')
    expect(songToChordSheet(song)).toBe('X\n\n1.\nG          D\nHaleluja\n')
  })
})

const shape = (song: Song): Array<[string, string[]]> =>
  song.sections.map((s) => [
    s.type,
    s.lines.filter((l) => l.kind === 'lyrics' && l.segments.length > 0).map((l) => lineText(l).trim())
  ])

const chords = (song: Song): unknown =>
  song.sections.map((s) => [
    s.type,
    s.lines.flatMap((l) => (l.kind === 'lyrics' && l.segments.length > 0 ? [l.segments] : []))
  ])

describe.each(['spec-example.chordpro', 'german-notation.chordpro', 'amazing-grace.chordpro'])(
  'round trip of %s',
  (name) => {
    const song = fixture(name)

    it('importText(songToChordSheet(song)) gives back sections, lines and chords', () => {
      const back = importText(songToChordSheet(song))
      expect(back.format).toBe('chords-over-text')
      expect(back.warnings).toEqual([])
      expect(back.song.meta.title).toBe(song.meta.title)
      expect(chords(back.song)).toEqual(chords(song))
    })

    it('importText(songToPlainText(song)) gives back the lyrics', () => {
      const back = importText(songToPlainText(song))
      expect(back.format).toBe('plain')
      expect(back.warnings).toEqual([])
      expect(back.song.meta.title).toBe(song.meta.title)
      expect(shape(back.song)).toEqual(shape(song))
    })
  }
)
