import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseChordPro } from './parse'
import type { SongLine } from './model'

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/songs', import.meta.url))
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')

const lyrics = (...segments: Array<[string | null, string]>): SongLine => ({
  kind: 'lyrics',
  segments: segments.map(([chord, text]) => ({ chord, text }))
})
const plain = (text: string): SongLine => lyrics([null, text])
const blank: SongLine = { kind: 'lyrics', segments: [] }
const comment = (text: string): SongLine => ({ kind: 'comment', text })

describe('parseChordPro – SPEC §3 example', () => {
  const song = parseChordPro(fixture('spec-example.chordpro'))

  it('reads the meta directives', () => {
    expect(song.meta.title).toBe('Světlo nad horami')
    expect(song.meta.artist).toBe('Vymyšlený autor')
    expect(song.meta.key).toBe('G')
    expect(song.meta.ccli).toBe('1234567')
    expect(song.meta.tags).toEqual(['chvály', 'advent'])
    expect(song.meta.extra).toEqual([])
  })

  it('reads the arrangement', () => {
    expect(song.arrangement).toEqual(['V1', 'C', 'V2', 'C', 'B', 'C'])
  })

  it('reads the sections with ids and types', () => {
    expect(song.sections.map((s) => [s.id, s.type])).toEqual([
      ['V1', 'verse'],
      ['C', 'chorus'],
      ['V2', 'verse'],
      ['B', 'bridge']
    ])
  })

  it('splits lyric lines into chord segments', () => {
    expect(song.sections[0]?.lines[0]).toEqual(lyrics(['G', 'Text první '], ['D', 'sloky']))
    expect(song.sections[1]?.lines[0]).toEqual(lyrics(['C', 'Text re'], ['G', 'frénu']))
  })

  it('leaves app meta empty when missing', () => {
    expect(song.id).toBe('')
    expect(song.updatedAt).toBe('')
    expect(song.linesPerSlide).toBeUndefined()
    expect(song.themeId).toBeUndefined()
  })
})

describe('parseChordPro – directives', () => {
  it('accepts the three directive syntaxes and is case-insensitive', () => {
    expect(parseChordPro('{title: A}').meta.title).toBe('A')
    expect(parseChordPro('{title:A}').meta.title).toBe('A')
    expect(parseChordPro('{title A b}').meta.title).toBe('A b')
    expect(parseChordPro('{TITLE: A}').meta.title).toBe('A')
    expect(parseChordPro('{t: Krátký}').meta.title).toBe('Krátký')
    expect(parseChordPro('  {title: Odsazený}  ').meta.title).toBe('Odsazený')
  })

  it('keeps the first value of a repeated meta directive', () => {
    expect(parseChordPro('{title: A}\n{title: B}').meta.title).toBe('A')
  })

  it('reads copyright and splits tags', () => {
    const song = parseChordPro('{copyright: © 2026 Nikdo}\n{tags: , a ,b,, c d }')
    expect(song.meta.copyright).toBe('© 2026 Nikdo')
    expect(song.meta.tags).toEqual(['a', 'b', 'c d'])
  })

  it('accepts arrangement ids separated by spaces and/or commas', () => {
    expect(parseChordPro('{arrangement: V1, C,V2  C}').arrangement).toEqual(['V1', 'C', 'V2', 'C'])
  })

  it('reads the app directives', () => {
    const song = parseChordPro(
      '{x_id: abc}\n{x_updated: 2026-10-27T10:00:00.000Z}\n{x_lines_per_slide: 3}\n{x_theme: night-blue}'
    )
    expect(song.id).toBe('abc')
    expect(song.updatedAt).toBe('2026-10-27T10:00:00.000Z')
    expect(song.linesPerSlide).toBe(3)
    expect(song.themeId).toBe('night-blue')
  })

  it('keeps an invalid x_lines_per_slide in extra instead of using it', () => {
    const song = parseChordPro('{x_lines_per_slide: 0}\n{x_lines_per_slide: abc}')
    expect(song.linesPerSlide).toBeUndefined()
    expect(song.meta.extra).toEqual([
      ['x_lines_per_slide', '0'],
      ['x_lines_per_slide', 'abc']
    ])
  })

  it('preserves unknown single-line directives in file order', () => {
    const song = parseChordPro('{subtitle: Podtitul}\n{Capo: 2}\n{title: X}\n{tempo: 80}\n{new_song}')
    expect(song.meta.extra).toEqual([
      ['subtitle', 'Podtitul'],
      ['capo', '2'],
      ['tempo', '80'],
      ['new_song', '']
    ])
  })

  it('drops # comment lines', () => {
    const song = parseChordPro('# hidden\n{title: A}\n{start_of_verse}\n# also hidden\nText\n{end_of_verse}')
    expect(song.sections[0]?.lines).toEqual([plain('Text')])
  })

  it('treats empty meta values as unset', () => {
    const song = parseChordPro('{title:}\n{artist: }\n{key:}')
    expect(song.meta.title).toBe('')
    expect(song.meta.artist).toBeUndefined()
    expect(song.meta.key).toBeUndefined()
  })
})

