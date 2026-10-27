import { serializeChordPro } from '../chordpro/serialize'
import { lineText } from '../chordpro/text'
import type { Song } from '../chordpro/model'
import { applyTitleFallback, parseMetaLine, textToSong } from './textToSong'

const cp = (text: string): string => serializeChordPro(textToSong(text).song, { includeAppMeta: false })
const lines = (...l: string[]): string => l.join('\n')
const codes = (text: string): string[] => textToSong(text).warnings.map((w) => w.code)
const sectionTexts = (song: Song): string[][] => song.sections.map((s) => s.lines.map((l) => lineText(l)))

describe('textToSong – title and header', () => {
  it('takes the first line followed by a blank line as the title', () => {
    const { song, warnings } = textToSong(lines('Světlo v údolí', '', 'Text první', 'druhý řádek'))
    expect(song.meta.title).toBe('Světlo v údolí')
    expect(sectionTexts(song)).toEqual([['Text první', 'druhý řádek']])
    expect(warnings).toEqual([])
  })

  it('takes the first line followed by meta lines as the title', () => {
    const { song } = textToSong(lines('Světlo v údolí', 'Autor: Jan Novák', 'Text první', 'druhý'))
    expect(song.meta.title).toBe('Světlo v údolí')
    expect(song.meta.artist).toBe('Jan Novák')
    expect(sectionTexts(song)).toEqual([['Text první', 'druhý']])
  })

  it('takes the first line followed directly by a section marker as the title', () => {
    const { song } = textToSong(lines('Světlo v údolí', '1. Text první', 'druhý'))
    expect(song.meta.title).toBe('Světlo v údolí')
    expect(song.sections.map((s) => s.id)).toEqual(['V1'])
  })

  it('takes the title also before a chord line that precedes a marker line', () => {
    const { song } = textToSong(lines('Světlo v údolí', 'G       D', '1. Text první', 'druhý'))
    expect(song.meta.title).toBe('Světlo v údolí')
    expect(cp(lines('Světlo v údolí', '   G    D', '1. Text první', 'druhý'))).toContain('[G]Text [D]první')
  })

  it('does not take a line of a multi-line first block as the title', () => {
    const { song, warnings } = textToSong(
      lines('Text první sloky,', 'druhý řádek', '', 'Druhá sloka', 'a dál')
    )
    expect(song.meta.title).toBe('Text první sloky')
    expect(warnings.map((w) => w.code)).toEqual(['titleFromFirstLine'])
    expect(sectionTexts(song)).toEqual([
      ['Text první sloky,', 'druhý řádek'],
      ['Druhá sloka', 'a dál']
    ])
  })

  it('keeps a single line of text as lyrics', () => {
    const { song, warnings } = textToSong('Haleluja, amen.')
    expect(song.meta.title).toBe('Haleluja, amen')
    expect(sectionTexts(song)).toEqual([['Haleluja, amen.']])
    expect(warnings.map((w) => w.code)).toEqual(['titleFromFirstLine'])
  })

  it('does not take a marker, chord line or a line ending with a comma as the title', () => {
    expect(textToSong(lines('R: Refrén', '', 'Text')).song.meta.title).toBe('Refrén')
    expect(codes(lines('R: Refrén', '', 'Text'))).toEqual(['titleFromFirstLine'])
    expect(textToSong(lines('Ó Pane,', '', 'Text')).song.sections).toHaveLength(2)
  })

  it('strips chords and trailing punctuation from a title taken from the first line', () => {
    const { song } = textToSong(lines('G     D', 'Pojď, Duchu svatý;', 'druhý'))
    expect(song.meta.title).toBe('Pojď, Duchu svatý')
  })

  it('reads meta lines in the header in any order', () => {
    const { song } = textToSong(
      lines(
        'Tónina: G',
        'Světlo v údolí',
        '',
        'Text a hudba: Jan Novák',
        'CCLI: 1234567',
        '© 2019 Ukázkové nakladatelství',
        '',
        '1. Text'
      )
    )
    expect(song.meta).toMatchObject({
      title: 'Světlo v údolí',
      artist: 'Jan Novák',
      key: 'G',
      ccli: '1234567',
      copyright: '2019 Ukázkové nakladatelství'
    })
    expect(sectionTexts(song)).toEqual([['Text']])
  })

  it('joins several author lines keeping their own wording', () => {
    expect(
      textToSong(lines('Píseň', 'Autor: Jan Novák', 'Hudba: Petr Malý', '', 'Text')).song.meta.artist
    ).toBe('Jan Novák, Hudba: Petr Malý')
    expect(
      textToSong(lines('Píseň', 'Text: Jan Novák', 'Hudba: Petr Malý', '', 'Text')).song.meta.artist
    ).toBe('Text: Jan Novák, Hudba: Petr Malý')
    expect(textToSong(lines('Píseň', 'Text: Jan Novák', '', 'Text')).song.meta.artist).toBe('Jan Novák')
  })

  it('reads copyright, CCLI and author lines at the very end', () => {
    const { song } = textToSong(
      lines('Píseň', '', '1. Text', 'druhý', '', 'Text a hudba: Jan Novák', 'CCLI 7654321', '(c) 2020 Někdo')
    )
    expect(song.meta).toMatchObject({ artist: 'Jan Novák', ccli: '7654321', copyright: '2020 Někdo' })
    expect(sectionTexts(song)).toEqual([['Text', 'druhý']])
  })

  it('keeps meta-like lines in the middle of the lyrics', () => {
    const { song } = textToSong(lines('Píseň', '', '1. Text', '', 'Autor: Jan', '', '2. Druhá'))
    expect(song.meta.artist).toBeUndefined()
    expect(sectionTexts(song)).toEqual([['Text'], ['Autor: Jan'], ['Druhá']])
  })

  it('warns about a missing title only when there are no lyrics', () => {
    expect(codes('')).toEqual(['missingTitle', 'emptySection'])
    expect(codes(lines('Autor: Jan Novák', 'Tónina: G'))).toEqual(['missingTitle', 'emptySection'])
    expect(codes(lines('Píseň', 'Autor: Jan Novák'))).toEqual(['emptySection'])
    expect(codes(lines('Píseň', '', ''))).toEqual(['titleFromFirstLine'])
  })
})

