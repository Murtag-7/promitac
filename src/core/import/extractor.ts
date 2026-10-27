import { importText, type ImportResult, type UncertainWord } from './importText'
import { parseOpenLyrics } from './openlyrics'
import { applyTitleFallback, type ImportWarning } from './textToSong'

export type ImportSourceKind = 'text' | 'chordpro' | 'openlyrics' | 'image' | 'pdf' | 'docx'

export interface ExtractInput {
  /** The song as text (for images/PDF/DOCX the text produced by OCR / extraction; XML for OpenLyrics). */
  text: string
  source: ImportSourceKind
  /** Low-confidence OCR words to highlight. */
  uncertain?: UncertainWord[]
}

/** Turns extracted text into a song. `local` is the offline default; `ai` is an optional provider. */
export interface SongExtractor {
  readonly id: 'local' | 'ai'
  extract(input: ExtractInput): Promise<ImportResult>
}

const OPENLYRICS_RE = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<song\b[^>]*openlyrics/i

function fromOpenLyrics(xml: string): ImportResult {
  const song = parseOpenLyrics(xml)
  const warnings: ImportWarning[] = applyTitleFallback(song)
  if (song.sections.length === 0) warnings.push({ code: 'emptySection' })
  return { song, format: 'openlyrics', warnings, uncertain: [] }
}

/** Deterministic offline extractor: OpenLyrics XML via `parseOpenLyrics`, everything else via `importText`. */
export const localExtractor: SongExtractor = {
  id: 'local',
  async extract(input: ExtractInput): Promise<ImportResult> {
    if (input.source === 'openlyrics' || (input.source === 'text' && OPENLYRICS_RE.test(input.text)))
      return fromOpenLyrics(input.text)
    return importText(input.text, input.uncertain ? { uncertain: input.uncertain } : {})
  }
}
