/**
 * PDF text layer → positioned words → song text, on a PDF printed by Chromium from the same
 * songbook HTML as the OCR fixture (scripts/render-fixtures.mjs). Uses the pdf.js legacy build,
 * which runs in Node without a worker.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { wordsToText } from './layout'
import { isScannedPdfText, pdfItemsToWords, type PdfFontStyles, type PdfTextItem } from './pdfWords'

const ROOT = resolve(import.meta.dirname, '../../..')
const NAME = 'svetlo-nad-udolim'

async function pageItems(
  path: string
): Promise<{ items: PdfTextItem[]; height: number; styles: PdfFontStyles }> {
  const data = new Uint8Array(readFileSync(path))
  const task = getDocument({ data, useSystemFonts: false })
  const doc = await task.promise
  try {
    const page = await doc.getPage(1)
    const { height } = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = content.items.filter((i): i is PdfTextItem & typeof i => 'str' in i)
    return { items, height, styles: content.styles }
  } finally {
    await task.destroy()
  }
}

const collapse = (s: string): string =>
  s
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim()

describe('PDF text layer import', () => {
  it('reconstructs the song with chords on the right syllables', async () => {
    const { items, height, styles } = await pageItems(join(ROOT, `tests/fixtures/pdf/${NAME}.pdf`))
    expect(isScannedPdfText(items)).toBe(false)
    const { text, uncertain } = wordsToText(pdfItemsToWords(items, height, styles))
    const truth = readFileSync(join(ROOT, `tests/fixtures/ocr/${NAME}.truth.txt`), 'utf8')
    expect(collapse(text)).toBe(collapse(truth))
    expect(uncertain).toEqual([])
  })
})
