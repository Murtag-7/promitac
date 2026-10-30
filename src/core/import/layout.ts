import { isChord } from '../chordpro/chords'
import { splitByGlyphWidth } from '../ocr/glyphWidths'
import { isChordLine } from './chordLine'
import type { OcrWord, UncertainWord } from './ocrTypes'

/**
 * Page layout reconstruction for OCR and PDF words: words with boxes → lines → text with inline
 * ChordPro chords. Chords are aligned to the lyric syllable by x coordinate (not by spaces),
 * which is the only reliable cue on proportional-font songbook pages.
 *
 * The lyric text itself is never changed: a lyric line is its words joined by single spaces.
 */

export interface WordsToTextOptions {
  /** Words below this confidence (0–100) are reported as uncertain. Default 65. */
  lowConfidence?: number
}

export interface WordsToTextResult {
  text: string
  uncertain: UncertainWord[]
}

/** Tokens on chord lines that carry no chord (bar lines, repeat marks…) – same set as chordLine.ts. */
const IGNORABLE = /^(?:\|+|\|:|:\||\/+|[-–—]+|\.+|%|\*|x\d+|\d+x|\(\d+x\)|×\d+|\d+×|\(\d+×\))$/i
/** Chord lines consist of short tokens only. */
const MAX_CHORD_TOKEN_LENGTH = 10
/** A word joins a line when its centre is within this share of the median word height. */
const LINE_CENTRE_TOLERANCE = 0.5
/** A chord line is merged into the lyric line below only when it is this close (× line height). */
const CHORD_TO_LYRIC_MAX_GAP = 1.0
/** Stanza break: absolute gap threshold (× median lyric line height) … */
const STANZA_GAP_ABS = 1.6
/** … or this much more than the typical gap between lines of the page. */
const STANZA_GAP_REL = 0.75

interface Line {
  words: OcrWord[]
  top: number
  bottom: number
  yc: number
  isChord: boolean
}

interface Flagged {
  word: OcrWord
  /** Index of the output line (before stanza blank lines are inserted). */
  unit: number
}

interface Unit {
  text: string
  top: number
  bottom: number
}

export type TokenKind = 'chord' | 'unknown' | 'label' | 'skip'

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

const height = (w: OcrWord): number => w.bbox.y1 - w.bbox.y0
const centre = (w: OcrWord): number => (w.bbox.y0 + w.bbox.y1) / 2

/**
 * Words grouped into text lines, top to bottom, each line sorted left to right (empty words
 * dropped). Shared with the OCR chord pass, which re-reads chord lines.
 */
export function groupWordLines(words: OcrWord[]): OcrWord[][] {
  return groupLines(cleanWords(words)).map((l) => l.words)
}

function cleanWords(words: OcrWord[]): OcrWord[] {
  return words
    .map((w) => ({ ...w, text: w.text.trim() }))
    .filter((w) => w.text.length > 0 && w.bbox.x1 >= w.bbox.x0 && w.bbox.y1 >= w.bbox.y0)
}

/**
 * Cluster words into text lines. A word joins the line of its horizontally nearest word when the
 * centres are within the tolerance or the boxes overlap vertically by half; comparing with the
 * nearest word (not the line average) keeps slightly skewed lines together. When several lines
 * qualify, the horizontally adjacent one wins (OCR boxes of one line may even overlap).
 */
function groupLines(words: OcrWord[]): Line[] {
  const sorted = [...words].sort((a, b) => centre(a) - centre(b) || a.bbox.x0 - b.bbox.x0)
  const tolerance = LINE_CENTRE_TOLERANCE * median(sorted.map(height))
  const groups: OcrWord[][] = []
  for (const word of sorted) {
    let best: OcrWord[] | null = null
    let bestDx = Infinity
    let bestDist = Infinity
    for (const group of groups) {
      let ref: OcrWord | null = null
      let refDx = Infinity
      for (const other of group) {
        const dx = Math.max(0, other.bbox.x0 - word.bbox.x1, word.bbox.x0 - other.bbox.x1)
        if (dx < refDx) {
          refDx = dx
          ref = other
        }
      }
      if (!ref) continue
      const dist = Math.abs(centre(word) - centre(ref))
      const overlapY = Math.min(word.bbox.y1, ref.bbox.y1) - Math.max(word.bbox.y0, ref.bbox.y0)
      const sameRow = dist <= tolerance || overlapY >= 0.5 * Math.min(height(word), height(ref))
      if (sameRow && (refDx < bestDx || (refDx === bestDx && dist < bestDist))) {
        bestDx = refDx
        bestDist = dist
        best = group
      }
    }
    if (best) best.push(word)
    else groups.push([word])
  }
  return groups
    .map((g) => {
      const ws = g.sort((a, b) => a.bbox.x0 - b.bbox.x0)
      const text = ws.map((w) => w.text).join(' ')
      return {
        words: ws,
        top: Math.min(...ws.map((w) => w.bbox.y0)),
        bottom: Math.max(...ws.map((w) => w.bbox.y1)),
        yc: ws.reduce((s, w) => s + centre(w), 0) / ws.length,
        isChord: isChordLine(text) && ws.every((w) => w.text.length <= MAX_CHORD_TOKEN_LENGTH)
      }
    })
    .sort((a, b) => a.yc - b.yc)
}