describe('parseMetaLine', () => {
  it.each([
    ['Autor: Jan Novák', { kind: 'artist', label: 'Autor', value: 'Jan Novák', generic: true }],
    ['Text a hudba: Jan Novák', { kind: 'artist', label: 'Text a hudba', value: 'Jan Novák', generic: true }],
    ['Text & hudba: Jan', { kind: 'artist', label: 'Text & hudba', value: 'Jan', generic: true }],
    ['T+H: Jan', { kind: 'artist', label: 'T+H', value: 'Jan', generic: true }],
    ['T&H: Jan', { kind: 'artist', label: 'T&H', value: 'Jan', generic: true }],
    ['T: Jan', { kind: 'artist', label: 'T', value: 'Jan', generic: false }],
    ['H: Petr', { kind: 'artist', label: 'H', value: 'Petr', generic: false }],
    ['Text: Jan', { kind: 'artist', label: 'Text', value: 'Jan', generic: false }],
    ['Hudba: Petr', { kind: 'artist', label: 'Hudba', value: 'Petr', generic: false }],
    ['Slova: Jan', { kind: 'artist', label: 'Slova', value: 'Jan', generic: false }],
    ['Překlad: Eva', { kind: 'artist', label: 'Překlad', value: 'Eva', generic: false }],
    ['Author: John', { kind: 'artist', label: 'Author', value: 'John', generic: true }],
    ['Words: John', { kind: 'artist', label: 'Words', value: 'John', generic: false }],
    ['Music: Paul', { kind: 'artist', label: 'Music', value: 'Paul', generic: false }],
    ['Words and music: John', { kind: 'artist', label: 'Words and music', value: 'John', generic: true }],
    ['Lyrics: John', { kind: 'artist', label: 'Lyrics', value: 'John', generic: false }],
    ['Composer: Paul', { kind: 'artist', label: 'Composer', value: 'Paul', generic: false }],
    ['Tónina: G', { kind: 'key', value: 'G' }],
    ['Key: F#', { kind: 'key', value: 'F#' }],
    ['tonina: Ami', { kind: 'key', value: 'Ami' }],
    ['Tónina: D dur', { kind: 'key', value: 'D' }],
    ['Tónina: a moll', { kind: 'key', value: 'Ami' }],
    ['CCLI: 1234567', { kind: 'ccli', value: '1234567' }],
    ['CCLI 1234567', { kind: 'ccli', value: '1234567' }],
    ['CCLI#1234567', { kind: 'ccli', value: '1234567' }],
    ['CCLI Song # 7654321', { kind: 'ccli', value: '7654321' }],
    ['© 2019 Ukázkové nakladatelství', { kind: 'copyright', value: '2019 Ukázkové nakladatelství' }],
    ['©2019 Někdo', { kind: 'copyright', value: '2019 Někdo' }],
    ['(c) 2019 Někdo', { kind: 'copyright', value: '2019 Někdo' }],
    ['Copyright 2019 Někdo', { kind: 'copyright', value: '2019 Někdo' }],
    ['Copyright © 2019 Někdo', { kind: 'copyright', value: '2019 Někdo' }]
  ])('%j', (line, meta) => expect(parseMetaLine(line)).toEqual(meta))

  it.each([
    'Text první sloky',
    'T bez dvojtečky',
    'Hudba zní',
    'Tónina: neznámá',
    'Key: X',
    'CCLI License # 123456',
    'Autor:',
    '©',
    'R: Text',
    'Text:'
  ])('%j → null', (line) => expect(parseMetaLine(line)).toBeNull())
})

