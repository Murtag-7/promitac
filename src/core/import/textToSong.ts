import { isChord } from '../chordpro/chords'
import { emptySong, type SectionType, type Segment, type Song, type SongLine } from '../chordpro/model'
import { nextSectionId, SECTION_PREFIX } from '../chordpro/sections'
import { firstLyricLine, isChordOnlyLine, lineText } from '../chordpro/text'
import { fold } from '../search/normalize'
import { expandTabs, normalizeInputText } from '../util/text'
import { chordOnlyLine, isChordLine, mergeChordLine } from './chordLine'
import {
  foldKeepLength,
  parseMarker,
  parseRepeatLine,
  splitTrailingRepeat,
  type SectionMarker
} from './markers'

export type ImportWarning = {
  code: 'missingTitle' | 'titleFromFirstLine' | 'unknownReference' | 'emptySection' | 'chordLineWithoutText'
  /** Line index in the (normalised) input text. */
  line?: number
  detail?: string
}

export interface TextToSongResult {
  song: Song
  warnings: ImportWarning[]
}

// ---------------------------------------------------------------------------------------------
// Header / meta lines

export type MetaLine =
  | { kind: 'artist'; label: string; value: string; generic: boolean }
  | { kind: 'key'; value: string }
  | { kind: 'ccli'; value: string }
  | { kind: 'copyright'; value: string }

/** Labels naming the author as a whole ("Autor: X" → "X"). */
const GENERIC_AUTHOR_LABELS = [
  'autor',
  'autori',
  'autorka',
  'author',
  'authors',
  'artist',
  'interpret',
  'text a hudba',
  'text & hudba',
  'text + hudba',
  'hudba a text',
  'hudba & text',
  'slova a hudba',
  't+h',
  't&h',
  't + h',
  't & h',
  'words and music',
  'words & music',
  'music and words',
  'music & words'
]
/** Labels naming one role; kept in the text when several author lines are joined. */
const ROLE_AUTHOR_LABELS = [
  'text',
  't',
  'hudba',
  'h',
  'slova',
  'preklad',
  'cesky text',
  'skladatel',
  'words',
  'music',
  'lyrics',
  'composer',
  'translation',
  'translated by'
]
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const labelAlternation = (labels: string[]): string =>
  [...labels]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|')
