import { parseChordPro } from './parse'
import { allChords } from './text'
import { detectNotation, transposeChord, transposeSong } from './transpose'

const german = { notation: 'german', preferFlats: false } as const
const english = { notation: 'english', preferFlats: false } as const
const englishFlats = { notation: 'english', preferFlats: true } as const

describe('transposeChord', () => {
  it('transposes up two semitones', () => {
    expect(transposeChord('G', 2, english)).toBe('A')
    expect(transposeChord('H', 2, german)).toBe('C#')
    expect(transposeChord('Bb', 2, english)).toBe('C')
    expect(transposeChord('G/H', 2, german)).toBe('A/C#')
    expect(transposeChord('Ami', 2, german)).toBe('Hmi')
  })

  it('transposes down one semitone in English notation', () => {
    expect(transposeChord('C', -1, english)).toBe('B')
    expect(transposeChord('F', -1, englishFlats)).toBe('E')
    expect(transposeChord('Bb', -1, englishFlats)).toBe('A')
    expect(transposeChord('C', -1, englishFlats)).toBe('B')
  })

  it('spells with sharps or flats as requested', () => {
    expect(transposeChord('C', 1, english)).toBe('C#')
    expect(transposeChord('C', 1, englishFlats)).toBe('Db')
    expect(transposeChord('A', 1, englishFlats)).toBe('Bb')
    expect(transposeChord('A', 1, english)).toBe('A#')
  })

  it('writes B flat as B and B natural as H in German notation', () => {
    expect(transposeChord('A', 1, german)).toBe('B')
    expect(transposeChord('A', 1, { notation: 'german', preferFlats: true })).toBe('B')
    expect(transposeChord('C', -1, german)).toBe('H')
    expect(transposeChord('B', 1, german)).toBe('H')
    expect(transposeChord('B', 2, german)).toBe('C')
  })

  it('reads German accidental spellings', () => {
    expect(transposeChord('Fis', 1, german)).toBe('G')
    expect(transposeChord('Cis', 2, german)).toBe('D#')
    expect(transposeChord('Es', 2, german)).toBe('F')
    expect(transposeChord('As', 1, german)).toBe('A')
    expect(transposeChord('Des', 1, german)).toBe('D')
    expect(transposeChord('Fismi', 1, german)).toBe('Gmi')
  })

  it('keeps suffix, bass and optional parentheses', () => {
    expect(transposeChord('F#m7/C#', 2, english)).toBe('G#m7/D#')
    expect(transposeChord('(G)', 2, english)).toBe('(A)')
    expect(transposeChord('Cmaj7', 5, english)).toBe('Fmaj7')
    expect(transposeChord('Dsus4', -2, english)).toBe('Csus4')
    expect(transposeChord('Am(maj7)', 3, english)).toBe('Cm(maj7)')
  })

  it('wraps around the octave in both directions', () => {
    expect(transposeChord('A', 3, english)).toBe('C')
    expect(transposeChord('C', -13, english)).toBe('B')
    expect(transposeChord('G', 26, english)).toBe('A')
  })

  it('returns the chord unchanged for whole octaves', () => {
    expect(transposeChord('Fis', 12, german)).toBe('Fis')
    expect(transposeChord('Db', 0, english)).toBe('Db')
  })

  it('leaves non-chords unchanged', () => {
    expect(transposeChord('N.C.', 2, english)).toBe('N.C.')
    expect(transposeChord('*Riff', 2, english)).toBe('*Riff')
    expect(transposeChord('', 2, english)).toBe('')
  })
})

describe('detectNotation', () => {
  it('is german when a root or bass is H', () => {
    expect(detectNotation(parseChordPro('[G]a [H7]b'))).toBe('german')
    expect(detectNotation(parseChordPro('[G/H]a'))).toBe('german')
  })
  it('is german when German accidental spellings are used', () => {
    expect(detectNotation(parseChordPro('[D]a [Fis]b'))).toBe('german')
  })
  it('is english otherwise', () => {
    expect(detectNotation(parseChordPro('[G]a [Bb]b [B7]c'))).toBe('english')
    expect(detectNotation(parseChordPro(''))).toBe('english')
  })
})

