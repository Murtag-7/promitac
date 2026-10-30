import { parseChordPro } from '../chordpro/parse'
import { DEFAULT_LINES_PER_SLIDE, songToSlides, splitLinesBalanced, textToSlides } from './generate'

const sizes = (n: number, max: number): number[] =>
  splitLinesBalanced(
    Array.from({ length: n }, (_, i) => `l${i}`),
    max
  ).map((c) => c.length)

describe('splitLinesBalanced', () => {
  it('splits into balanced chunks, larger chunks first', () => {
    expect(sizes(5, 4)).toEqual([3, 2])
    expect(sizes(6, 4)).toEqual([3, 3])
    expect(sizes(7, 4)).toEqual([4, 3])
    expect(sizes(8, 4)).toEqual([4, 4])
    expect(sizes(9, 4)).toEqual([3, 3, 3])
    expect(sizes(10, 4)).toEqual([4, 3, 3])
    expect(sizes(1, 4)).toEqual([1])
    expect(sizes(0, 4)).toEqual([])
    expect(sizes(3, 2)).toEqual([2, 1])
  })

  it('keeps the line order', () => {
    expect(splitLinesBalanced(['a', 'b', 'c', 'd', 'e'], 4)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e']
    ])
  })

  it('treats max < 1 (or invalid) as 1', () => {
    expect(sizes(3, 0)).toEqual([1, 1, 1])
    expect(sizes(2, -5)).toEqual([1, 1])
    expect(sizes(2, Number.NaN)).toEqual([1, 1])
  })

  it('handles a fractional or infinite max', () => {
    expect(sizes(5, 2.7)).toEqual([2, 2, 1])
    expect(sizes(5, Number.POSITIVE_INFINITY)).toEqual([5])
  })
})

describe('DEFAULT_LINES_PER_SLIDE', () => {
  it('is 4', () => expect(DEFAULT_LINES_PER_SLIDE).toBe(4))
})

const SONG = `{title: Test}
{arrangement: V1 C V2 C C}

{start_of_verse: V1}
{c: tiše}
[G]První [D]řádek   
[Em]druhý řádek
[C]  [D]
třetí řádek
{end_of_verse}

{start_of_chorus: C}
[C]Refrén jedna
[G]refrén dva
{end_of_chorus}

{start_of_verse: V2}
A
B

C
D
E
{end_of_verse}

{start_of_bridge: B}
{c: jen komentář}
[G] [D]
{end_of_bridge}
`

