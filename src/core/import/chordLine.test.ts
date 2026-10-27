import { chordOnlyLine, chordTokens, isChordLine, mergeChordLine } from './chordLine'

const strip = (s: string): string => s.replace(/\[[^\]]*\]/g, '')

describe('isChordLine', () => {
  it.each([
    'G       D',
    'Ami  C  G',
    '  C   G/H   Ami   F  ',
    '| G . . . | D . . . |',
    'Emi7  D/F#  (G)  x2',
    'H7  Emi',
    'G D Em C (2x)'
  ])('detects chord line %j', (l) => expect(isChordLine(l)).toBe(true))

  it.each([
    'Text první sloky',
    'A je to tak',
    'Hle, Beránek Boží',
    'A on',
    '',
    '   ',
    'Ref. 2x',
    'Amen, amen'
  ])('rejects lyric line %j', (l) => expect(isChordLine(l)).toBe(false))
})

describe('chordTokens', () => {
  it('returns chords with their columns, skipping rhythm marks', () => {
    expect(chordTokens('G   |  D7  x2')).toEqual([
      { chord: 'G', col: 0 },
      { chord: 'D7', col: 7 }
    ])
  })
  it('expands tabs before measuring columns', () => {
    expect(chordTokens('\tG')).toEqual([{ chord: 'G', col: 8 }])
  })
})

describe('mergeChordLine', () => {
  it('inserts chords at character positions', () => {
    expect(mergeChordLine('G       D', 'Text první sloky')).toBe('[G]Text prv[D]ní sloky')
  })
  it('keeps chords in the middle of a word', () => {
    expect(mergeChordLine('     C   G', 'Text refrénu')).toBe('Text [C]refr[G]énu')
  })
  it('appends chords that stand past the end of the text', () => {
    const merged = mergeChordLine('G          D', 'Haleluja')
    expect(merged).toBe('[G]Haleluja   [D]')
    expect(strip(merged).trimEnd()).toBe('Haleluja')
  })
  it('never changes the lyrics', () => {
    const lyrics = 'Ó Pane, Ty jsi světlo mé'
    const merged = mergeChordLine('E   A    H7     E', lyrics)
    expect(strip(merged).trimEnd()).toBe(lyrics)
  })
  it('works with tabs in both lines', () => {
    expect(strip(mergeChordLine('G\tD', 'Slovo\tdruhé'))).toBe('Slovo   druhé')
  })
})

describe('chordOnlyLine', () => {
  it('turns an instrumental chord line into inline chords', () => {
    expect(chordOnlyLine('G   D   Emi  C')).toBe('[G] [D] [Emi] [C]')
  })
})