/**
 * Role of a token on a chord line: a chord, a label such as "Intro:", a bar line / repeat mark to
 * skip, or an unknown (probably misread) token.
 */
export function chordTokenKind(text: string): TokenKind {
  if (IGNORABLE.test(text) || !/[\p{L}\p{N}]/u.test(text)) return 'skip'
  if (isChord(text)) return 'chord'
  if (text.endsWith(':')) return 'label'
  return 'unknown'
}

/** Symbol boxes may overlap by this share of the word height (ink of italics, kerning). */
const SYMBOL_OVERLAP_TOLERANCE = 0.06

/**
 * Symbol boxes are usable when they spell the word and run left to right without overlapping.
 * Tesseract's LSTM character boxes sometimes drift (overlapping, shifted left), then the glyph
 * width estimate inside the – reliable – word box is closer to the truth.
 */
function usableSymbols(word: OcrWord): boolean {
  const symbols = word.symbols
  if (!symbols || symbols.length === 0 || symbols.map((s) => s.text).join('') !== word.text) return false
  const tolerance = SYMBOL_OVERLAP_TOLERANCE * (word.bbox.y1 - word.bbox.y0)
  for (let i = 1; i < symbols.length; i++) {
    const prev = symbols[i - 1]!
    const cur = symbols[i]!
    if (cur.x0 < prev.x0 || cur.x0 < prev.x1 - tolerance) return false
  }
  return true
}

/** Per UTF-16 code unit x ranges of a word: consistent symbol boxes, else glyph-width estimate. */
function charRanges(word: OcrWord): Array<[number, number]> {
  if (usableSymbols(word)) {
    const out: Array<[number, number]> = []
    for (const s of word.symbols!) for (let i = 0; i < s.text.length; i++) out.push([s.x0, s.x1])
    return out
  }
  return splitByGlyphWidth(word.text, word.bbox.x0, word.bbox.x1)
}

interface PlacedWord {
  /** Index of the word's first character in the joined lyric text. */
  start: number
  x0: number
  x1: number
  /** Left edge of every character (ink boxes from OCR, or interpolated). */
  charX0: number[]
}

/**
 * Character index in front of which a chord whose ink starts at `x` belongs, or 'end' when it
 * stands past the last word. Within a word the nearest character start wins (chords are printed
 * left-aligned with their syllable; OCR ink boxes of narrow letters are much thinner than their
 * advance, so "contains" tests are fragile). A chord in the gap between two words belongs to the
 * next word.
 */
function anchorIndex(x: number, words: PlacedWord[]): number | 'end' {
  const last = words[words.length - 1]!
  if (x >= last.x1) return 'end'
  for (let k = 0; k < words.length; k++) {
    const word = words[k]!
    if (x < word.x0) return word.start
    if (x >= word.x1) continue
    let best = word.start
    let bestDist = Infinity
    word.charX0.forEach((cx, i) => {
      const d = Math.abs(cx - x)
      if (d < bestDist) {
        bestDist = d
        best = word.start + i
      }
    })
    const next = words[k + 1]
    if (next && Math.abs(next.x0 - x) < bestDist) best = next.start
    return best
  }
  return 'end'
}

