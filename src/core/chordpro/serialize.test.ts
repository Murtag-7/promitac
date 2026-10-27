import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseChordPro } from './parse'
import { serializeChordPro } from './serialize'
import type { Song } from './model'

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/songs', import.meta.url))
const fixtureFiles = readdirSync(FIXTURES).filter((f) => f.endsWith('.chordpro'))

describe('serializeChordPro – round trip over all fixtures', () => {
  it('has at least five fixtures', () => {
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(5)
  })

  it.each(fixtureFiles)('parse(serialize(parse(%s))) equals parse(x)', (file) => {
    const first = parseChordPro(readFileSync(join(FIXTURES, file), 'utf8'))
    const text = serializeChordPro(first)
    expect(parseChordPro(text)).toEqual(first)
    // Serializing is stable as well.
    expect(serializeChordPro(parseChordPro(text))).toBe(text)
  })
})

describe('serializeChordPro – canonical output', () => {
  const song: Song = {
    id: 'song-1',
    meta: {
      title: 'Světlo nad horami',
      artist: 'Vymyšlený autor',
      key: 'G',
      ccli: '1234567',
      copyright: '© 2026 Nikdo',
      tags: ['chvály', 'advent'],
      extra: [
        ['capo', '2'],
        ['new_song', ''],
        ['start_of_tab', 'e|--0--|\nB|--1--|']
      ]
    },
    sections: [
      {
        id: 'V1',
        type: 'verse',
        label: 'Sloka 1',
        lines: [
          { kind: 'comment', text: 'tiše' },
          {
            kind: 'lyrics',
            segments: [
              { chord: 'G', text: 'Text první ' },
              { chord: 'D', text: 'sloky' }
            ]
          },
          { kind: 'lyrics', segments: [] },
          { kind: 'lyrics', segments: [{ chord: null, text: 'Druhý slajd' }] }
        ]
      },
      {
        id: 'C',
        type: 'chorus',
        lines: [
          {
            kind: 'lyrics',
            segments: [
              { chord: null, text: 'A' },
              { chord: 'C', text: 'men' }
            ]
          }
        ]
      },
      { id: 'P', type: 'prechorus', lines: [] }
    ],
    arrangement: ['V1', 'C', 'V1', 'C'],
    linesPerSlide: 3,
    themeId: 'night-blue',
    updatedAt: '2026-10-27T10:00:00.000Z'
  }

  it('writes meta, sections and block extras in canonical order', () => {
    expect(serializeChordPro(song)).toBe(
      [
        '{title: Světlo nad horami}',
        '{artist: Vymyšlený autor}',
        '{key: G}',
        '{ccli: 1234567}',
        '{copyright: © 2026 Nikdo}',
        '{tags: chvály, advent}',
        '{arrangement: V1 C V1 C}',
        '{x_lines_per_slide: 3}',
        '{x_theme: night-blue}',
        '{capo: 2}',
        '{new_song}',
        '{x_id: song-1}',
        '{x_updated: 2026-10-27T10:00:00.000Z}',
        '',
        '{start_of_verse: V1 label="Sloka 1"}',
        '{comment: tiše}',
        '[G]Text první [D]sloky',
        '',
        'Druhý slajd',
        '{end_of_verse}',
        '',
        '{start_of_chorus: C}',
        'A[C]men',
        '{end_of_chorus}',
        '',
        '{start_of_prechorus: P}',
        '{end_of_prechorus}',
        '',
        '{start_of_tab}',
        'e|--0--|',
        'B|--1--|',
        '{end_of_tab}',
        ''
      ].join('\n')
    )
  })

  it('round-trips the canonical song', () => {
    expect(parseChordPro(serializeChordPro(song))).toEqual(song)
  })

  it('omits x_id and x_updated when includeAppMeta is false', () => {
    const text = serializeChordPro(song, { includeAppMeta: false })
    expect(text).not.toContain('x_id')
    expect(text).not.toContain('x_updated')
    expect(text).toContain('{x_lines_per_slide: 3}')
    expect(text).toContain('{x_theme: night-blue}')
  })

  it('writes only the title for a minimal song and ends with a newline', () => {
    const minimal: Song = {
      id: '',
      meta: { title: 'Jen název', tags: [], extra: [] },
      sections: [],
      arrangement: [],
      updatedAt: ''
    }
    expect(serializeChordPro(minimal)).toBe('{title: Jen název}\n')
  })

  it('writes the directive name for every section type', () => {
    const types = [
      'verse',
      'chorus',
      'prechorus',
      'bridge',
      'intro',
      'interlude',
      'outro',
      'tag',
      'ending'
    ] as const
    const text = serializeChordPro({
      id: '',
      meta: { title: 'T', tags: [], extra: [] },
      sections: types.map((type, i) => ({ id: `X${i}`, type, lines: [] })),
      arrangement: [],
      updatedAt: ''
    })
    for (const type of types) {
      expect(text).toContain(`{start_of_${type}: `)
      expect(text).toContain(`{end_of_${type}}`)
    }
  })

  it('keeps newlines out of single-line directives', () => {
    const text = serializeChordPro({
      id: '',
      meta: { title: 'Dva\nřádky', tags: [], extra: [] },
      sections: [],
      arrangement: [],
      updatedAt: ''
    })
    expect(text).toBe('{title: Dva řádky}\n')
  })

  it('keeps x_* directives and unknown directives through a round trip', () => {
    const text =
      '{title: A}\n{x_custom: 1}\n{x_theme: t}\n{x_id: i}\n{x_updated: u}\n{x_lines_per_slide: 5}\n'
    const out = serializeChordPro(parseChordPro(text))
    expect(out).toContain('{x_custom: 1}')
    expect(out).toContain('{x_theme: t}')
    expect(out).toContain('{x_id: i}')
    expect(out).toContain('{x_updated: u}')
    expect(out).toContain('{x_lines_per_slide: 5}')
  })
})