describe('transposeSong', () => {
  const source = '{title: X}\n{key: G}\n{start_of_verse}\n[G]Ra[Em]no [C]svítí [D7]den\n{end_of_verse}'

  it('transposes every chord and the key, without mutating the input', () => {
    const song = parseChordPro(source)
    const before = JSON.stringify(song)
    const up = transposeSong(song, 2)
    expect(JSON.stringify(song)).toBe(before)
    expect(up.meta.key).toBe('A')
    expect(allChords(up)).toEqual(['A', 'F#m', 'D', 'E7'])
    expect(up.sections[0]?.lines[0]).toEqual({
      kind: 'lyrics',
      segments: [
        { chord: 'A', text: 'Ra' },
        { chord: 'F#m', text: 'no ' },
        { chord: 'D', text: 'svítí ' },
        { chord: 'E7', text: 'den' }
      ]
    })
  })

  it('prefers flats when the resulting key is a flat key', () => {
    const song = parseChordPro('{key: G}\n[G]a [C]b [D]c [A7]d')
    const f = transposeSong(song, -2)
    expect(f.meta.key).toBe('F')
    expect(allChords(f)).toEqual(['F', 'Bb', 'C', 'G7'])
    const eb = transposeSong(song, -4)
    expect(eb.meta.key).toBe('Eb')
    expect(allChords(eb)).toEqual(['Eb', 'Ab', 'Bb', 'F7'])
  })

  it('treats minor keys separately', () => {
    const song = parseChordPro('{key: Em}\n[Em]a [Am]b [H7]c')
    // Em + 3 = Gm, a flat key; the song uses German notation (H7).
    const gm = transposeSong(song, 3)
    expect(gm.meta.key).toBe('Gm')
    expect(allChords(gm)).toEqual(['Gm', 'Cm', 'D7'])
    // Em - 1 = Ebm (flat key), Em + 1 = Fm (flat key), Em + 2 = F#m (sharp key).
    expect(transposeSong(song, -1).meta.key).toBe('Ebm')
    expect(transposeSong(song, 2).meta.key).toBe('F#m')
  })

  it('keeps German notation for songs written in it', () => {
    const song = parseChordPro('{key: D}\n[D]a [Hmi]b [G]c [A7]d [Fis]e')
    expect(detectNotation(song)).toBe('german')
    const up = transposeSong(song, 1)
    expect(up.meta.key).toBe('Eb')
    expect(allChords(up)).toEqual(['Eb', 'Cmi', 'Ab', 'B7', 'G'])
    const down = transposeSong(song, -3)
    expect(down.meta.key).toBe('H')
    expect(allChords(down)).toEqual(['H', 'G#mi', 'E', 'F#7', 'D#'])
  })

  it('understands a German key of B (= B flat major) as a flat key', () => {
    const song = parseChordPro('{key: B}\n[B]a [F]b [H]c')
    const up = transposeSong(song, 2)
    expect(up.meta.key).toBe('C')
    expect(allChords(up)).toEqual(['C', 'G', 'C#'])
  })

  it('uses the mixed default spelling without a key', () => {
    const song = parseChordPro('[C]a [D]b [G]c [A]d [F]e')
    expect(allChords(transposeSong(song, 1))).toEqual(['C#', 'Eb', 'Ab', 'Bb', 'F#'])
  })

  it('round-trips sharps-free songs', () => {
    const song = parseChordPro(source)
    expect(transposeSong(song, 12)).toEqual(song)
    expect(transposeSong(transposeSong(song, 5), 7)).toEqual(song)
    expect(transposeSong(transposeSong(song, -3), 3)).toEqual(song)
  })

  it('accepts an explicit notation', () => {
    const song = parseChordPro('[B]a')
    expect(allChords(transposeSong(song, 2))).toEqual(['C#'])
    expect(allChords(transposeSong(song, 2, 'german'))).toEqual(['C'])
  })

  it('leaves non-chords and an unparseable key unchanged', () => {
    const song = parseChordPro('{key: dle zpěváka}\n[N.C.]a [G]b')
    const up = transposeSong(song, 2)
    expect(up.meta.key).toBe('dle zpěváka')
    expect(allChords(up)).toEqual(['N.C.', 'A'])
  })
})
