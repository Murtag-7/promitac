import { isChord } from '../chordpro/chords'
import { chordTokenKind, groupWordLines } from '../import/layout'
import type { BBox, OcrWord } from '../import/ocrTypes'

/**
 * Second OCR pass for chord lines. Isolated chord symbols are hard for an OCR engine: "C" and "c"
 * have the same shape and an isolated bold "C" comes back as "c", "Cc" or "[0". Tokens on chord
 * lines that are not valid chords are re-read one by one with a chord-only alphabet (without the
 * lowercase "c"); a token is replaced only when the re-read is a valid chord.
 */

/** Characters used in chord names (English and Czech/German notation), without lowercase "c". */
export const CHORD_CHAR_WHITELIST = 'ABCDEFGHMNabdegijlmosu0123456789#/()+-.'

/** Longest token still considered part of a chord line ("Fmaj7/A"). */
const MAX_TOKEN = 7
/** Chord lines are sparse: the median gap between tokens is at least this × token height. */
const MIN_CHORD_GAP = 0.8

const capitalize = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
const height = (w: OcrWord): number => w.bbox.y1 - w.bbox.y0

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Tokens of a line that may be (misread) chords, or null when the line is not a chord line. */
function lineCandidates(line: OcrWord[]): OcrWord[] | null {
  const tokens = line.filter((w) => {
    const kind = chordTokenKind(w.text)
    return kind === 'chord' || kind === 'unknown'
  })
  if (tokens.length === 0 || tokens.some((w) => w.text.length > MAX_TOKEN)) return null
  if (!tokens.some((w) => isChord(w.text) || isChord(capitalize(w.text)))) return null
  // Mostly word-like tokens (three lowercase letters in a row, not a chord suffix) → lyrics.
  const wordLike = tokens.filter((w) => !isChord(w.text) && /\p{Ll}{3}/u.test(w.text)).length
  if (wordLike * 2 >= tokens.length) return null
  if (tokens.length > 1) {
    const gaps = tokens.slice(1).map((w, i) => w.bbox.x0 - tokens[i]!.bbox.x1)
    if (median(gaps) < MIN_CHORD_GAP * median(tokens.map(height))) return null
  }
  return tokens.filter((w) => !isChord(w.text))
}

/** Words on chord lines that are not valid chords – OCR misreads such as "c", "Cc" or "[0". */
export function chordRecheckCandidates(words: OcrWord[]): OcrWord[] {
  return groupWordLines(words).flatMap((line) => lineCandidates(line) ?? [])
}

/**
 * Crop region (integer pixels, inside the image) for re-reading `word`: padded by half the word
 * height horizontally and 0.4× vertically, but never more than half-way to a neighbouring word.
 */
export function recheckRegion(
  word: OcrWord,
  width: number,
  height: number,
  neighbours: OcrWord[] = []
): BBox {
  const { x0, y0, x1, y1 } = word.bbox
  const h = y1 - y0
  let left = 0.5 * h
  let right = 0.5 * h
  for (const n of neighbours) {
    if (n === word) continue
    if (n.bbox.x1 <= x0) left = Math.min(left, (x0 - n.bbox.x1) / 2)
    if (n.bbox.x0 >= x1) right = Math.min(right, (n.bbox.x0 - x1) / 2)
  }
  return {
    x0: Math.max(0, Math.floor(x0 - left)),
    y0: Math.max(0, Math.floor(y0 - 0.4 * h)),
    x1: Math.min(width, Math.ceil(x1 + right)),
    y1: Math.min(height, Math.ceil(y1 + 0.4 * h))
  }
}

export type ChordReader = (
  word: OcrWord,
  region: BBox
) => Promise<{ text: string; confidence: number } | null>

/**
 * Re-read the chord candidates with `read` (an OCR call on the cropped region using
 * CHORD_CHAR_WHITELIST and single-word page segmentation). Returns a new word list; replaced
 * words keep their box, take the re-read text and confidence and lose their symbol boxes.
 */
export async function recheckChords(
  words: OcrWord[],
  size: { width: number; height: number },
  read: ChordReader
): Promise<OcrWord[]> {
  const replacements = new Map<OcrWord, OcrWord>()
  for (const line of groupWordLines(words)) {
    for (const word of lineCandidates(line) ?? []) {
      const result = await read(word, recheckRegion(word, size.width, size.height, line))
      const text = result?.text.replace(/\s+/g, '') ?? ''
      if (!result || !isChord(text)) continue
      replacements.set(word, { text, confidence: result.confidence, bbox: { ...word.bbox } })
    }
  }
  if (replacements.size === 0) return words
  // groupWordLines works on trimmed copies – match them back by box and text.
  return words.map((w) => {
    for (const [from, to] of replacements) {
      if (from.text === w.text.trim() && sameBox(from.bbox, w.bbox)) return to
    }
    return w
  })
}

function sameBox(a: BBox, b: BBox): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1
}