const AUTHOR_RE = new RegExp(
  `^\\s*(${labelAlternation([...GENERIC_AUTHOR_LABELS, ...ROLE_AUTHOR_LABELS])})\\s*:`
)
const KEY_RE = /^\s*(?:tonina|key)\s*:/
const CCLI_RE = /^\s*ccli(?:\s*(?:song|pisen|cislo|number|no\.?|c\.))?\s*[:#]?\s*#?\s*(\d{3,8})\s*$/
const COPYRIGHT_RE = /^\s*(?:copyright\b\s*(?:©|\(c\))?|©|\(c\))\s*(.*?)\s*$/i
const MAJOR_KEY_RE = /^([A-Ha-h](?:is|es|#|b)?)\s*-?\s*(?:dur|major)$/i
const MINOR_KEY_RE = /^([A-Ha-h](?:is|es|#|b)?)\s*-?\s*(?:moll|mol|minor)$/i

/** A key written as a chord root (`G`, `Ami`, `F#`) or as `D dur` / `a moll`. */
function parseKey(value: string): string | null {
  const v = value.trim()
  if (v && !v.startsWith('(') && v !== 'N.C.' && v !== 'N.C' && isChord(v)) return v
  const capital = (root: string): string => root.charAt(0).toUpperCase() + root.slice(1)
  const major = MAJOR_KEY_RE.exec(v)
  if (major?.[1]) return capital(major[1])
  const minor = MINOR_KEY_RE.exec(v)
  if (minor?.[1]) return `${capital(minor[1])}mi`
  return null
}

/**
 * Recognise a header line that carries song metadata: author lines (`Autor:`, `Text a hudba:`,
 * `T:`, `Words:`…), the key (`Tónina: G`), a CCLI song number or a copyright line.
 */
export function parseMetaLine(line: string): MetaLine | null {
  const f = foldKeepLength(line)
  const author = AUTHOR_RE.exec(f)
  if (author?.[1]) {
    const labelStart = f.length - f.trimStart().length
    const labelEnd = labelStart + author[1].length
    const value = line.slice(author[0].length).trim()
    if (!value) return null
    const generic = GENERIC_AUTHOR_LABELS.includes(author[1])
    return { kind: 'artist', label: line.slice(labelStart, labelEnd), value, generic }
  }
  const key = KEY_RE.exec(f)
  if (key) {
    const value = parseKey(line.slice(key[0].length))
    return value ? { kind: 'key', value } : null
  }
  const ccli = CCLI_RE.exec(f)
  if (ccli?.[1]) return { kind: 'ccli', value: ccli[1] }
  const copyright = COPYRIGHT_RE.exec(line)
  if (copyright?.[1]) return { kind: 'copyright', value: copyright[1] }
  return null
}

class MetaCollector {
  private readonly artists: Array<Extract<MetaLine, { kind: 'artist' }>> = []
  private readonly copyrights: string[] = []
  private key: string | undefined
  private ccli: string | undefined

  add(meta: MetaLine): void {
    switch (meta.kind) {
      case 'artist':
        this.artists.push(meta)
        return
      case 'key':
        this.key ??= meta.value
        return
      case 'ccli':
        this.ccli ??= meta.value
        return
      case 'copyright':
        this.copyrights.push(meta.value)
    }
  }

  apply(song: Song): void {
    if (this.artists.length === 1) song.meta.artist = this.artists[0]?.value
    else if (this.artists.length > 1)
      song.meta.artist = this.artists.map((a) => (a.generic ? a.value : `${a.label}: ${a.value}`)).join(', ')
    if (this.key) song.meta.key = this.key
    if (this.ccli) song.meta.ccli = this.ccli
    if (this.copyrights.length > 0) song.meta.copyright = this.copyrights.join(', ')
  }
}

// ---------------------------------------------------------------------------------------------
// Line classification

type Row =
  | { kind: 'text'; idx: number; text: string }
  | { kind: 'chords'; idx: number; text: string }
  | { kind: 'repeat'; idx: number; text: string; n: number }
  | { kind: 'marker'; idx: number; text: string; marker: SectionMarker; rest: 'none' | 'chords' | 'text' }

const BRACKET_RE = /\[([^[\]]+)\]/g

function hasInlineChords(line: string): boolean {
  for (const m of line.matchAll(BRACKET_RE)) if (isChord((m[1] ?? '').trim())) return true
  return false
}

function classify(text: string, idx: number): Row {
  const n = parseRepeatLine(text)
  if (n !== null) return { kind: 'repeat', idx, text, n }
  const marker = parseMarker(text)
  if (marker) {
    const rest = !marker.rest.trim() ? 'none' : isChordLine(marker.rest) ? 'chords' : 'text'
    return { kind: 'marker', idx, text, marker, rest }
  }
  if (isChordLine(text)) return { kind: 'chords', idx, text }
  return { kind: 'text', idx, text }
}

const isBlank = (line: string | undefined): boolean => line === undefined || line.trim() === ''

function isTitleCandidate(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 80 || /[,;]$/.test(t)) return false
  if (parseMarker(line) || isChordLine(line) || parseMetaLine(line) || parseRepeatLine(line) !== null)
    return false
  return !hasInlineChords(line)
}

/**
 * The first line is the title when it cannot be part of the lyrics block below: it is followed by a
 * blank line (and more text), by meta lines, or by a section marker (optionally with chords above).
 */
function isTitleAt(lines: string[], i: number): boolean {
  const line = lines[i] ?? ''
  if (!isTitleCandidate(line)) return false
  const next = lines[i + 1]
  if (next === undefined) return false
  if (isBlank(next)) return lines.slice(i + 2).some((l) => !isBlank(l))
  if (parseMetaLine(next) || parseMarker(next)) return true
  const after = lines[i + 2]
  return isChordLine(next) && after !== undefined && parseMarker(after) !== null
}

// ---------------------------------------------------------------------------------------------
// Segments

/** `[G]Text [D]dál` → segments (same rules as the ChordPro parser: any `[…]` is a chord). */
function parseInline(line: string): Segment[] {
  const segments: Segment[] = []
  let chord: string | null = null
  let text = ''
  let i = 0
  while (i < line.length) {
    const open = line.indexOf('[', i)
    const close = open === -1 ? -1 : line.indexOf(']', open + 1)
    if (open === -1 || close === -1) {
      text += line.slice(i)
      break
    }
    text += line.slice(i, open)
    const token = line.slice(open + 1, close).trim()
    i = close + 1
    if (!token) continue
    if (chord !== null || text) segments.push({ chord, text })
    chord = token
    text = ''
  }
  if (chord !== null || text) segments.push({ chord, text })
  return segments
}

/**
 * Remove the first `count` characters of text. Chords standing inside the removed part move to the
 * start of the remaining text, in their order.
 */
function dropLeading(segments: Segment[], count: number): Segment[] {
  if (count <= 0) return segments
  const out: Segment[] = []
  const moved: string[] = []
  let remaining = count
  for (const seg of segments) {
    if (remaining === 0) {
      out.push(seg)
      continue
    }
    if (seg.chord !== null) moved.push(seg.chord)
    if (seg.text.length <= remaining) {
      remaining -= seg.text.length
      continue
    }
    out.push({ chord: null, text: seg.text.slice(remaining) })
    remaining = 0
  }
  if (moved.length === 0) return out
  const lead: Segment[] = moved.map((chord) => ({ chord, text: '' }))
  const first = out[0]
  const last = lead[lead.length - 1]
  if (first && first.chord === null && last) {
    last.text = first.text
    out.shift()
  }
  return [...lead, ...out]
}

/** Strip leading indentation and trailing spaces; chords keep their place relative to the text. */
function trimSegments(segments: Segment[]): Segment[] {
  const full = segments.map((s) => s.text).join('')
  const out = dropLeading(segments, full.length - full.trimStart().length).map((s) => ({ ...s }))
  for (;;) {
    const last = out[out.length - 1]
    if (!last) break
    last.text = last.text.trimEnd()
    if (last.chord === null && last.text === '') out.pop()
    else break
  }
  return out
}

function textKey(lines: SongLine[]): string {
  return lines
    .map((l) => fold(lineText(l)).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------------------------------------
// Body

/** Sections whose chord-only lines are expected (no `chordLineWithoutText` warning). */
const INSTRUMENTAL = new Set<SectionType>(['intro', 'interlude', 'outro', 'ending'])

interface Draft {
  type: SectionType
  number?: number
  /** Created by a marker (keeps its type when deduplicated), not just by a blank-line block. */
  explicit: boolean
  repeat: number
  line: number
  lines: SongLine[]
  chordWarnings: ImportWarning[]
  key: string
  /** An unmarked block that appeared again written out in full (a chorus without a marker). */
  writtenTwice?: boolean
}

interface Pending {
  marker: SectionMarker
  idx: number
  text: string
}

function numberedId(type: SectionType, n: number): string {
  const prefix = SECTION_PREFIX[type]
  return type === 'verse' || n > 1 ? `${prefix}${n}` : prefix
}

function blockStartsWithMarker(block: Row[] | undefined): boolean {
  if (!block) return false
  const [first, second] = block
  return first?.kind === 'marker' || (first?.kind === 'chords' && second?.kind === 'marker')
}

class BodyBuilder {
  readonly drafts: Draft[] = []
  readonly order: Draft[] = []
  readonly warnings: ImportWarning[] = []
  private current: Draft | null = null
  private pending: Pending | null = null

  build(blocks: Row[][]): void {
    blocks.forEach((block, b) => this.block(block, blocks[b + 1], b === blocks.length - 1))
    if (this.pending) this.unknownReference(this.pending)
    if (!this.drafts.some((d) => d.type === 'chorus')) {
      for (const d of this.drafts) if (d.writtenTwice) d.type = 'chorus'
    }
  }

  private block(input: Row[], nextBlock: Row[] | undefined, isLast: boolean): void {
    const pendingBefore = this.pending
    let rows = input
    let blockRepeat = 1
    const tail = rows[rows.length - 1]
    if (tail?.kind === 'repeat') {
      if (rows.length === 1) {
        this.repeatLast(tail.n)
        return
      }
      blockRepeat = tail.n
      rows = rows.slice(0, -1)
    }
    rows = this.stripTrailingRepeat(rows, (n) => (blockRepeat = Math.max(blockRepeat, n)))
    const lastRow = rows[rows.length - 1]
    if (lastRow?.kind === 'chords') {
      // `G D Em C (2x)` – chord tokens ignore the mark, the section is played again.
      const split = splitTrailingRepeat(lastRow.text)
      if (split) blockRepeat = Math.max(blockRepeat, split.repeat)
    }

    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]
      const next = rows[j + 1]
      if (!row) continue
      if (row.kind === 'marker') {
        const { marker } = row
        if (row.rest === 'none') {
          if (!next || next.kind === 'marker') {
            this.close(false)
            this.reference(
              { marker, idx: row.idx, text: row.text },
              rows.length === 1 ? nextBlock : undefined
            )
          } else {
            this.open(marker, row.idx)
          }
          continue
        }
        this.open(marker, row.idx)
        if (row.rest === 'chords') {
          if (!INSTRUMENTAL.has(marker.type) && next?.kind === 'text') {
            // Chords written after the marker belong to the (indented) lyric line below.
            const chords = ' '.repeat(marker.prefixLength) + marker.rest
            this.lyric(mergeChordLine(chords, next.text), next.idx, 0)
            j++
          } else {
            this.chordOnly(marker.rest, row.idx, false)
          }
        } else {
          this.lyric(row.text, row.idx, marker.prefixLength)
        }
        continue
      }
      if (row.kind === 'chords') {
        if (next?.kind === 'text') {
          this.ensure(row.idx)
          this.lyric(mergeChordLine(row.text, next.text), next.idx, 0)
          j++
        } else if (next?.kind === 'marker' && next.rest === 'text') {
          this.open(next.marker, next.idx)
          this.lyric(mergeChordLine(row.text, next.text), next.idx, next.marker.prefixLength)
          j++
        } else {
          this.ensure(row.idx)
          this.chordOnly(row.text, row.idx, true)
        }
        continue
      }
      // Plain lyrics; a repeat mark inside a block stays in the text.
      this.ensure(row.idx)
      this.lyric(row.text, row.idx, 0)
    }

    if (this.current) {
      this.current.repeat = Math.max(this.current.repeat, blockRepeat)
      this.close(isLast)
    } else if (blockRepeat > 1 && this.pending && this.pending !== pendingBefore) {
      // `R:` + `(2x)` announcing the next block: the repeat belongs to that block.
      const { marker } = this.pending
      this.pending = {
        ...this.pending,
        marker: { ...marker, repeat: Math.max(marker.repeat ?? 1, blockRepeat) }
      }
    } else if (blockRepeat > 1) {
      this.repeatLast(blockRepeat)
    }
  }

  /** `… text (2x)` on the last line of a block: remove the mark, report the count. */
  private stripTrailingRepeat(rows: Row[], onRepeat: (n: number) => void): Row[] {
    const last = rows[rows.length - 1]
    if (!last || !(last.kind === 'text' || (last.kind === 'marker' && last.rest === 'text'))) return rows
    const split = splitTrailingRepeat(last.text)
    if (!split) return rows
    if (last.kind === 'marker' && split.text.length <= last.marker.prefixLength) return rows
    onRepeat(split.repeat)
    const replaced: Row =
      last.kind === 'marker'
        ? {
            ...last,
            text: split.text,
            marker: { ...last.marker, rest: split.text.slice(last.marker.prefixLength) }
          }
        : { ...last, text: split.text }
    return [...rows.slice(0, -1), replaced]
  }

  private open(marker: SectionMarker, idx: number): void {
    this.close(false)
    if (this.pending) {
      this.unknownReference(this.pending)
      this.pending = null
    }
    this.current = this.draft(marker.type, true, idx, marker.number, marker.repeat)
  }

  /** Lines outside of any marked section start a verse (or the section a lone marker announced). */
  private ensure(idx: number): Draft {
    if (this.current) return this.current
    const pending = this.pending
    this.pending = null
    this.current = pending
      ? this.draft(pending.marker.type, true, pending.idx, pending.marker.number, pending.marker.repeat)
      : this.draft('verse', false, idx)
    return this.current
  }

  private draft(type: SectionType, explicit: boolean, line: number, number?: number, repeat?: number): Draft {
    return {
      type,
      explicit,
      line,
      repeat: repeat ?? 1,
      lines: [],
      chordWarnings: [],
      key: '',
      ...(number !== undefined ? { number } : {})
    }
  }

  private lyric(raw: string, idx: number, prefixLength: number): void {
    const segments = trimSegments(dropLeading(parseInline(raw), prefixLength))
    if (segments.length === 0) return
    this.ensure(idx).lines.push({ kind: 'lyrics', segments, source: idx })
  }

  private chordOnly(chords: string, idx: number, warn: boolean): void {
    const segments = parseInline(chordOnlyLine(chords))
    if (segments.length === 0) return
    const draft = this.ensure(idx)
    draft.lines.push({ kind: 'lyrics', segments, source: idx })
    if (warn) draft.chordWarnings.push({ code: 'chordLineWithoutText', line: idx })
  }

  private close(isLastBlock: boolean): void {
    const d = this.current
    this.current = null
    if (!d) return
    if (d.lines.length === 0) {
      this.warnings.push({ code: 'emptySection', line: d.line })
      return
    }
    if (!d.explicit && d.lines.every(isChordOnlyLine)) {
      const hasLyrics = this.drafts.some((o) => o.key !== '')
      d.type = !hasLyrics ? 'intro' : isLastBlock ? 'outro' : 'interlude'
    }
    if (!INSTRUMENTAL.has(d.type)) this.warnings.push(...d.chordWarnings)
    d.key = textKey(d.lines)
    if (d.key) {
      // A section written out again (e.g. the chorus) becomes a repetition, not a copy.
      const same = this.drafts.find((o) => o.key === d.key && (!d.explicit || o.type === d.type))
      if (same) {
        if (!d.explicit && !same.explicit && same.type === 'verse') same.writtenTwice = true
        this.push(same, d.repeat)
        return
      }
    }
    this.drafts.push(d)
    this.push(d, d.repeat)
  }

  private reference(ref: Pending, nextBlock: Row[] | undefined): void {
    const target = this.resolve(ref.marker)
    if (target) {
      this.push(target, ref.marker.repeat ?? 1)
      return
    }
    if (nextBlock && !blockStartsWithMarker(nextBlock)) {
      // `R:` alone, a blank line, then the text of the chorus.
      if (this.pending) this.unknownReference(this.pending)
      this.pending = ref
      return
    }
    this.unknownReference(ref)
  }

  private resolve(marker: SectionMarker): Draft | undefined {
    const ofType = this.drafts.filter((d) => d.type === marker.type)
    if (marker.number === undefined) return ofType[ofType.length - 1]
    const byNumber = ofType.filter((d) => d.number === marker.number)
    if (byNumber.length > 0) return byNumber[byNumber.length - 1]
    // Unmarked verses are numbered in order: "2." alone refers to the second verse.
    return marker.type === 'verse' && ofType.every((d) => d.number === undefined)
      ? ofType[marker.number - 1]
      : undefined
  }

  private unknownReference(ref: Pending): void {
    this.warnings.push({ code: 'unknownReference', line: ref.idx, detail: ref.text.trim() })
  }

  private push(d: Draft, times: number): void {
    for (let k = 0; k < Math.max(1, times); k++) this.order.push(d)
  }

  /** Make the last arrangement entry appear `n` times in a row. */
  private repeatLast(n: number): void {
    const last = this.order[this.order.length - 1]
    if (!last) return
    let k = 0
    for (let i = this.order.length - 1; i >= 0 && this.order[i] === last; i--) k++
    for (; k < n; k++) this.order.push(last)
  }
}

function assignIds(drafts: Draft[]): Map<Draft, string> {
  const used = new Set<string>()
  const ids = new Map<Draft, string>()
  for (const d of drafts) {
    if (d.number === undefined) continue
    const id = numberedId(d.type, d.number)
    if (used.has(id)) continue
    used.add(id)
    ids.set(d, id)
  }
  for (const d of drafts) {
    if (ids.has(d)) continue
    const id = nextSectionId(d.type, [...used])
    used.add(id)
    ids.set(d, id)
  }
  return ids
}

/**
 * When the song has no title, use its first lyric line (without chords and trailing `,.;:`).
 * Returns `titleFromFirstLine`, or `missingTitle` when the song has no lyrics either.
 */
export function applyTitleFallback(song: Song): ImportWarning[] {
  if (song.meta.title.trim()) return []
  const title = firstLyricLine(song).replace(/[\s,.;:]+$/, '')
  if (!title) return [{ code: 'missingTitle' }]
  song.meta.title = title
  return [{ code: 'titleFromFirstLine' }]
}

/**
 * Convert a song pasted as text (plain lyrics, chords above the lyrics or inline `[C]` chords,
 * with or without section markers) into a Song. Only the format changes: section markers, repeat
 * marks, chord lines and header lines are removed, every lyric line keeps its characters (leading
 * indentation and trailing spaces aside). `SongLine.source` holds the input line index. Never throws.
 */
export function textToSong(text: string): TextToSongResult {
  const lines = normalizeInputText(text)
    .split('\n')
    .map((l) => expandTabs(l))
  const song = emptySong('', '')
  const meta = new MetaCollector()

  // Header: title and meta lines before the first lyric block.
  let start = 0
  let title = ''
  while (start < lines.length) {
    const line = lines[start] ?? ''
    if (isBlank(line)) {
      start++
      continue
    }
    const m = parseMetaLine(line)
    if (m) {
      meta.add(m)
      start++
      continue
    }
    if (!title && isTitleAt(lines, start)) {
      title = line.trim()
      start++
      continue
    }
    break
  }

  // Trailing meta lines (copyright, CCLI, authors) after the last lyric block.
  let end = lines.length
  const trailing: MetaLine[] = []
  for (let i = lines.length - 1; i >= start; i--) {
    const line = lines[i] ?? ''
    if (isBlank(line)) continue
    const m = parseMetaLine(line)
    if (!m) break
    trailing.unshift(m)
    end = i
  }
  for (const m of trailing) meta.add(m)

  const blocks: Row[][] = []
  let block: Row[] = []
  for (let i = start; i < end; i++) {
    const line = lines[i] ?? ''
    if (isBlank(line)) {
      if (block.length > 0) blocks.push(block)
      block = []
      continue
    }
    block.push(classify(line, i))
  }
  if (block.length > 0) blocks.push(block)

  const body = new BodyBuilder()
  body.build(blocks)

  const ids = assignIds(body.drafts)
  const idOf = (d: Draft): string => ids.get(d) ?? ''
  song.sections = body.drafts.map((d) => ({ id: idOf(d), type: d.type, lines: d.lines }))
  const sameAsDefinition =
    body.order.length === body.drafts.length && body.order.every((d, i) => d === body.drafts[i])
  song.arrangement = sameAsDefinition ? [] : body.order.map(idOf)
  song.meta.title = title
  meta.apply(song)

  const warnings = [...body.warnings, ...applyTitleFallback(song)]
  if (song.sections.length === 0) warnings.push({ code: 'emptySection' })
  return { song, warnings }
}