/** Merge a chord line into the lyric line below it. */
function mergeChords(chords: Line, lyric: Line, lowConfidence: number): { text: string; flagged: OcrWord[] } {
  let text = ''
  const placed: PlacedWord[] = []
  for (const word of lyric.words) {
    if (text) text += ' '
    placed.push({
      start: text.length,
      x0: word.bbox.x0,
      x1: word.bbox.x1,
      charX0: charRanges(word).map((r) => r[0])
    })
    text += word.text
  }

  const inline: Array<{ pos: number; chord: string }> = []
  const appended: string[] = []
  const labels: string[] = []
  const flagged: OcrWord[] = []
  for (const word of chords.words) {
    const kind = chordTokenKind(word.text)
    if (kind === 'skip') continue
    if (kind === 'label') {
      labels.push(word.text)
      continue
    }
    if (kind === 'unknown' || word.confidence < lowConfidence) flagged.push(word)
    const pos = anchorIndex(word.bbox.x0, placed)
    if (pos === 'end') appended.push(word.text)
    else inline.push({ pos, chord: word.text })
  }
  inline.sort((a, b) => a.pos - b.pos)
  let out = ''
  let cur = 0
  for (const { pos, chord } of inline) {
    out += text.slice(cur, pos) + `[${chord}]`
    cur = pos
  }
  out += text.slice(cur)
  for (const chord of appended) out += ` [${chord}]`
  if (labels.length) out = `${labels.join(' ')} ${out}`
  return { text: out, flagged }
}

/** A chord line without lyrics below (intro, interlude). */
function instrumentalLine(line: Line, lowConfidence: number): { text: string; flagged: OcrWord[] } {
  const parts: string[] = []
  const flagged: OcrWord[] = []
  for (const word of line.words) {
    const kind = chordTokenKind(word.text)
    if (kind === 'skip') continue
    if (kind === 'unknown' || word.confidence < lowConfidence) flagged.push(word)
    parts.push(kind === 'label' ? word.text : `[${word.text}]`)
  }
  return { text: parts.join(' '), flagged }
}

/**
 * Reconstruct song text from positioned words: groups lines, merges chord lines into the lyric
 * line below as inline `[G]` chords and separates stanzas by blank lines (large vertical gaps).
 */
export function wordsToText(words: OcrWord[], opts: WordsToTextOptions = {}): WordsToTextResult {
  const lowConfidence = opts.lowConfidence ?? 65
  const clean = cleanWords(words)
  if (clean.length === 0) return { text: '', uncertain: [] }

  const lines = groupLines(clean)
  const lyricHeights = lines.filter((l) => !l.isChord).map((l) => l.bottom - l.top)
  const lineHeight = median(lyricHeights.length ? lyricHeights : lines.map((l) => l.bottom - l.top))

  const units: Unit[] = []
  const flagged: Flagged[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const next = lines[i + 1]
    let text: string
    let top = line.top
    let bottom = line.bottom
    let lineFlags: OcrWord[]
    if (
      line.isChord &&
      next &&
      !next.isChord &&
      next.top - line.bottom <= CHORD_TO_LYRIC_MAX_GAP * lineHeight
    ) {
      const merged = mergeChords(line, next, lowConfidence)
      const lyricFlags = next.words.filter((w) => w.confidence < lowConfidence)
      text = merged.text
      lineFlags = [...merged.flagged, ...lyricFlags]
      bottom = next.bottom
      top = Math.min(top, next.top)
      i++
    } else if (line.isChord) {
      const inst = instrumentalLine(line, lowConfidence)
      text = inst.text
      lineFlags = inst.flagged
    } else {
      text = line.words.map((w) => w.text).join(' ')
      lineFlags = line.words.filter((w) => w.confidence < lowConfidence)
    }
    lineFlags.sort((a, b) => a.bbox.x0 - b.bbox.x0)
    for (const word of lineFlags) flagged.push({ word, unit: units.length })
    units.push({ text, top, bottom })
  }

  const gaps = units.slice(1).map((u, i) => u.top - units[i]!.bottom)
  const typicalGap = median(gaps)
  const out: string[] = []
  const lineOfUnit: number[] = []
  units.forEach((u, i) => {
    if (i > 0) {
      const gap = gaps[i - 1]!
      if (gap > STANZA_GAP_ABS * lineHeight || gap - typicalGap > STANZA_GAP_REL * lineHeight) out.push('')
    }
    lineOfUnit.push(out.length)
    out.push(u.text)
  })

  return {
    text: out.join('\n'),
    uncertain: flagged.map(({ word, unit }) => ({
      text: word.text,
      confidence: word.confidence,
      sourceLine: lineOfUnit[unit]!
    }))
  }
}
