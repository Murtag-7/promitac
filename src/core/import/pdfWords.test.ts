import { wordsToText } from './layout'
import { isScannedPdfText, pdfItemsToWords, type PdfTextItem } from './pdfWords'

const PAGE_H = 800

/** Text item at baseline (x, y) in PDF user space (origin bottom-left). */
function item(str: string, x: number, y: number, width: number, size = 12): PdfTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size }
}

describe('pdfItemsToWords', () => {
  it('flips the y axis and sizes the box from the font size', () => {
    const [word] = pdfItemsToWords([item('Haleluja', 100, 700, 50)], PAGE_H)
    expect(word!.text).toBe('Haleluja')
    expect(word!.confidence).toBe(100)
    expect(word!.bbox.x0).toBe(100)
    expect(word!.bbox.x1).toBe(150)
    // Baseline at 800 − 700 = 100 px from the top.
    expect(word!.bbox.y0).toBeLessThan(100)
    expect(word!.bbox.y0).toBeGreaterThan(100 - 12)
    expect(word!.bbox.y1).toBeGreaterThan(100)
    expect(word!.bbox.y1).toBeLessThan(100 + 6)
  })

  it('takes the font size from the transform, falling back to the item height', () => {
    const big = pdfItemsToWords([item('Velký', 0, 700, 50, 24)], PAGE_H)[0]!
    const small = pdfItemsToWords([item('malý', 0, 700, 30, 10)], PAGE_H)[0]!
    expect(big.bbox.y1 - big.bbox.y0).toBeCloseTo(2.4 * (small.bbox.y1 - small.bbox.y0), 5)
    const noScale: PdfTextItem = { str: 'text', transform: [1, 0, 0, 0, 0, 700], width: 20, height: 10 }
    const fromHeight = pdfItemsToWords([noScale], PAGE_H)[0]!
    expect(fromHeight.bbox.y1 - fromHeight.bbox.y0).toBeCloseTo(small.bbox.y1 - small.bbox.y0, 5)
  })

  it('splits items on spaces into words spread across the item width', () => {
    const words = pdfItemsToWords([item('Text první  sloky', 100, 700, 170)], PAGE_H)
    expect(words.map((w) => w.text)).toEqual(['Text', 'první', 'sloky'])
    expect(words[0]!.bbox.x0).toBe(100)
    expect(words[2]!.bbox.x1).toBeCloseTo(270, 5)
    for (let i = 1; i < words.length; i++) expect(words[i]!.bbox.x0).toBeGreaterThan(words[i - 1]!.bbox.x1)
  })

  it('gives every character a symbol box; boxes are contiguous and cover the word', () => {
    const [word] = pdfItemsToWords([item('mili', 0, 700, 40)], PAGE_H)
    const symbols = word!.symbols!
    expect(symbols.map((s) => s.text).join('')).toBe('mili')
    expect(symbols[0]!.x0).toBe(0)
    expect(symbols[symbols.length - 1]!.x1).toBeCloseTo(40, 5)
    for (let i = 1; i < symbols.length; i++) expect(symbols[i]!.x0).toBeCloseTo(symbols[i - 1]!.x1, 5)
    // Proportional fonts: "m" is wider than "i".
    expect(symbols[0]!.x1 - symbols[0]!.x0).toBeGreaterThan(symbols[1]!.x1 - symbols[1]!.x0)
  })

  it('spreads characters evenly for monospace fonts (pdf.js styles)', () => {
    const mono: PdfTextItem = { ...item('mili', 0, 700, 40), fontName: 'f1' }
    const [word] = pdfItemsToWords([mono], PAGE_H, { f1: { fontFamily: 'monospace' } })
    expect(word!.symbols!.map((s) => s.x1 - s.x0)).toEqual([10, 10, 10, 10])
    const [prop] = pdfItemsToWords([mono], PAGE_H, { f1: { fontFamily: 'serif' } })
    expect(prop!.symbols![0]!.x1 - prop!.symbols![0]!.x0).toBeGreaterThan(10)
  })

  it('joins touching items of one word (text split by inline markup)', () => {
    const words = pdfItemsToWords([item('Text pr', 100, 700, 42), item('vní sloky', 142, 700, 54)], PAGE_H)
    expect(words.map((w) => w.text)).toEqual(['Text', 'první', 'sloky'])
    const prvni = words[1]!
    expect(prvni.symbols!.map((s) => s.text).join('')).toBe('první')
    // "v" starts exactly where the second item starts.
    expect(prvni.symbols![2]!.x0).toBe(142)
  })

  it('does not join items separated by a space or a gap, or on another baseline', () => {
    const words = pdfItemsToWords(
      [item('Text ', 0, 700, 30), item('první', 30, 700, 30), item('G', 100, 700, 8), item('D', 140, 700, 8)],
      PAGE_H
    )
    expect(words.map((w) => w.text)).toEqual(['Text', 'první', 'G', 'D'])
    const lines = pdfItemsToWords([item('nahoře', 0, 720, 36), item('dole', 36, 700, 24)], PAGE_H)
    expect(lines.map((w) => w.text)).toEqual(['nahoře', 'dole'])
  })

  it('skips whitespace-only and end-of-line marker items', () => {
    const words = pdfItemsToWords(
      [
        item('Text', 0, 700, 24),
        { str: '', transform: [12, 0, 0, 12, 24, 700], width: 0, height: 12, hasEOL: true },
        item('  ', 24, 700, 6)
      ],
      PAGE_H
    )
    expect(words.map((w) => w.text)).toEqual(['Text'])
  })

  it('feeds wordsToText: a chord item above the lyrics lands on the right syllable', () => {
    const words = pdfItemsToWords(
      [item('G', 142, 714, 8, 11), item('Text pr', 100, 700, 42), item('vní sloky', 142, 700, 54)],
      PAGE_H
    )
    expect(wordsToText(words).text).toBe('Text pr[G]vní sloky')
  })
})

describe('isScannedPdfText', () => {
  it('is true for pages without a text layer', () => {
    expect(isScannedPdfText([])).toBe(true)
    expect(isScannedPdfText([item('   ', 0, 0, 10)])).toBe(true)
  })

  it('is true below 20 non-space characters', () => {
    expect(isScannedPdfText([item('Strana 12 z 14', 0, 0, 10), item('abc de', 0, 0, 10)])).toBe(true)
  })

  it('is false for pages with real text', () => {
    expect(isScannedPdfText([item('Ráno když se probouzí krajina tichá', 0, 0, 100)])).toBe(false)
  })
})
