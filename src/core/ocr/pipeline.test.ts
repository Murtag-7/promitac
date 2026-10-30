import type { TesseractBlockLike } from '../import/tesseractResult'
import type { Rgba } from './image'
import { CHORD_CHAR_WHITELIST } from './chordRecheck'
import { OCR_LANGUAGES, OCR_PAGE_PARAMS, ocrPage, type TesseractWorkerLike } from './pipeline'

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })
const blocksOf = (
  words: Array<{ text: string; bbox: ReturnType<typeof box>; confidence?: number }>
): TesseractBlockLike[] => [
  { paragraphs: [{ lines: [{ words: words.map((w) => ({ confidence: 90, ...w })) }] }] }
]

/** White 1000×400 page – the fake OCR engine ignores the pixels anyway. */
function page(): Rgba {
  return { width: 1000, height: 400, data: new Uint8ClampedArray(1000 * 400 * 4).fill(255) }
}

function fakeWorker(pageWords: Parameters<typeof blocksOf>[0], cropText: string) {
  const params: Array<Record<string, string>> = []
  const images: Array<{ width: number; height: number }> = []
  const worker: TesseractWorkerLike = {
    async setParameters(p) {
      params.push({ ...p })
      return {}
    },
    async recognize(image) {
      const img = image as { width: number; height: number }
      images.push({ width: img.width, height: img.height })
      if (images.length === 1) return { data: { blocks: blocksOf(pageWords) } }
      return { data: { blocks: blocksOf([{ text: cropText, bbox: box(2, 2, 20, 20), confidence: 77 }]) } }
    }
  }
  return { worker, params, images }
}

const encode = (img: Rgba) => ({ width: img.width, height: img.height })

describe('ocrPage', () => {
  const words = [
    { text: 'Emi', bbox: box(300, 100, 360, 130) },
    { text: 'Cc', bbox: box(700, 100, 740, 130) },
    { text: 'Text', bbox: box(300, 140, 380, 180) },
    { text: 'první', bbox: box(400, 140, 500, 180) }
  ]

  it('recognises the preprocessed page and re-reads misread chords with the chord alphabet', async () => {
    const { worker, params, images } = fakeWorker(words, 'C')
    const result = await ocrPage(worker, page(), encode)
    expect(result.words.map((w) => w.text)).toEqual(['Emi', 'C', 'Text', 'první'])
    expect(result.words[1]!.confidence).toBe(77)
    // Upscaled to 2000 px wide before OCR; the crop is small.
    expect(images[0]).toEqual({ width: 2000, height: 800 })
    expect(result.width).toBe(2000)
    expect(result.height).toBe(800)
    expect(result.scale).toBe(2)
    expect(images).toHaveLength(2)
    expect(images[1]!.width).toBeLessThan(200)
    expect(params[0]).toEqual(OCR_PAGE_PARAMS)
    expect(params[1]).toMatchObject({
      tessedit_char_whitelist: CHORD_CHAR_WHITELIST,
      tessedit_pageseg_mode: '8'
    })
    expect(params[params.length - 1]).toEqual(OCR_PAGE_PARAMS)
  })

  it('keeps the first reading when the re-read is not a chord', async () => {
    const { worker } = fakeWorker(words, 'aa')
    const result = await ocrPage(worker, page(), encode)
    expect(result.words.map((w) => w.text)).toEqual(['Emi', 'Cc', 'Text', 'první'])
  })

  it('makes a single OCR call when every chord was read correctly', async () => {
    const { worker, images, params } = fakeWorker(
      [words[0]!, { text: 'C', bbox: box(700, 100, 720, 130) }, words[2]!, words[3]!],
      'X'
    )
    await ocrPage(worker, page(), encode)
    expect(images).toHaveLength(1)
    expect(params).toEqual([OCR_PAGE_PARAMS])
  })

  it('restores the page parameters when a re-read fails', async () => {
    const { worker, params } = fakeWorker(words, 'C')
    let calls = 0
    const failing: TesseractWorkerLike = {
      setParameters: worker.setParameters,
      async recognize(image, options, output) {
        if (++calls === 2) throw new Error('boom')
        return worker.recognize(image, options, output)
      }
    }
    await expect(ocrPage(failing, page(), encode)).rejects.toThrow('boom')
    expect(params[params.length - 1]).toEqual(OCR_PAGE_PARAMS)
  })

  it('uses Czech recognition (also reads English lyrics, keeps diacritics)', () => {
    expect(OCR_LANGUAGES).toEqual(['ces'])
    expect(OCR_PAGE_PARAMS.preserve_interword_spaces).toBe('1')
  })
})