describe('parseChordPro – sections', () => {
  it('understands short forms and labels', () => {
    const song = parseChordPro(fixture('labels-short.chordpro'))
    expect(song.meta.title).toBe('Cesta domů')
    expect(song.sections.map((s) => [s.id, s.type, s.label])).toEqual([
      ['V1', 'verse', 'Sloka 1'],
      ['C', 'chorus', 'Refrén'],
      ['P', 'prechorus', 'Předrefrén'],
      ['V2', 'verse', 'Sloka 2'],
      ['B', 'bridge', undefined],
      ['E', 'ending', undefined]
    ])
  })

  it('reads {start_of_verse: label="Sloka 1"} with an automatic id', () => {
    const song = parseChordPro('{start_of_verse: label="Sloka 1"}\nA\n{end_of_verse}')
    expect(song.sections[0]).toEqual({ id: 'V1', type: 'verse', label: 'Sloka 1', lines: [plain('A')] })
  })

  it('accepts single-quoted labels', () => {
    const song = parseChordPro("{start_of_chorus: C2 label='Refrén 2'}\nA\n{end_of_chorus}")
    expect(song.sections[0]).toMatchObject({ id: 'C2', label: 'Refrén 2' })
  })

  it('reads {start_of_prechorus} and its alternative spellings', () => {
    const song = parseChordPro(
      '{start_of_prechorus}\nA\n{end_of_prechorus}\n{start_of_pre_chorus}\nB\n{end_of_pre_chorus}\n{start_of_pre-chorus}\nC\n{end_of_pre-chorus}'
    )
    expect(song.sections.map((s) => [s.id, s.type])).toEqual([
      ['P', 'prechorus'],
      ['P2', 'prechorus'],
      ['P3', 'prechorus']
    ])
  })

  it('assigns automatic ids that do not collide with explicit ones', () => {
    const song = parseChordPro(
      '{start_of_verse}\nA\n{end_of_verse}\n{start_of_verse: V1}\nB\n{end_of_verse}\n{start_of_chorus}\nC\n{end_of_chorus}'
    )
    expect(song.sections.map((s) => s.id)).toEqual(['V2', 'V1', 'C'])
  })

  it('makes duplicate explicit ids unique', () => {
    const song = parseChordPro(
      '{start_of_chorus: C}\nA\n{end_of_chorus}\n{start_of_chorus: C}\nB\n{end_of_chorus}\n{start_of_verse: V1}\nX\n{end_of_verse}\n{start_of_verse: V1}\nY\n{end_of_verse}'
    )
    expect(song.sections.map((s) => s.id)).toEqual(['C', 'C2', 'V1', 'V2'])
  })

  it('closes an unclosed section at EOF', () => {
    const song = parseChordPro('{start_of_verse}\n[G]Bez konce')
    expect(song.sections).toEqual([{ id: 'V1', type: 'verse', lines: [lyrics(['G', 'Bez konce'])] }])
  })

  it('closes an unclosed section when the next one starts', () => {
    const song = parseChordPro('{start_of_verse}\nA\n{start_of_chorus}\nB\n{end_of_chorus}')
    expect(song.sections.map((s) => [s.id, s.lines])).toEqual([
      ['V1', [plain('A')]],
      ['C', [plain('B')]]
    ])
  })

  it('ignores a stray end directive', () => {
    const song = parseChordPro('{end_of_chorus}\n{start_of_verse}\nA\n{eov}\n{eoc}')
    expect(song.sections).toHaveLength(1)
  })

  it('keeps an explicit empty section', () => {
    const song = parseChordPro('{start_of_bridge: B}\n{end_of_bridge}')
    expect(song.sections).toEqual([{ id: 'B', type: 'bridge', lines: [] }])
  })

  it('treats a plain value as a label (ChordPro 6 style)', () => {
    const song = parseChordPro('{soc: Refrén}\nA\n{eoc}')
    expect(song.sections[0]).toMatchObject({ id: 'C', label: 'Refrén' })
  })
})

