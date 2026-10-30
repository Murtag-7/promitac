import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeChordPro } from '../chordpro/serialize'
import { lineText } from '../chordpro/text'
import type { SectionType } from '../chordpro/model'
import { expandTabs, normalizeInputText } from '../util/text'
import { isChordLine } from './chordLine'
import { importText, type ImportResult } from './importText'
import { parseMarker, parseRepeatLine, splitTrailingRepeat } from './markers'
import { parseMetaLine } from './textToSong'

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/import', import.meta.url))
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')
const CASES = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => f.slice(0, -'.txt'.length))
  .sort()

const stripBrackets = (s: string): string => s.replace(/\[[^\]]*\]/g, '')
const isBlank = (s: string | undefined): boolean => s === undefined || s.trim() === ''
const key = (lines: string[]): string => lines.map((l) => l.normalize('NFC').replace(/\s+/g, ' ')).join('\n')

/** Lyric lines of the result in section-definition order (chords stripped, trimmed, non-empty). */
function resultLines(result: ImportResult): string[] {
  return result.song.sections.flatMap((s) => s.lines.map((l) => lineText(l).trim()).filter(Boolean))
}

/**
 * Independent oracle for the "text does not change" rule: the lyric lines the input must produce.
 * Removed from the input are only blank lines, header/trailing meta lines, the title line, chord
 * lines, standalone markers and repeat marks, marker prefixes, a repeat mark at the end of a
 * block, and blocks written out again (they become a repetition in the arrangement).
 */
function expectedLines(input: string, result: ImportResult): string[] {
  const lines = normalizeInputText(input)
    .split('\n')
    .map((l) => expandTabs(l))

  if (result.format === 'chordpro') {
    return lines
      .filter((l) => {
        const t = l.trim()
        return t && !t.startsWith('#') && !(t.startsWith('{') && t.endsWith('}'))
      })
      .map((l) => stripBrackets(l).trim())
      .filter(Boolean)
  }

  const titleFromHeader = !result.warnings.some(
    (w) => w.code === 'titleFromFirstLine' || w.code === 'missingTitle'
  )
  let start = 0
  let titleSeen = false
  while (start < lines.length) {
    const l = lines[start] ?? ''
    if (isBlank(l) || parseMetaLine(l)) start++
    else if (titleFromHeader && !titleSeen && l.trim() === result.song.meta.title) {
      titleSeen = true
      start++
    } else break
  }
  let end = lines.length
  for (let i = lines.length - 1; i >= start; i--) {
    const l = lines[i] ?? ''
    if (isBlank(l)) continue
    if (!parseMetaLine(l)) break
    end = i
  }

  // Blocks of non-blank lines.
  const blocks: string[][] = []
  let block: string[] = []
  for (const l of [...lines.slice(start, end), '']) {
    if (isBlank(l)) {
      if (block.length > 0) blocks.push(block)
      block = []
    } else block.push(l)
  }

  // Groups = sections: a new one at every block and every marker; marked groups carry their type.
  const groups: Array<{ type: SectionType | null; lines: string[] }> = []
  for (const b of blocks) {
    const rows = [...b]
    if (parseRepeatLine(rows[rows.length - 1] ?? '') !== null) rows.pop()
    const lastIdx = rows.length - 1
    let group: { type: SectionType | null; lines: string[] } = { type: null, lines: [] }
    groups.push(group)
    rows.forEach((row, i) => {
      let text = row
      if (i === lastIdx && !isChordLine(row)) {
        const split = splitTrailingRepeat(row)
        const m = parseMarker(row)
        if (split && (!m || split.text.length > m.prefixLength)) text = split.text
      }
      const marker = parseRepeatLine(text) === null ? parseMarker(text) : null
      if (marker) {
        group = { type: marker.type, lines: [] }
        groups.push(group)
        if (marker.rest.trim() && !isChordLine(marker.rest)) group.lines.push(marker.rest)
        return
      }
      if (isChordLine(text)) return
      group.lines.push(text)
    })
  }

  const kept: Array<{ type: SectionType | null; key: string }> = []
  const out: string[] = []
  for (const g of groups) {
    const texts = g.lines.map((l) => stripBrackets(l).trim()).filter(Boolean)
    if (texts.length === 0) continue
    const k = key(texts)
    if (kept.some((o) => o.key === k && (g.type === null || o.type === g.type))) continue
    kept.push({ type: g.type, key: k })
    out.push(...texts)
  }
  return out
}

