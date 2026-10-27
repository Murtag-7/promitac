import { isChord, normalizeAccidental, parseChord } from './chords'

const VALID = [
  'H',
  'B',
  'Ami',
  'Emi',
  'Hmi',
  'C7',
  'Dsus4',
  'G/H',
  'Cmaj7',
  'F#m',
  'Bb',
  '(G)',
  'Am7',
  'D/F#',
  'Asus2',
  'Cadd9',
  'Hm7b5',
  'E7/G#',
  'C#mi',
  'Ebm',
  'A7sus4',
  'Cdim',
  'Caug',
  'G6',
  'D9',
  'Fis',
  'Cis',
  'Gis',
  'Es',
  'As',
  'N.C.',
  'Am(maj7)',
  'C7(b9)',
  'Gm7/F',
  'Fmaj7#11',
  'G13',
  'C°',
  'Cø',
  'C+',
  'D2',
  'E5',
  'Bbmaj7',
  'Abm',
  'Hmi7',
  'Dmi/C',
  'Gsus',
  'Esus4',
  'A',
  'E',
  'Fmi',
  'Cm',
  'Ammaj7',
  'Emi7/D'
]
const INVALID = [
  'Ahoj',
  'Bůh',
  'Hle',
  'Amen',
  'Do',
  'Emil',
  'já',
  'x',
  'Haleluja',
  'Be',
  'Ach',
  'Den',
  'Cesta',
  'A,',
  'Hej',
  'Asi',
  'Bratře',
  'Duch',
  'Gloria',
  'Cit',
  'Ef',
  'Hm,',
  'a',
  'e',
  'G7x',
  '',
  '()',
  'Hosana',
  'Den.',
  'Cmajor'
]

describe('isChord', () => {
  it.each(VALID)('accepts %s', (c) => expect(isChord(c)).toBe(true))
  it.each(INVALID)('rejects %s', (c) => expect(isChord(c)).toBe(false))
})

describe('parseChord', () => {
  it('splits root, accidental, suffix and bass', () => {
    expect(parseChord('F#m7/C#')).toEqual({
      root: 'F',
      accidental: '#',
      suffix: 'm7',
      bass: { root: 'C', accidental: '#' },
      optional: false
    })
  })
  it('understands German accidentals and optional chords', () => {
    expect(parseChord('(Fis)')).toEqual({
      root: 'F',
      accidental: 'is',
      suffix: '',
      bass: null,
      optional: true
    })
    expect(parseChord('Esmi')).toMatchObject({ root: 'E', accidental: 's', suffix: 'mi' })
    expect(parseChord('Des')).toMatchObject({ root: 'D', accidental: 'es', suffix: '' })
  })
  it('returns null for words', () => {
    expect(parseChord('Amen')).toBeNull()
  })
})

describe('normalizeAccidental', () => {
  it('maps German spellings to sharps/flats', () => {
    expect(normalizeAccidental('is')).toBe('#')
    expect(normalizeAccidental('es')).toBe('b')
    expect(normalizeAccidental('s')).toBe('b')
    expect(normalizeAccidental('')).toBe('')
  })
})
