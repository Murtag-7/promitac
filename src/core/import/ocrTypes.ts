/** Shared types of the image/PDF import pipeline (OCR words with positions → text with chords). */

/** Axis-aligned box in image (or page) pixels, origin top-left, y grows downwards. */
export interface BBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** One recognised character with its horizontal extent. */
export interface OcrSymbol {
  text: string
  x0: number
  x1: number
}

/** One recognised word (OCR engine or PDF text layer). */
export interface OcrWord {
  text: string
  /** 0–100; PDF text layer words are always 100. */
  confidence: number
  bbox: BBox
  /** Per-character x ranges when the source provides them. */
  symbols?: OcrSymbol[]
}

/** A word the user should double-check, located by the line index of the produced text. */
export interface UncertainWord {
  text: string
  confidence: number
  /** Line index (0-based) in the produced text. */
  sourceLine: number
}