describe('textToSong – chords over text', () => {
  it('merges chord lines into the following lyric line', () => {
    expect(cp(lines('Píseň', '', 'G       D', 'Text první sloky', 'Emi     C', 'druhý řádek'))).toBe(
      lines(
        '{title: Píseň}',
        '',
        '{start_of_verse: V1}',
        '[G]Text prv[D]ní sloky',
        '[Emi]druhý řá[C]dek',
        '{end_of_verse}',
        ''
      )
    )
  })

  it('merges a chord line into a marker line and moves chords of the removed prefix', () => {
    const song = textToSong(lines('Píseň', '', 'D  G       D', '1. Text první sloky')).song
    expect(serializeChordPro(song)).toContain('[D][G]Text prv[D]ní sloky')
    const song2 = textToSong(lines('Píseň', '', '   G       D', 'R: Text refrénu')).song
    expect(serializeChordPro(song2)).toContain('{start_of_chorus: C}\n[G]Text ref[D]rénu')
  })

  it('turns a chord line without lyrics into an instrumental line and warns', () => {
    const { song, warnings } = textToSong(lines('Píseň', '', 'Text', 'G  D', '', 'Druhá'))
    expect(serializeChordPro(song)).toContain('Text\n[G] [D]\n{end_of_verse}')
    expect(warnings).toEqual([{ code: 'chordLineWithoutText', line: 3 }])
  })

  it('does not warn about chords of an intro or interlude', () => {
    expect(codes(lines('Píseň', '', 'Intro:', 'G D Em C', '', 'Text'))).toEqual([])
    expect(codes(lines('Píseň', '', 'Intro: G D Em C', '', 'Text'))).toEqual([])
    expect(codes(lines('Píseň', '', 'Text', '', 'Mezihra: C G', '', 'Text 2'))).toEqual([])
  })

  it('reads chords written after the marker of an intro', () => {
    expect(cp(lines('Píseň', '', 'Intro: G D Emi C', '', '1. Text'))).toContain(
      '{start_of_intro: I}\n[G] [D] [Emi] [C]\n{end_of_intro}'
    )
  })

  it('aligns chords written on a marker line to the indented lyric line below it', () => {
    expect(cp(lines('Píseň', '', 'R:  G       D', '    Text refrénu'))).toContain(
      '{start_of_chorus: C}\n[G]Text ref[D]rénu\n{end_of_chorus}'
    )
  })

  it('makes an unmarked block of chords only an intro, interlude or outro', () => {
    const song = textToSong(lines('Píseň', '', 'G D', '', 'Text', '', 'C G', '', 'Text 2', '', 'G')).song
    expect(song.sections.map((s) => s.id)).toEqual(['I', 'V1', 'M', 'V2', 'O'])
  })

  it('keeps inline chords', () => {
    expect(cp(lines('Píseň', '', '[G]Text první [D]sloky', '1. [C]ne'))).toContain('[G]Text první [D]sloky')
  })

  it('keeps chords placed past the end of the text', () => {
    const { song } = textToSong(lines('Píseň', '', 'G          D', 'Haleluja'))
    expect(serializeChordPro(song)).toContain('[G]Haleluja   [D]')
  })
})

