/**
 * Rough relative advance widths of typical proportional text fonts (Times/Helvetica-like, in em).
 * Used to place characters inside a word box when no reliable per-character boxes exist (pdf.js
 * reports only item widths; Tesseract's LSTM symbol boxes are sometimes inconsistent). Much
 * closer to real glyph positions than an even split for words like "milí" or "Wolf".
 */
export function glyphWeight(ch: string): number {
  if (/\s/.test(ch)) return 0.28
  const base = ch.normalize('NFD').charAt(0)
  if ('ijlI.,;:!|\'"`()[]{}'.includes(base)) return 0.28
  if ('frt-'.includes(base)) return 0.36
  if ('mwMW'.includes(base)) return 0.84
  if (base >= 'A' && base <= 'Z') return 0.68
  return 0.53
}

/** Split [x0, x1] across the characters (UTF-16 code units) of `text` by glyph weight. */
export function splitByGlyphWidth(text: string, x0: number, x1: number): Array<[number, number]> {
  const weights = Array.from({ length: text.length }, (_, i) => glyphWeight(text[i]!))
  const total = weights.reduce((a, b) => a + b, 0)
  const k = total > 0 ? (x1 - x0) / total : 0
  const out: Array<[number, number]> = []
  let x = x0
  for (const wgt of weights) {
    out.push([x, x + wgt * k])
    x += wgt * k
  }
  if (out.length > 0) out[out.length - 1]![1] = x1
  return out
}