/** Assert the text invariant for one input. */
function expectTextUnchanged(input: string): ImportResult {
  const result = importText(input)
  expect(resultLines(result)).toEqual(expectedLines(input, result))
  return result
}

describe('golden import fixtures', () => {
  it('has at least 10 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(10)
  })

  describe.each(CASES)('%s', (name) => {
    const input = read(`${name}.txt`)

    it('produces the expected ChordPro', () => {
      const result = importText(input)
      expect(serializeChordPro(result.song, { includeAppMeta: false })).toBe(
        read(`${name}.expected.chordpro`)
      )
    })

    it('keeps every lyric line unchanged', () => {
      const result = expectTextUnchanged(input)
      expect(resultLines(result).length).toBeGreaterThan(0)
    })

    it('gives the same result for CRLF / NFD / BOM input', () => {
      const dirty = String.fromCharCode(0xfeff) + input.normalize('NFD').replace(/\n/g, '\r\n')
      expect(serializeChordPro(importText(dirty).song)).toBe(serializeChordPro(importText(input).song))
    })

    it('round-trips through the ChordPro parser', () => {
      const expected = read(`${name}.expected.chordpro`)
      expect(serializeChordPro(importText(expected).song, { includeAppMeta: false })).toBe(expected)
    })
  })

  it('reports the expected formats and warnings', () => {
    const summary = Object.fromEntries(
      CASES.map((name) => {
        const r = importText(read(`${name}.txt`))
        return [name, [r.format, ...r.warnings.map((w) => w.code)].join(' ')]
      })
    )
    expect(summary).toEqual({
      '01-chords-reference': 'chords-over-text',
      '02-inline-chords': 'inline-chords',
      '03-plain-stanzas': 'plain titleFromFirstLine',
      '04-numbered-verses': 'chords-over-text',
      '05-ref-repeat': 'plain',
      '06-prechorus-bridge': 'plain',
      '07-header-meta': 'chords-over-text',
      '08-chordpro-passthrough': 'chordpro',
      '09-duplicate-chorus': 'plain',
      '10-tabs-trailing': 'chords-over-text',
      '11-german-chords': 'chords-over-text',
      '12-english-markers': 'chords-over-text',
      '13-intro-instrumental': 'chords-over-text',
      '14-repeat-marks': 'plain'
    })
  })
})

describe('text invariant oracle', () => {
  it('notices a changed character, a lost line and a dropped section', () => {
    const input = read('01-chords-reference.txt')
    const changed = importText(input)
    const seg = changed.song.sections[0]?.lines[0]
    if (seg?.kind === 'lyrics' && seg.segments[0]) seg.segments[0].text = seg.segments[0].text.toUpperCase()
    expect(resultLines(changed)).not.toEqual(expectedLines(input, changed))

    const lost = importText(input)
    lost.song.sections[1]?.lines.pop()
    expect(resultLines(lost)).not.toEqual(expectedLines(input, lost))

    const dropped = importText(input)
    dropped.song.sections.pop()
    expect(resultLines(dropped)).not.toEqual(expectedLines(input, dropped))
  })
})

describe('text invariant on assorted inputs', () => {
  it.each([
    'Píseň\n\nG   D\n1. Text první\nEmi\ndruhý řádek\n\nR: Refrén zní\n\nR:',
    'Píseň\n\n1. Jdu dál (2x)\ncestou\n(2x)\nnocí\n\n2x',
    'R: Zpívej\n\n1. Jdu\n\nZpívej',
    'Text bez názvu,\ndalší řádek\n\nDruhá sloka',
    'Píseň\n\nR:  G       D\n    Text refrénu\n    a dál',
    'Píseň\n\n[Chorus]\nSing [G]loud\n\n[Verse 1]\nWalk [D]on\n\n(R)',
    'Píseň\nT: Jan\nH: Petr\n\n   D  G\n1. Text\n\n© 2020 Nikdo',
    'Píseň\n\nR:\n\nZpívej dál\n\n1. Jdu\n\nR:'
  ])('%j', (input) => {
    expectTextUnchanged(input)
  })
})