describe('textToSong – sections and markers', () => {
  it('creates sections from markers with the marker removed', () => {
    const song = textToSong(
      lines('Píseň', '', '1. Text první', 'druhý', '', 'R: Refrén', 'dál', '', '2. Druhá')
    ).song
    expect(song.sections.map((s) => [s.id, s.type])).toEqual([
      ['V1', 'verse'],
      ['C', 'chorus'],
      ['V2', 'verse']
    ])
    expect(sectionTexts(song)).toEqual([['Text první', 'druhý'], ['Refrén', 'dál'], ['Druhá']])
  })

  it('starts a new section at a marker inside a block', () => {
    const song = textToSong(lines('Píseň', '', '1. Text', 'druhý', 'R: Refrén', 'dál')).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'C'])
  })

  it('accepts a marker alone on the line before the lyrics', () => {
    const song = textToSong(lines('Song', '', 'Verse 1', 'Words', '', 'Chorus', 'Sing')).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'C'])
    expect(sectionTexts(song)).toEqual([['Words'], ['Sing']])
  })

  it('turns a standalone marker into a reference in the arrangement', () => {
    const song = textToSong(lines('Píseň', '', '1. Jdu', '', 'R: Zpívej', '', '2. Noc', '', 'R:')).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'C', 'V2'])
    expect(song.arrangement).toEqual(['V1', 'C', 'V2', 'C'])
  })

  it('reads a reference at the end of a block', () => {
    const song = textToSong(lines('Píseň', '', 'R: Zpívej', '', '1. Jdu', 'dál', 'R:', '', '2. Noc')).song
    expect(song.arrangement).toEqual(['C', 'V1', 'C', 'V2'])
  })

  it('repeats a reference with a repeat mark', () => {
    expect(textToSong(lines('P', '', 'R: Zpívej', '', '1. Jdu', '', 'Ref. 2×')).song.arrangement).toEqual([
      'C',
      'V1',
      'C',
      'C'
    ])
    expect(textToSong(lines('P', '', 'R: Zpívej', '', '1. Jdu', '', 'R (2x)')).song.arrangement).toEqual([
      'C',
      'V1',
      'C',
      'C'
    ])
  })

  it('repeats a section defined with a repeat mark', () => {
    const song = textToSong(lines('P', '', 'R: 2x', 'Zpívej', '', '1. Jdu')).song
    expect(song.arrangement).toEqual(['C', 'C', 'V1'])
  })

  it('references numbered sections by number', () => {
    const song = textToSong(
      lines('P', '', 'R1: Jdu', '', 'R2: Zpívej', '', '1. Noc', '', 'R1:', '', 'R:')
    ).song
    expect(song.sections.map((s) => s.id)).toEqual(['C', 'C2', 'V1'])
    expect(song.arrangement).toEqual(['C', 'C2', 'V1', 'C', 'C2'])
  })

  it('warns about a reference to a section that does not exist', () => {
    const { song, warnings } = textToSong(lines('P', '', '1. Jdu', '', 'Most:'))
    expect(song.arrangement).toEqual([])
    expect(warnings).toEqual([{ code: 'unknownReference', line: 4, detail: 'Most:' }])
  })

  it('applies a lone marker followed by a blank line to the next unmarked block', () => {
    const { song, warnings } = textToSong(lines('P', '', 'R:', '', 'Zpívej', 'dál', '', '1. Jdu'))
    expect(song.sections.map((s) => [s.id, s.type])).toEqual([
      ['C', 'chorus'],
      ['V1', 'verse']
    ])
    expect(warnings).toEqual([])
  })

  it('keeps the repeat of a lone marker for the block it announces', () => {
    const song = textToSong(lines('P', '', '1. Jdu', '', 'R:', '(2x)', '', 'Zpívej', 'dál')).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'C'])
    expect(song.arrangement).toEqual(['V1', 'C', 'C'])
  })

  it('repeats a block followed by a standalone repeat line', () => {
    expect(textToSong(lines('P', '', '1. Jdu', 'dál', '(2x)', '', 'R: Zpívej')).song.arrangement).toEqual([
      'V1',
      'V1',
      'C'
    ])
    expect(textToSong(lines('P', '', '1. Jdu', 'dál', '', '2x', '', 'R: Zpívej')).song.arrangement).toEqual([
      'V1',
      'V1',
      'C'
    ])
  })

  it('repeats a block whose last line ends with a repeat mark and removes the mark', () => {
    const song = textToSong(lines('P', '', '1. Jdu', 'dál (2x)', '', 'R: Zpívej 2x', '', '2. Noc')).song
    expect(song.arrangement).toEqual(['V1', 'V1', 'C', 'C', 'V2'])
    expect(sectionTexts(song)).toEqual([['Jdu', 'dál'], ['Zpívej'], ['Noc']])
  })

  it('keeps a repeat mark that is not on the last line of a block', () => {
    const song = textToSong(lines('P', '', '1. Jdu (2x)', 'dál', '(2x)', 'noc')).song
    expect(sectionTexts(song)).toEqual([['Jdu (2x)', 'dál', '(2x)', 'noc']])
    expect(song.arrangement).toEqual([])
  })

  it('turns a written-out repetition of a section into a reference', () => {
    const song = textToSong(
      lines('P', '', '1. Jdu', '', 'R: Refrén zní', 'dál', '', '2. Noc', '', 'Refrén  zní', 'Dál')
    ).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'C', 'V2'])
    expect(song.arrangement).toEqual(['V1', 'C', 'V2', 'C'])
  })

  it('makes an unmarked block written out twice the chorus when no chorus is marked', () => {
    const song = textToSong(
      lines(
        'P',
        '',
        'Jdu dál',
        'cestou',
        '',
        'Haleluja',
        'amen',
        '',
        'Noc je',
        'tichá',
        '',
        'Haleluja',
        'amen'
      )
    ).song
    expect(song.sections.map((s) => [s.id, s.type])).toEqual([
      ['V1', 'verse'],
      ['C', 'chorus'],
      ['V2', 'verse']
    ])
    expect(song.arrangement).toEqual(['V1', 'C', 'V2', 'C'])
  })

  it('keeps the verse type of a written-out repetition when a chorus is marked', () => {
    const song = textToSong(lines('P', '', 'Jdu dál', '', 'R: Zpívej', '', 'Jdu dál')).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'C'])
    expect(song.arrangement).toEqual(['V1', 'C', 'V1'])
  })

  it('does not make a verse repeated by a repeat mark the chorus', () => {
    expect(textToSong(lines('P', '', 'Jdu dál', '(2x)')).song.sections.map((s) => s.id)).toEqual(['V1'])
  })

  it('repeats an instrumental line ending with a repeat mark', () => {
    const song = textToSong(lines('P', '', 'Jdu dál', '', 'Mezihra:', 'G  D  (2x)', '', 'Noc')).song
    expect(song.arrangement).toEqual(['V1', 'M', 'M', 'V2'])
  })

  it('numbers unmarked blocks as verses, explicit numbers win', () => {
    const song = textToSong(lines('P', '', 'Jdu', '', '2. Noc', '', 'Ráno')).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'V2', 'V3'])
    const song2 = textToSong(lines('P', '', '1. Jdu', '', 'Noc', '', '2. Ráno')).song
    expect(song2.sections.map((s) => s.id)).toEqual(['V1', 'V3', 'V2'])
  })

  it('gives duplicate numbers the next free id', () => {
    const song = textToSong(lines('P', '', '1. Jdu', '', '1. Noc', '', 'R: Ráno', '', 'R: Večer')).song
    expect(song.sections.map((s) => s.id)).toEqual(['V1', 'V2', 'C', 'C2'])
  })

  it('stores an empty arrangement when it equals the order of the sections', () => {
    expect(textToSong(lines('P', '', '1. Jdu', '', 'R: Noc', '', '2. Ráno')).song.arrangement).toEqual([])
  })

  it('keeps the source line index of every lyric line', () => {
    const song = textToSong(lines('Píseň', '', 'G   D', '1. Text', 'druhý', '', 'Intro: G')).song
    const sources = song.sections.map((s) => s.lines.map((l) => (l.kind === 'lyrics' ? l.source : null)))
    expect(sources).toEqual([[3, 4], [6]])
  })

  it('removes leading indentation but keeps every other character', () => {
    expect(sectionTexts(textToSong(lines('P', '', '1. Text', '   druhý  řádek  ')).song)).toEqual([
      ['Text', 'druhý  řádek']
    ])
  })
})

