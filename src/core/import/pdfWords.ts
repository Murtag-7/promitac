import { glyphWeight } from '../ocr/glyphWidths'
import type { OcrSymbol, OcrWord } from './ocrTypes'

/** The part of a pdf.js `TextItem` we use (structural, so core does not depend on pdf.js). */
export interface PdfTextItem {
  str: string
  /** Text matrix [a, b, c, d, e, f]; (e, f) is the baseline start in PDF user space. */
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
  /** Key into pdf.js `textContent.styles`. */
  fontName?: string
}

/** pdf.js `textContent.styles` (font family is 'serif', 'sans-serif' or 'monospace'). */
export type PdfFontStyles = Record<string, { fontFamily?: string } | undefined>

/** Glyph box relative to the baseline, in font-size units (cap/ascender height and descender). */
const ASCENT = 0.75
const DESCENT = 0.2
/** Touching items (inline markup splits a word) are joined when the gap is below this × font size. */
const JOIN_GAP = 0.15
/** Items are on the same baseline when it differs by less than this × font size. */
const SAME_BASELINE = 0.2

interface Fragment {
  text: string
  x0: number
  x1: number
  baseline: number
  size: number
  symbols: OcrSymbol[]
  /** No whitespace before/after it inside its item – may continue a neighbouring item. */
  openStart: boolean
  openEnd: boolean
}

function itemFragments(item: PdfTextItem, pageHeight: number, monospace: boolean): Fragment[] {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = item.transform
  const size = Math.hypot(c, d) || item.height || Math.hypot(a, b)
  if (!(size > 0) || !item.str.trim()) return []
  const str = item.str
  const cum = [0]
  for (let i = 0; i < str.length; i++) cum.push(cum[i]! + (monospace ? 1 : glyphWeight(str[i]!)))
  const total = cum[str.length]!
  const scale =
    item.width > 0 && total > 0 ? item.width / total : monospace ? size * 0.6 : (size * 0.5) / 0.53
  const xAt = (i: number): number => e + cum[i]! * scale
  const out: Fragment[] = []
  for (const m of str.matchAll(/\S+/g)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    const symbols: OcrSymbol[] = []
    for (let i = start; i < end; i++) symbols.push({ text: str[i]!, x0: xAt(i), x1: xAt(i + 1) })
    out.push({
      text: m[0],
      x0: xAt(start),
      x1: xAt(end),
      baseline: pageHeight - f,
      size,
      symbols,
      openStart: start === 0,
      openEnd: end === str.length
    })
  }
  return out
}

/**
 * pdf.js text items → positioned words (y flipped to top-left origin, confidence 100), so PDF
 * text layers go through the same layout reconstruction as OCR results. Pass the pdf.js `styles`
 * so monospace fonts get evenly spaced characters.
 */
export function pdfItemsToWords(
  items: PdfTextItem[],
  pageHeight: number,
  styles: PdfFontStyles = {}
): OcrWord[] {
  const fragments: Fragment[] = []
  for (const item of items) {
    const monospace = item.fontName !== undefined && styles[item.fontName]?.fontFamily === 'monospace'
    for (const frag of itemFragments(item, pageHeight, monospace)) {
      const prev = fragments[fragments.length - 1]
      const tol = Math.max(prev?.size ?? 0, frag.size)
      if (
        prev &&
        prev.openEnd &&
        frag.openStart &&
        Math.abs(prev.baseline - frag.baseline) < SAME_BASELINE * tol &&
        Math.abs(frag.x0 - prev.x1) <= JOIN_GAP * tol
      ) {
        prev.text += frag.text
        prev.x1 = frag.x1
        prev.symbols.push(...frag.symbols)
        prev.openEnd = frag.openEnd
        prev.size = Math.max(prev.size, frag.size)
      } else {
        fragments.push(frag)
      }
    }
  }
  return fragments.map((f) => ({
    text: f.text,
    confidence: 100,
    bbox: { x0: f.x0, y0: f.baseline - ASCENT * f.size, x1: f.x1, y1: f.baseline + DESCENT * f.size },
    symbols: f.symbols
  }))
}

/** A page whose text layer has fewer than 20 non-space characters is treated as a scan (→ OCR). */
export function isScannedPdfText(items: Array<Pick<PdfTextItem, 'str'>>): boolean {
  let count = 0
  for (const item of items) count += item.str.replace(/\s+/g, '').length
  return count < 20
}
