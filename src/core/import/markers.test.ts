import { foldKeepLength, parseMarker, parseRepeatLine, splitTrailingRepeat } from './markers'

describe('parseMarker – keywords', () => {
  it.each([
    ['R:', 'chorus'],
    ['R.', 'chorus'],
    ['Ref.', 'chorus'],
    ['Ref:', 'chorus'],
    ['Ref', 'chorus'],
    ['Refr.', 'chorus'],
    ['Refrén', 'chorus'],
    ['Refren:', 'chorus'],
    ['REFRÉN:', 'chorus'],
    ['Refrain', 'chorus'],
    ['Chorus', 'chorus'],
    ['CHORUS:', 'chorus'],
    ['Ch:', 'chorus'],
    ['Ch.', 'chorus'],
    ['Sbor:', 'chorus'],
    ['Sloka', 'verse'],
    ['Verse', 'verse'],
    ['Strofa:', 'verse'],
    ['Předrefrén', 'prechorus'],
    ['Predrefren:', 'prechorus'],
    ['Pre-chorus', 'prechorus'],
    ['Pre-Chorus:', 'prechorus'],
    ['Prechorus:', 'prechorus'],
    ['Pre chorus', 'prechorus'],
    ['PR:', 'prechorus'],
    ['Bridge', 'bridge'],
    ['Most', 'bridge'],
    ['Most:', 'bridge'],
    ['B:', 'bridge'],
    ['Br.', 'bridge'],
    ['Br:', 'bridge'],
    ['Intro', 'intro'],
    ['Předehra:', 'intro'],
    ['PŘEDEHRA', 'intro'],
    ['Úvod', 'intro'],
    ['Uvod:', 'intro'],
    ['Mezihra', 'interlude'],
    ['Interlude', 'interlude'],
    ['Instrumental', 'interlude'],
    ['Inst.', 'interlude'],
    ['Outro', 'outro'],
    ['Dohra:', 'outro'],
    ['Tag', 'tag'],
    ['Coda', 'ending'],
    ['Ending:', 'ending'],
    ['Konec', 'ending'],
    ['Závěr:', 'ending'],
    ['Zaver', 'ending'],
    ['  Refrén:  ', 'chorus']
  ])('%j → %s', (line, type) => {
    const m = parseMarker(line)
    expect(m).not.toBeNull()
    expect(m?.type).toBe(type)
    expect(m?.rest).toBe('')
    expect(m?.prefixLength).toBe(line.length)
  })
})

describe('parseMarker – numbers', () => {
  it.each([
    ['1.', 'verse', 1],
    ['1)', 'verse', 1],
    ['1:', 'verse', 1],
    ['2.', 'verse', 2],
    ['12.', 'verse', 12],
    ['Sloka 1', 'verse', 1],
    ['Sloka 2:', 'verse', 2],
    ['Verse 2', 'verse', 2],
    ['Verse 3:', 'verse', 3],
    ['V1', 'verse', 1],
    ['V3:', 'verse', 3],
    ['Strofa 2', 'verse', 2],
    ['R2:', 'chorus', 2],
    ['R1', 'chorus', 1],
    ['Refrén 2:', 'chorus', 2],
    ['Chorus 2', 'chorus', 2],
    ['Most 2:', 'bridge', 2],
    ['B2:', 'bridge', 2],
    ['Předrefrén 2:', 'prechorus', 2]
  ])('%j → %s %d', (line, type, number) => {
    const m = parseMarker(line)
    expect(m?.type).toBe(type)
    expect(m?.number).toBe(number)
    expect(m?.rest).toBe('')
  })

  it('has no number when none is written', () => {
    expect(parseMarker('R:')?.number).toBeUndefined()
    expect(parseMarker('Sloka')?.number).toBeUndefined()
  })
})

describe('parseMarker – repeats', () => {
  it.each([
    ['Ref. 2×', 'chorus', 2],
    ['Ref. 2x', 'chorus', 2],
    ['R (2x)', 'chorus', 2],
    ['R: 2x', 'chorus', 2],
    ['R: (2x)', 'chorus', 2],
    ['R [3x]', 'chorus', 3],
    ['Refrén 3x', 'chorus', 3],
    ['Refrén 2x:', 'chorus', 2],
    ['Chorus x2', 'chorus', 2],
    ['Chorus (x2)', 'chorus', 2],
    ['Ref. 2krát', 'chorus', 2],
    ['Ref. 2 krát', 'chorus', 2],
    ['Most 2×', 'bridge', 2],
    ['1. (2x)', 'verse', 2]
  ])('%j → %s ×%d', (line, type, repeat) => {
    const m = parseMarker(line)
    expect(m?.type).toBe(type)
    expect(m?.repeat).toBe(repeat)
    expect(m?.rest).toBe('')
  })

  it('reads a number and a repeat together', () => {
    expect(parseMarker('R2 (2x)')).toMatchObject({ type: 'chorus', number: 2, repeat: 2, rest: '' })
    expect(parseMarker('Sloka 2 (3x)')).toMatchObject({ type: 'verse', number: 2, repeat: 3, rest: '' })
  })

  it('has no repeat by default', () => {
    expect(parseMarker('R:')?.repeat).toBeUndefined()
  })
})

