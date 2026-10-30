import { createWorker, type Worker } from 'tesseract.js'
import type { OcrWord } from '@core/import/ocrTypes'
import type { Rgba } from '@core/ocr/image'
import { OCR_ENGINE_MODE, OCR_LANGUAGES, ocrPage, type TesseractWorkerLike } from '@core/ocr/pipeline'

/**
 * Offline OCR in the renderer (Electron and plain browser). The Tesseract worker, wasm core and
 * traineddata are served from `ocr/` next to the page (copied by scripts/prepare-assets.mjs).
 * One worker is created lazily and reused; calls are serialised because the recipe switches
 * worker parameters between the page pass and the chord pass.
 */

export interface RecognizedImage {
  /** Words in the coordinates of the preprocessed image (`width` × `height`). */
  words: OcrWord[]
  width: number
  height: number
  /** Detected (and corrected) skew of the photo in degrees. */
  skewDeg: number
}

/** Phone photos are huge; beyond this width they are scaled down first (text stays ≥ 20 px). */
const MAX_INPUT_WIDTH = 2600

let workerPromise: Promise<Worker> | null = null
let progressListener: ((p: number) => void) | null = null
let queue: Promise<unknown> = Promise.resolve()

const asset = (path: string): string => new URL(path, document.baseURI).href

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker(OCR_LANGUAGES, OCR_ENGINE_MODE, {
    workerPath: asset('ocr/worker.min.js'),
    corePath: asset('ocr/core'),
    langPath: asset('ocr/lang'),
    gzip: true,
    workerBlobURL: false,
    // The data is local – no point in a second copy in IndexedDB.
    cacheMethod: 'none',
    logger: (m) => {
      if (m.status === 'recognizing text') progressListener?.(m.progress)
    }
  }).catch((err: unknown) => {
    workerPromise = null
    throw err
  })
  return workerPromise
}

async function decode(file: Blob): Promise<Rgba> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const k = Math.min(1, MAX_INPUT_WIDTH / bitmap.width)
    const width = Math.max(1, Math.round(bitmap.width * k))
    const height = Math.max(1, Math.round(bitmap.height * k))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D context is not available')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    return { width, height, data }
  } finally {
    bitmap.close()
  }
}

/** Raw pixels → canvas, which tesseract.js accepts as input. */
function toCanvas(img: Rgba): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  const data = ctx.createImageData(img.width, img.height)
  data.data.set(img.data)
  ctx.putImageData(data, 0, 0)
  return canvas
}

async function run(file: Blob, onProgress?: (p: number) => void): Promise<RecognizedImage> {
  onProgress?.(0)
  const [worker, rgba] = await Promise.all([getWorker(), decode(file)])
  onProgress?.(0.05)
  let calls = 0
  const engine: TesseractWorkerLike = {
    setParameters: (params) => worker.setParameters(params),
    async recognize(image, options, output) {
      // The first call is the page pass (the long one); chord re-reads are tiny.
      progressListener = ++calls === 1 && onProgress ? (p) => onProgress(0.05 + 0.9 * p) : null
      try {
        return await worker.recognize(image as HTMLCanvasElement, options ?? {}, output ?? {})
      } finally {
        progressListener = null
      }
    }
  }
  const page = await ocrPage(engine, rgba, toCanvas)
  onProgress?.(1)
  return { words: page.words, width: page.width, height: page.height, skewDeg: page.skewDeg }
}

/** Recognise a photo or scan of a song page (offline). */
export function recognizeImage(file: Blob, onProgress?: (p: number) => void): Promise<RecognizedImage> {
  const job = queue.then(() => run(file, onProgress))
  queue = job.catch(() => undefined)
  return job
}

/** Free the OCR worker (about 100 MB); it is created again on the next recognizeImage call. */
export async function terminateOcr(): Promise<void> {
  const pending = workerPromise
  workerPromise = null
  if (pending) await (await pending.catch(() => null))?.terminate()
}
