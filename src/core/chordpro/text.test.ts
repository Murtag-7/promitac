import { parseChordPro } from './parse'
import {
  allChords,
  firstLyricLine,
  isBlankLyricLine,
  isChordOnlyLine,
  lineText,
  songLyricsText
} from './text'
import type { SongLine } from './model'

const line = (...segments: Array<[string | null, string]>): SongLine => ({
  kind: 'lyrics',
  segments: segments.map(([chord, text]) => ({ chord, text }))
})

describe('lineText', () => {
  it('strips chords from lyrics', () => {
    expect(lineText(line(['G', 'Text první '], ['D', 'sloky']))).toBe('Text první sloky')
    expect(lineText(line([null, 'A'], ['G', 'men']))).toBe('Amen')
  })
  it('returns an empty string for comments and blank lines', () => {
    expect(lineText({ kind: 'comment', text: 'tiše' })).toBe('')
    expect(lineText(line())).toBe('')
  })
})

describe('isBlankLyricLine / isChordOnlyLine', () => {
  it('recognises blank lyric lines', () => {
    expect(isBlankLyricLine(line())).toBe(true)
    expect(isBlankLyricLine(line([null, '   ']))).toBe(true)
    expect(isBlankLyricLine(line(['G', '']))).toBe(false)
    expect(isBlankLyricLine(line([null, 'a']))).toBe(false)
    expect(isBlankLyricLine({ kind: 'comment', text: '' })).toBe(false)
  })
  it('recognises chord-only lines', () => {
    expect(isChordOnlyLine(line(['G', '  '], ['D', '']))).toBe(true)
    expect(isChordOnlyLine(line(['G', 'a']))).toBe(false)
    expect(isChordOnlyLine(line())).toBe(false)
    expect(isChordOnlyLine({ kind: 'comment', text: 'x' })).toBe(false)
  })
})

describe('song level helpers', () => {
  const song = parseChordPro(
    [
      '{start_of_intro}',
      '[G] [D]',
      '{end_of_intro}',
      '{start_of_verse}',
      '{c: tiše}',
      '[G]Text první [D]sloky',
      '',
      '[Em]druhý [C]řádek',
      '{end_of_verse}',
      '{start_of_chorus}',
      '[C]Refrén [G/H]zní',
      '{end_of_chorus}'
    ].join('\n')
  )

  it('songLyricsText joins lyric lines without chords, comments and blank lines', () => {
    expect(songLyricsText(song)).toBe('Text první sloky\ndruhý řádek\nRefrén zní')
  })

  it('firstLyricLine returns the first line with text', () => {
    expect(firstLyricLine(song)).toBe('Text první sloky')
    expect(firstLyricLine(parseChordPro(''))).toBe('')
  })

  it('allChords lists unique chords in order of appearance', () => {
    expect(allChords(song)).toEqual(['G', 'D', 'Em', 'C', 'G/H'])
  })
})
