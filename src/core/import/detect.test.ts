import { detectTextFormat } from './detect'

describe('detectTextFormat', () => {
  it.each([
    '{title: Píseň}\n[G]Text',
    '{t: Píseň}\nText',
    '{start_of_verse}\nText\n{end_of_verse}',
    '{start_of_chorus: C}\nText',
    'Text\n{soc}\nRefrén\n{eoc}',
    '{sov}\nSloka\n{eov}',
    '  {title:Píseň}'
  ])('chordpro: %j', (text) => expect(detectTextFormat(text)).toBe('chordpro'))

  it.each([
    'Píseň\n\n[G]Text první [D]sloky\n[Emi]druhý řádek',
    '1. [C]Ty jsi [G]Pán',
    '[Ami]Hle, [F]Beránek'
  ])('inline chords: %j', (text) => expect(detectTextFormat(text)).toBe('inline-chords'))

  it.each([
    'G       D\nText první sloky',
    'Píseň\n\n   G       D\n1. Text první sloky\n\nC   G\nR: Refrén',
    '  Ami   F\nHle, Beránek'
  ])('chords over text: %j', (text) => expect(detectTextFormat(text)).toBe('chords-over-text'))

  it.each([
    'Text první sloky\ndruhý řádek\n\nDruhá sloka',
    '',
    'Píseň\n\nIntro: G D Em C\n\n1. Text',
    'G D Em C\n\nText bez akordů',
    'Text [poznámka] a [2x]',
    'Jen [G] jeden akord'
  ])('plain: %j', (text) => expect(detectTextFormat(text)).toBe('plain'))

  it('prefers ChordPro over inline chords', () => {
    expect(detectTextFormat('{title: A}\n[G]Text [D]dál')).toBe('chordpro')
  })

  it('prefers inline chords over chord lines', () => {
    expect(detectTextFormat('G   D\nText\n[G]Text [D]dál')).toBe('inline-chords')
  })

  it('does not treat braces in lyrics as ChordPro', () => {
    expect(detectTextFormat('Text {poznámka}\ndalší')).toBe('plain')
  })
})
