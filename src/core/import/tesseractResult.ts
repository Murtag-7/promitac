import type { BBox, OcrSymbol, OcrWord } from './ocrTypes'

/*
 * Structural subset of a tesseract.js `recognize(…, {}, { blocks: true })` result, so the mapping
 * can live in platform-independent core and be shared by the Node accuracy test and the renderer.
 */

export interface TesseractSymbolLike {
  text: string
  bbox: BBox
}

export interface TesseractWordLike {
  text: string
  confidence: number
  bbox: BBox
  symbols?: TesseractSymbolLike[] | null
}

export interface TesseractLineLike {
  words: TesseractWordLike[]
}

export interface TesseractParagraphLike {
  lines: TesseractLineLike[]
}

export interface TesseractBlockLike {
  paragraphs: TesseractParagraphLike[]
}

export interface BlocksToWordsOptions {
  /**
   * The image given to Tesseract was this many times larger than the target coordinate space
   * (e.g. the upscale factor of preprocessing); boxes are divided by it. Default 1.
   */
  scale?: number
}

/** Flatten Tesseract blocks into positioned words (empty words dropped, text trimmed). */
export function tesseractBlocksToWords(
  blocks: TesseractBlockLike[] | null | undefined,
  opts: BlocksToWordsOptions = {}
): OcrWord[] {
  const k = opts.scale && opts.scale > 0 ? 1 / opts.scale : 1
  const out: OcrWord[] = []
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text.trim()
          if (!text) continue
          const { x0, y0, x1, y1 } = word.bbox
          const result: OcrWord = {
            text,
            confidence: word.confidence,
            bbox: { x0: x0 * k, y0: y0 * k, x1: x1 * k, y1: y1 * k }
          }
          if (word.symbols && word.symbols.length > 0) {
            result.symbols = word.symbols.map((s): OcrSymbol => ({
              text: s.text,
              x0: s.bbox.x0 * k,
              x1: s.bbox.x1 * k
            }))
          }
          out.push(result)
        }
      }
    }
  }
  return out
}