describe('serializeChordPro – round trip on generated documents', () => {
  const PIECES = [
    '{title: Název}',
    '{t:Jiný}',
    '{artist: A}',
    '{key: Ami}',
    '{tags: a, b}',
    '{arrangement: V1 C V1}',
    '{x_id: id-1}',
    '{x_updated: 2026}',
    '{x_lines_per_slide: 2}',
    '{x_lines_per_slide: nope}',
    '{x_theme: t}',
    '{capo: 3}',
    '{weird}',
    '{start_of_verse}',
    '{start_of_verse: V1}',
    '{start_of_verse: label="Sloka"}',
    '{soc}',
    "{start_of_chorus: C2 label='R2'}",
    '{start_of_bridge: Most}',
    '{start_of_verse-guitar}',
    '{end_of_verse}',
    '{eoc}',
    '{eob}',
    '{start_of_tab}',
    '{end_of_tab}',
    '{sog}',
    '{c: poznámka}',
    '{ci}',
    '# komentář',
    '',
    '   ',
    '\t',
    '[G]Text [D]sloky',
    'Text bez akordů',
    '[G] [D]',
    'A[C]men[F]',
    '  odsazený [Ami]řádek  ',
    '[] prázdný akord',
    'neuzavřený [G',
    '{:}',
    '{start_of_}',
    '{end_of_}',
    'e|--0--|'
  ]

  // Small deterministic PRNG so failures are reproducible.
  const rng = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  it('holds for 500 random documents', () => {
    const random = rng(42)
    const seen = { sections: 0, labels: 0, blocks: 0, comments: 0, blanks: 0 }
    for (let n = 0; n < 500; n++) {
      const length = Math.floor(random() * 25)
      const lines = Array.from({ length }, () => PIECES[Math.floor(random() * PIECES.length)] ?? '')
      const source = lines.join(random() < 0.2 ? '\r\n' : '\n')
      const first = parseChordPro(source)
      const text = serializeChordPro(first)
      expect({ source, song: parseChordPro(text) }).toEqual({ source, song: first })
      seen.sections += first.sections.length
      seen.labels += first.sections.filter((s) => s.label).length
      seen.blocks += first.meta.extra.filter(([name]) => name.startsWith('start_of_')).length
      for (const s of first.sections) {
        seen.comments += s.lines.filter((l) => l.kind === 'comment').length
        seen.blanks += s.lines.filter((l) => l.kind === 'lyrics' && l.segments.length === 0).length
      }
    }
    // The generator really exercises the interesting cases.
    for (const count of Object.values(seen)) expect(count).toBeGreaterThan(10)
  })
})
