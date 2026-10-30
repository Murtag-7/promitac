import { GlobalWorkerOptions, getDocument, type PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { OcrWord } from '@core/import/ocrTypes'
import { isScannedPdfText, pdfItemsToWords, type PdfTextItem } from '@core/import/pdfWords'
import { recognizeImage } from './ocr'

/**
 * PDF import in the renderer: pages with a text layer are read with positions (chords are then
 * aligned by x like OCR words); pages without one (scans) are rendered and OCRed.
 */

GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfPage {
  /** 1-based page number. */
  page: number
  /** Positioned words: PDF points for text pages, preprocessed-image pixels for scanned pages. */
  words: OcrWord[]
  /** True when the page had no usable text layer and was OCRed. */
  scanned: boolean
}

/** Scanned pages are rendered at this scale (≈ 144 dpi for A4) before OCR. */
const SCAN_RENDER_SCALE = 2

async function renderToBlob(page: PDFPageProxy): Promise<Blob> {
  const viewport = page.getViewport({ scale: SCAN_RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Rendering the PDF page failed'))),
      'image/png'
    )
  )
}

/** Read every page of a PDF; `onProgress` gets 0–1 over the whole document. */
export async function extractPdf(file: Blob, onProgress?: (p: number) => void): Promise<PdfPage[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({
    data,
    // Decoders for JPX/JBIG2 scans and the standard fonts, served next to the page when present.
    wasmUrl: new URL('pdfjs/wasm/', document.baseURI).href,
    standardFontDataUrl: new URL('pdfjs/standard_fonts/', document.baseURI).href
  })
  try {
    const doc = await task.promise
    const pages: PdfPage[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const { height } = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = content.items.filter((i): i is PdfTextItem & typeof i => 'str' in i)
      if (!isScannedPdfText(items)) {
        pages.push({ page: n, words: pdfItemsToWords(items, height, content.styles), scanned: false })
      } else {
        const image = await renderToBlob(page)
        const ocr = await recognizeImage(image, (p) => onProgress?.((n - 1 + p) / doc.numPages))
        pages.push({ page: n, words: ocr.words, scanned: true })
      }
      page.cleanup()
      onProgress?.(n / doc.numPages)
    }
    return pages
  } finally {
    await task.destroy()
  }
}
