import type { OcrWord } from '../import/ocrTypes'
import { tesseractBlocksToWords, type TesseractBlockLike } from '../import/tesseractResult'
import { cropRgba, type Rgba } from './image'
import { preprocessForOcr } from './preprocess'
import { CHORD_CHAR_WHITELIST, chordRecheckCandidates, recheckChords } from './chordRecheck'

/**
 * The OCR recipe shared by the renderer (browser worker) and the Node accuracy test, so both run
 * exactly the same steps: preprocess → Tesseract page pass → chord re-read pass.
 */

/**
 * Recognition languages. Czech only: in our measurements adding `eng` made Tesseract drop Czech
 * diacritics (it picks the English reading of words like "námi" → "nami"), while the Czech model
 * read English lyrics as well as the English model did. See docs/DECISIONS.md.
 */
export const OCR_LANGUAGES: string[] = ['ces']

/** OEM 1 = LSTM only (the bundled `*_best_int` models have no legacy data). */
export const OCR_ENGINE_MODE = 1

/** Page pass: PSM 4 (single column of text of variable sizes) suits songbook pages. */
export const OCR_PAGE_PARAMS: Record<string, string> = {
  tessedit_pageseg_mode: '4',
  preserve_interword_spaces: '1',
  tessedit_char_whitelist: ''
}

/** Chord re-read pass: one word per crop, chord alphabet only. */
export const OCR_CHORD_PARAMS: Record<string, string> = {
  tessedit_pageseg_mode: '8',
  preserve_interword_spaces: '1',
  tessedit_char_whitelist: CHORD_CHAR_WHITELIST
}

/** The part of a tesseract.js worker the pipeline needs (structural – no tesseract.js import). */
export interface TesseractWorkerLike {
  setParameters(params: Record<string, string>): Promise<unknown>
  recognize(
    image: unknown,
    options?: object,
    output?: object
  ): Promise<{ data: { blocks?: TesseractBlockLike[] | null } }>
}

/** Turns raw pixels into something the worker accepts (PNG buffer in Node, canvas in the browser). */
export type EncodeImage = (img: Rgba) => unknown

export interface OcrPageOptions {
  /** Passed to preprocessForOcr. */
  targetWidth?: number
}

export interface OcrPageResult {
  /** Words in the coordinates of the preprocessed image (`width` × `height`). */
  words: OcrWord[]
  width: number
  height: number
  skewDeg: number
  scale: number
}

/** Run the full OCR recipe on one page image. The worker must be created with OCR_LANGUAGES. */
export async function ocrPage(
  worker: TesseractWorkerLike,
  rgba: Rgba,
  encode: EncodeImage,
  opts: OcrPageOptions = {}
): Promise<OcrPageResult> {
  const pre = preprocessForOcr(rgba, opts.targetWidth ? { targetWidth: opts.targetWidth } : {})
  const { image } = pre
  await worker.setParameters(OCR_PAGE_PARAMS)
  const page = await worker.recognize(await encode(image), {}, { blocks: true })
  let words = tesseractBlocksToWords(page.data.blocks)

  if (chordRecheckCandidates(words).length > 0) {
    await worker.setParameters(OCR_CHORD_PARAMS)
    try {
      words = await recheckChords(words, image, async (_word, region) => {
        const res = await worker.recognize(await encode(cropRgba(image, region)), {}, { blocks: true })
        const found = tesseractBlocksToWords(res.data.blocks)
        if (found.length === 0) return null
        return {
          text: found.map((w) => w.text).join(''),
          confidence: Math.min(...found.map((w) => w.confidence))
        }
      })
    } finally {
      await worker.setParameters(OCR_PAGE_PARAMS)
    }
  }
  return { words, width: image.width, height: image.height, skewDeg: pre.skewDeg, scale: pre.scale }
}