describe('textToSong – robustness', () => {
  it.each([
    '',
    '\n\n\n',
    'R:',
    '(2x)',
    'G D',
    '1.',
    'R: 2x',
    '[',
    ']]][[',
    '© ',
    'Ref. 2×\n\nRef. 2×',
    'Název\n\nR:\n\nR:',
    '1. \n2. \n3.',
    'G\n\nD\n\nR:'
  ])('never throws: %j', (text) => {
    expect(() => textToSong(text)).not.toThrow()
  })

  it('returns no sections for meta-only input', () => {
    const { song } = textToSong(lines('Autor: Jan', '© 2020 X'))
    expect(song.sections).toEqual([])
    expect(song.meta.artist).toBe('Jan')
  })

  it('returns ids and timestamps empty', () => {
    const { song } = textToSong('Text')
    expect(song.id).toBe('')
    expect(song.updatedAt).toBe('')
  })
})

describe('applyTitleFallback', () => {
  it('fills the title from the first lyric line', () => {
    const { song } = textToSong(lines('Ano,', 'běž'))
    song.meta.title = ''
    expect(applyTitleFallback(song)).toEqual([{ code: 'titleFromFirstLine' }])
    expect(song.meta.title).toBe('Ano')
  })

  it('reports a missing title when there is nothing to take it from', () => {
    const { song } = textToSong('')
    expect(applyTitleFallback(song)).toEqual([{ code: 'missingTitle' }])
  })

  it('does nothing when there is a title', () => {
    const { song } = textToSong(lines('Píseň', '', 'Text'))
    expect(applyTitleFallback(song)).toEqual([])
  })
})