describe('parseChordPro – lyric lines', () => {
  const parseLines = (body: string): SongLine[] =>
    parseChordPro(`{start_of_verse}\n${body}\n{end_of_verse}`).sections[0]?.lines ?? []

  it('puts text before the first chord into a chordless segment', () => {
    expect(parseLines('A[G]mazing [D]grace')).toEqual([lyrics([null, 'A'], ['G', 'mazing '], ['D', 'grace'])])
  })

  it('handles adjacent chords and a chord at the end of the line', () => {
    expect(parseLines('[G][D]text [C]')).toEqual([lyrics(['G', ''], ['D', 'text '], ['C', ''])])
  })

  it('keeps chord-only lines', () => {
    expect(parseLines('[G]  [D]  [Em]')).toEqual([lyrics(['G', '  '], ['D', '  '], ['Em', ''])])
  })

  it('keeps one blank line as a forced slide break and drops leading/trailing ones', () => {
    expect(parseLines('\n\nA\n\n\n\nB\n\n')).toEqual([plain('A'), blank, plain('B')])
  })

  it('treats whitespace-only lines as blank and trims trailing whitespace', () => {
    expect(parseLines('A   \n   \nB')).toEqual([plain('A'), blank, plain('B')])
  })

  it('expands tabs', () => {
    expect(parseLines('\tA')).toEqual([plain('        A')])
  })

  it('treats an unclosed bracket as text', () => {
    expect(parseLines('Text [G')).toEqual([plain('Text [G')])
  })
})

describe('parseChordPro – comments', () => {
  it('turns every comment directive into a comment line', () => {
    const song = parseChordPro(
      '{start_of_verse}\n{comment: a}\n{c: b}\n{comment_italic: c}\n{ci: d}\n{comment_box: e}\n{cb: f}\n{highlight: g}\nText\n{end_of_verse}'
    )
    expect(song.sections[0]?.lines).toEqual([
      comment('a'),
      comment('b'),
      comment('c'),
      comment('d'),
      comment('e'),
      comment('f'),
      comment('g'),
      plain('Text')
    ])
  })

  it('attaches a comment outside sections to the next section', () => {
    const song = parseChordPro('{c: Úvod}\n\n{start_of_verse}\nA\n{end_of_verse}')
    expect(song.sections[0]?.lines).toEqual([comment('Úvod'), plain('A')])
  })

  it('attaches a trailing comment to the last section', () => {
    const song = parseChordPro('{start_of_verse}\nA\n{end_of_verse}\n{c: Konec}')
    expect(song.sections[0]?.lines).toEqual([plain('A'), comment('Konec')])
  })

  it('keeps comments in extra when the song has no sections at all', () => {
    const song = parseChordPro('{title: X}\n{c: Jen poznámka}')
    expect(song.sections).toEqual([])
    expect(song.meta.extra).toEqual([['comment', 'Jen poznámka']])
  })

  it('handles the comments fixture', () => {
    const song = parseChordPro(fixture('comments-unknown.chordpro'))
    expect(song.id).toBe('7d7c9f62-3c1b-4c55-9d8e-0d4b6a1e2f10')
    expect(song.updatedAt).toBe('2026-10-20T08:30:00.000Z')
    expect(song.linesPerSlide).toBe(2)
    expect(song.themeId).toBe('warm-light')
    expect(song.sections.map((s) => s.id)).toEqual(['I', 'V1', 'C', 'M'])
    expect(song.sections[0]?.lines[0]).toEqual(comment('Začíná kytara sama'))
    expect(song.sections[1]?.lines).toHaveLength(8)
    expect(song.sections[1]?.lines[0]).toEqual(comment('tiše'))
    expect(song.sections[1]?.lines[5]).toEqual(blank)
    expect(song.sections[3]?.lines.at(-1)).toEqual(comment('Na konci zpomalit'))
  })
})

