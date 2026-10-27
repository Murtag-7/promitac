import type { Song } from '@core/chordpro/model'
import type { ImportSourceKind } from '@core/import/extractor'
import { importText, type ImportResult, type UncertainWord } from '@core/import/importText'
import { wordsToText } from '@core/import/layout'
import { parseOpenLyrics } from '@core/import/openlyrics'
import type { OcrWord } from '@core/import/ocrTypes'
import { cs } from '@/i18n/cs'
import { decodeText } from '@shared/decodeText'

export interface ImportedSong {
  result: ImportResult
  source: ImportSourceKind
  /** Converted by the optional AI instead of offline OCR. */
  viaAi?: boolean
  /** Text the song was converted from (OCR / PDF / DOCX output or the pasted text). */
  sourceText: string
  /** Object URLs of photos / scans so the review can show the original next to the result. */
  images: string[]
  fileNames: string[]
}

export type ProgressFn = (label: string, fraction: number | null) => void

const IMAGE_RE = /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i
const TEXT_RE = /\.(chordpro|cho|crd|chopro|pro|txt|text)$/i

export function classifyFile(file: File): ImportSourceKind | 'unsupported' {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/') || IMAGE_RE.test(name)) return 'image'
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.xml') || name.endsWith('.openlyrics')) return 'openlyrics'
  if (TEXT_RE.test(name) || file.type.startsWith('text/')) return 'text'
  return 'unsupported'
}

export function importFromText(text: string): ImportedSong {
  return { result: importText(text), source: 'text', sourceText: text, images: [], fileNames: [] }
}

/** Join pages of one song; uncertain word line indices are shifted to the joined text. */
function joinPages(pages: Array<{ text: string; uncertain: UncertainWord[] }>): {
  text: string
  uncertain: UncertainWord[]
} {
  const lines: string[] = []
  const uncertain: UncertainWord[] = []
  for (const page of pages) {
    if (lines.length > 0) lines.push('')
    const offset = lines.length
    lines.push(...page.text.split('\n'))
    for (const u of page.uncertain) uncertain.push({ ...u, sourceLine: u.sourceLine + offset })
  }
  return { text: lines.join('\n'), uncertain }
}

async function fromImages(files: File[], progress: ProgressFn): Promise<ImportedSong> {
  const { recognizeImage } = await import('./engines/ocr')
  const pages: Array<{ text: string; uncertain: UncertainWord[] }> = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i] as File
    const res = await recognizeImage(file, (p) =>
      progress(cs.import.ocrProgress(Math.round(((i + p) / files.length) * 100)), (i + p) / files.length)
    )
    pages.push(wordsToText(res.words))
  }
  const joined = joinPages(pages)
  return {
    result: importText(joined.text, { uncertain: joined.uncertain }),
    source: 'image',
    sourceText: joined.text,
    images: files.map((f) => URL.createObjectURL(f)),
    fileNames: files.map((f) => f.name)
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Optional AI transcription of photos (only when the user set a key and ticked the option). */
async function fromImagesWithAi(files: File[], apiKey: string, progress: ProgressFn): Promise<ImportedSong> {
  const { extractWithGemini } = await import('@core/import/aiExtractor')
  progress(cs.import.aiProgress, null)
  const images = await Promise.all(
    files.map(async (f) => ({ mime: f.type || 'image/jpeg', base64: await blobToBase64(f) }))
  )
  const result = await extractWithGemini(images, { apiKey })
  return {
    result,
    source: 'image',
    viaAi: true,
    sourceText: serializeForReview(result),
    images: files.map((f) => URL.createObjectURL(f)),
    fileNames: files.map((f) => f.name)
  }
}

function serializeForReview(result: ImportResult): string {
  return result.song.sections
    .map((s) =>
      s.lines.map((l) => (l.kind === 'lyrics' ? l.segments.map((g) => g.text).join('') : '')).join('\n')
    )
    .join('\n\n')
}

async function fromPdf(file: File, progress: ProgressFn): Promise<ImportedSong> {
  const { extractPdf } = await import('./engines/pdf')
  progress(cs.import.pdfProgress, null)
  const pages = await extractPdf(file, (p) => progress(cs.import.ocrProgress(Math.round(p * 100)), p))
  const joined = joinPages(pages.map((p: { words: OcrWord[] }) => wordsToText(p.words)))
  return {
    result: importText(joined.text, { uncertain: joined.uncertain }),
    source: 'pdf',
    sourceText: joined.text,
    images: [],
    fileNames: [file.name]
  }
}

async function fromDocx(file: File): Promise<ImportedSong> {
  const { extractDocx } = await import('./engines/docx')
  const text = await extractDocx(file)
  return { result: importText(text), source: 'docx', sourceText: text, images: [], fileNames: [file.name] }
}

async function fromOpenLyrics(file: File): Promise<ImportedSong> {
  const xml = await file.text()
  const song: Song = parseOpenLyrics(xml)
  return {
    result: { song, format: 'openlyrics', warnings: [], uncertain: [] },
    source: 'openlyrics',
    sourceText: xml,
    images: [],
    fileNames: [file.name]
  }
}

async function fromTextFile(file: File): Promise<ImportedSong> {
  const text = decodeText(new Uint8Array(await file.arrayBuffer()))
  return {
    ...importFromText(text),
    source: /\.(chordpro|cho|crd|chopro|pro)$/i.test(file.name) ? 'chordpro' : 'text',
    fileNames: [file.name]
  }
}

/**
 * Files dropped together: all photos form one song (pages in name order), every other file is
 * its own song. Unsupported files are reported, never silently dropped.
 */
export async function importFromFiles(
  files: File[],
  progress: ProgressFn,
  opts: { aiApiKey?: string } = {}
): Promise<{ songs: ImportedSong[]; unsupported: string[] }> {
  const images = files
    .filter((f) => classifyFile(f) === 'image')
    .sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }))
  const others = files.filter((f) => classifyFile(f) !== 'image')
  const songs: ImportedSong[] = []
  const unsupported: string[] = []
  if (images.length > 0) {
    songs.push(
      opts.aiApiKey
        ? await fromImagesWithAi(images, opts.aiApiKey, progress)
        : await fromImages(images, progress)
    )
  }
  for (const file of others) {
    const kind = classifyFile(file)
    if (kind === 'pdf') songs.push(await fromPdf(file, progress))
    else if (kind === 'docx') songs.push(await fromDocx(file))
    else if (kind === 'openlyrics') songs.push(await fromOpenLyrics(file))
    else if (kind === 'text' || kind === 'chordpro') songs.push(await fromTextFile(file))
    else unsupported.push(file.name)
  }
  return { songs, unsupported }
}