describe('parseMarker – text after the marker', () => {
  it.each([
    ['R: Text refrénu', 'chorus', 'Text refrénu', 3],
    ['R:Text refrénu', 'chorus', 'Text refrénu', 2],
    ['R.  Text refrénu', 'chorus', 'Text refrénu', 4],
    ['Ref.: Text refrénu', 'chorus', 'Text refrénu', 6],
    ['Ref. Text refrénu', 'chorus', 'Text refrénu', 5],
    ['Ref. 2× Text refrénu', 'chorus', 'Text refrénu', 8],
    ['1. Text první sloky', 'verse', 'Text první sloky', 3],
    ['  2) Druhá sloka', 'verse', 'Druhá sloka', 5],
    ['3: Třetí', 'verse', 'Třetí', 3],
    ['Sloka 2: Text', 'verse', 'Text', 9],
    ['Sloka 2. Text', 'verse', 'Text', 9],
    ['Verse 1: Words here', 'verse', 'Words here', 9],
    ['Most: Text mostu', 'bridge', 'Text mostu', 6],
    ['B: Text mostu', 'bridge', 'Text mostu', 3],
    ['Intro: G D Em C', 'intro', 'G D Em C', 7],
    ['Mezihra: Ami  F  C  G', 'interlude', 'Ami  F  C  G', 9],
    ['Předrefrén: A už', 'prechorus', 'A už', 12],
    ['Konec: Amen', 'ending', 'Amen', 7]
  ])('%j → %s, rest %j', (line, type, rest, prefixLength) => {
    const m = parseMarker(line)
    expect(m?.type).toBe(type)
    expect(m?.rest).toBe(rest)
    expect(m?.prefixLength).toBe(prefixLength)
    expect(line.slice(m?.prefixLength)).toBe(rest)
  })

  it('keeps the rest untouched (trailing spaces included)', () => {
    expect(parseMarker('R: Text  ')?.rest).toBe('Text  ')
  })
})

describe('parseMarker – bracketed headings', () => {
  it.each([
    ['[Chorus]', 'chorus', undefined],
    ['[Verse 2]', 'verse', 2],
    ['(R)', 'chorus', undefined],
    ['(Ref.)', 'chorus', undefined],
    ['[V1]', 'verse', 1],
    ['[Refrén 2x]', 'chorus', undefined]
  ])('%j → %s', (line, type, number) => {
    const m = parseMarker(line)
    expect(m?.type).toBe(type)
    expect(m?.number).toBe(number)
    expect(m?.rest).toBe('')
    expect(m?.prefixLength).toBe(line.length)
  })

  it('reads the repeat inside brackets', () => {
    expect(parseMarker('[Refrén 2x]')?.repeat).toBe(2)
  })

  it('does not take bracketed chords or repeat marks for markers', () => {
    expect(parseMarker('[B]')).toBeNull()
    expect(parseMarker('(G)')).toBeNull()
    expect(parseMarker('(2x)')).toBeNull()
    expect(parseMarker('[G]Text [D]refrénu')).toBeNull()
  })
})

describe('parseMarker – not markers', () => {
  it.each([
    'Text první sloky',
    'Refrén je krásný',
    'Most přes řeku',
    'Most. A pak',
    'Refrény zní',
    'Konec léta',
    'Tag za tagem',
    'Tagy',
    'Úvodem',
    'Sbor zpívá',
    'Chorus line here',
    'Rána je tichá',
    'R',
    'B',
    'V',
    'Ch',
    'Br',
    'B2',
    'B (2x)',
    'B 2x',
    'V tom domě',
    'B dur je tónina',
    'R tichý',
    '1.ledna',
    '2.5',
    '1 Text',
    '1',
    '100. výročí',
    '21. století',
    '0.',
    '2x',
    '(2x)',
    '',
    '   ',
    'G   D   Em   C',
    'Ami  C  G',
    'Ó Pane',
    'A on',
    'Text: Jan Novák'
  ])('%j → null', (line) => expect(parseMarker(line)).toBeNull())
})

describe('parseRepeatLine', () => {
  it.each([
    ['(2x)', 2],
    ['2x', 2],
    ['2×', 2],
    ['x2', 2],
    ['×3', 3],
    ['[2x]', 2],
    ['(3 x)', 3],
    ['2krát', 2],
    ['2 krát', 2],
    ['  (2x)  ', 2],
    ['2X', 2]
  ])('%j → %d', (line, n) => expect(parseRepeatLine(line)).toBe(n))

  it.each(['', 'x', '2', 'Text (2x)', '2x text', '(0x)', 'R: 2x', 'xx2'])('%j → null', (line) =>
    expect(parseRepeatLine(line)).toBeNull()
  )
})

describe('splitTrailingRepeat', () => {
  it.each([
    ['Haleluja (2x)', 'Haleluja', 2],
    ['Haleluja, amen 2x', 'Haleluja, amen', 2],
    ['Haleluja [3x]', 'Haleluja', 3],
    ['Haleluja (2×)  ', 'Haleluja', 2],
    ['Haleluja x2', 'Haleluja', 2],
    ['Haleluja(2x)', 'Haleluja', 2],
    ['Haleluja 2krát', 'Haleluja', 2]
  ])('%j → %j ×%d', (line, text, repeat) => expect(splitTrailingRepeat(line)).toEqual({ text, repeat }))

  it.each(['Haleluja', '(2x)', '2x', 'Mám 2 xylofony', 'Box2', 'Haleluja 2'])('%j → null', (line) =>
    expect(splitTrailingRepeat(line)).toBeNull()
  )
})

describe('foldKeepLength', () => {
  it('folds case and diacritics without changing the length', () => {
    expect(foldKeepLength('Předrefrén')).toBe('predrefren')
    expect(foldKeepLength('ŽLUŤOUČKÝ kůň')).toBe('zlutoucky kun')
    expect(foldKeepLength('2×')).toBe('2×')
    const s = 'Ǆ ﬁ 😀 Ř'
    expect(foldKeepLength(s)).toHaveLength(s.length)
  })
})