describe('songToSlides', () => {
  const song = parseChordPro(SONG)

  it('follows the arrangement and repeats the chorus with unique ids', () => {
    const slides = songToSlides(song, { linesPerSlide: 4 })
    expect(slides.map((s) => s.id)).toEqual(['V1#0.0', 'C#0.0', 'V2#0.0', 'V2#0.1', 'C#1.0', 'C#2.0'])
    const choruses = slides.filter((s) => s.sectionId === 'C')
    expect(choruses).toHaveLength(3)
    for (const c of choruses) expect(c.lines).toEqual(['Refrén jedna', 'refrén dva'])
    expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length)
  })

  it('fills kind, sectionId and sectionType', () => {
    const [first] = songToSlides(song, { linesPerSlide: 4 })
    expect(first).toEqual({
      id: 'V1#0.0',
      kind: 'song',
      lines: ['První řádek', 'druhý řádek', 'třetí řádek'],
      sectionId: 'V1',
      sectionType: 'verse'
    })
  })

  it('never shows chords, comments or chord-only lines, and trims line ends', () => {
    const slides = songToSlides(song, { linesPerSlide: 4 })
    const all = slides.flatMap((s) => s.lines)
    expect(all.some((l) => /\[|\]/.test(l))).toBe(false)
    expect(all).not.toContain('tiše')
    expect(all).not.toContain('jen komentář')
    expect(all.every((l) => l === l.trimEnd() && l.trim() !== '')).toBe(true)
  })

  it('splits slides at blank lines inside a section', () => {
    const slides = songToSlides(song, { linesPerSlide: 4 }).filter((s) => s.sectionId === 'V2')
    expect(slides.map((s) => s.lines)).toEqual([
      ['A', 'B'],
      ['C', 'D', 'E']
    ])
  })

  it('balances long runs using linesPerSlide', () => {
    const slides = songToSlides(song, { linesPerSlide: 2, arrangement: ['V2'] })
    expect(slides.map((s) => s.lines)).toEqual([['A', 'B'], ['C', 'D'], ['E']])
    expect(slides.map((s) => s.id)).toEqual(['V2#0.0', 'V2#0.1', 'V2#0.2'])
  })

  it('lets the per-song linesPerSlide override the global setting', () => {
    const own = { ...song, linesPerSlide: 1 }
    const slides = songToSlides(own, { linesPerSlide: 4, arrangement: ['C'] })
    expect(slides.map((s) => s.lines)).toEqual([['Refrén jedna'], ['refrén dva']])
  })

  it('uses opts.arrangement over the song arrangement and ignores unknown ids', () => {
    const slides = songToSlides(song, { linesPerSlide: 4, arrangement: ['X', 'C', 'V9', 'V1'] })
    expect(slides.map((s) => s.id)).toEqual(['C#0.0', 'V1#0.0'])
  })

  it('uses section order when the arrangement is empty', () => {
    const plain = { ...song, arrangement: [] }
    const slides = songToSlides(plain, { linesPerSlide: 4 })
    expect(slides.map((s) => s.sectionId)).toEqual(['V1', 'C', 'V2', 'V2'])
  })

  it('skips sections without projectable lines', () => {
    const slides = songToSlides(song, { linesPerSlide: 4, arrangement: ['B', 'C'] })
    expect(slides.map((s) => s.sectionId)).toEqual(['C'])
    expect(songToSlides(parseChordPro(''), { linesPerSlide: 4 })).toEqual([])
  })

  it('puts the copyright footer on the last slide only', () => {
    const withCopyright = parseChordPro(`{copyright: © 2026 Nikdo}\n{ccli: 1234567}\n${SONG}`)
    const slides = songToSlides(withCopyright, { linesPerSlide: 4 })
    expect(slides.at(-1)?.footer).toBe('© 2026 Nikdo · CCLI 1234567')
    expect(slides.slice(0, -1).every((s) => s.footer === undefined)).toBe(true)

    const onlyCopyright = parseChordPro(`{copyright: Public domain}\n${SONG}`)
    expect(songToSlides(onlyCopyright, { linesPerSlide: 4 }).at(-1)?.footer).toBe('Public domain')

    const onlyCcli = parseChordPro(`{ccli: 42}\n${SONG}`)
    expect(songToSlides(onlyCcli, { linesPerSlide: 4 }).at(-1)?.footer).toBe('CCLI 42')

    expect(songToSlides(song, { linesPerSlide: 4 }).every((s) => s.footer === undefined)).toBe(true)
  })

  it('turns a song without section directives into one slide set per block', () => {
    const loose = parseChordPro('{title: Volná}\nA\nB\n\nC\nD')
    expect(songToSlides(loose, { linesPerSlide: 4 }).map((s) => [s.id, s.lines])).toEqual([
      ['V1#0.0', ['A', 'B']],
      ['V2#0.0', ['C', 'D']]
    ])
  })
})

describe('textToSlides', () => {
  it('splits the body at blank lines and balances long blocks', () => {
    const slides = textToSlides('Oznámení', 'Řádek 1  \nŘádek 2\n\n\nŘádek 3\nŘádek 4\nŘádek 5', 2)
    expect(slides).toEqual([
      { id: 'text#0', kind: 'text', lines: ['Řádek 1', 'Řádek 2'], title: 'Oznámení' },
      { id: 'text#1', kind: 'text', lines: ['Řádek 3', 'Řádek 4'], title: 'Oznámení' },
      { id: 'text#2', kind: 'text', lines: ['Řádek 5'], title: 'Oznámení' }
    ])
  })

  it('accepts CRLF line endings', () => {
    expect(textToSlides('T', 'a\r\nb\r\n\r\nc', 4).map((s) => s.lines)).toEqual([['a', 'b'], ['c']])
  })

  it('returns one slide with the title for an empty body', () => {
    expect(textToSlides('Vítejte', '', 4)).toEqual([
      { id: 'text#0', kind: 'text', lines: [], title: 'Vítejte' }
    ])
    expect(textToSlides('Vítejte', ' \n\n ', 4)).toEqual([
      { id: 'text#0', kind: 'text', lines: [], title: 'Vítejte' }
    ])
  })
})