describe('parseChordPro – non-lyric environments', () => {
  it('preserves a tab block verbatim in extra, after single-line extras', () => {
    const song = parseChordPro(
      '{capo: 1}\n{start_of_tab}\ne|--0--|\n  B|--1--|  \n{end_of_tab}\n{tempo: 90}\n{start_of_verse}\nA\n{end_of_verse}'
    )
    expect(song.meta.extra).toEqual([
      ['capo', '1'],
      ['tempo', '90'],
      ['start_of_tab', 'e|--0--|\n  B|--1--|  ']
    ])
    expect(song.sections.map((s) => s.lines)).toEqual([[plain('A')]])
  })

  it('preserves grid and unknown environments, including short forms', () => {
    const song = parseChordPro('{sog}\n| G . | C . |\n{eog}\n{start_of_abc}\nX:1\n{end_of_abc}')
    expect(song.meta.extra).toEqual([
      ['start_of_grid', '| G . | C . |'],
      ['start_of_abc', 'X:1']
    ])
    expect(song.sections).toEqual([])
  })

  it('never projects tab content and keeps the surrounding section open', () => {
    const song = parseChordPro('{start_of_verse}\nA\n{start_of_tab}\ne|--|\n{end_of_tab}\nB\n{end_of_verse}')
    expect(song.sections).toEqual([{ id: 'V1', type: 'verse', lines: [plain('A'), plain('B')] }])
  })

  it('ends an unclosed tab block at the next section', () => {
    const song = parseChordPro('{start_of_tab}\ne|--|\n{start_of_verse}\nA\n{end_of_verse}')
    expect(song.meta.extra).toEqual([['start_of_tab', 'e|--|']])
    expect(song.sections).toHaveLength(1)
  })
})

describe('parseChordPro – content outside sections', () => {
  it('splits a file without section directives into verses by blank lines', () => {
    const song = parseChordPro(fixture('no-sections.chordpro'))
    expect(song.meta.title).toBe('Tichá modlitba')
    expect(song.sections.map((s) => [s.id, s.type, s.lines.length])).toEqual([
      ['V1', 'verse', 4],
      ['V2', 'verse', 4],
      ['V3', 'verse', 2]
    ])
    expect(song.sections[0]?.lines[0]).toEqual(plain('Když se večer stmívá,'))
  })

  it('turns loose text between explicit sections into verses with free ids', () => {
    const song = parseChordPro(fixture('edge-cases.chordpro'))
    expect(song.meta.title).toBe('Hrubý soubor')
    expect(song.meta.key).toBe('Emi')
    expect(song.meta.tags).toEqual(['zkouška', 'test'])
    expect(song.arrangement).toEqual(['V1', 'C', 'V1', 'X', 'C'])
    expect(song.meta.extra).toEqual([['unknown_directive', '']])
    expect(song.sections.map((s) => [s.id, s.type, s.label])).toEqual([
      ['V2', 'verse', undefined],
      ['V1', 'verse', undefined],
      ['C', 'chorus', undefined],
      ['C2', 'chorus', undefined],
      ['V3', 'verse', undefined],
      ['V4', 'verse', 'Neuzavřená'],
      ['B', 'bridge', undefined]
    ])
    expect(song.sections[1]?.lines).toEqual([
      lyrics([null, '        '], ['Emi', 'Řádek s tabulátorem '], ['H7', 'a mezerami']),
      blank,
      lyrics(['C', 'po prázdných '], ['G', 'řádcích'])
    ])
  })
})

describe('parseChordPro – robustness', () => {
  it('returns an empty song for an empty file', () => {
    const song = parseChordPro('')
    expect(song).toEqual({
      id: '',
      meta: { title: '', tags: [], extra: [] },
      sections: [],
      arrangement: [],
      updatedAt: ''
    })
  })

  it('gives the same result for CRLF, BOM, NBSP and NFD input', () => {
    const clean = '{title: Žehnej}\n{start_of_verse: V1}\n[G]Žehnej mi, [D]Pane\n{end_of_verse}\n'
    const dirty =
      '\uFEFF' +
      clean.normalize('NFD').replace(/\n/g, '\r\n').replace('mi, ', 'mi,\u00A0').replace('Pane', 'Pane\t ')
    expect(parseChordPro(dirty)).toEqual(parseChordPro(clean))
  })

  it('never throws on garbage', () => {
    const inputs = [
      '{',
      '}',
      '{}',
      '[',
      ']]][[',
      '{start_of_}',
      '{end_of_}',
      '{:}',
      '{ : x}',
      '\u0000\u0001',
      '{sov',
      '[G'
    ]
    for (const input of inputs) expect(() => parseChordPro(input)).not.toThrow()
  })
})
