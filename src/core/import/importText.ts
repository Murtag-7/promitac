import type { Song } from '../chordpro/model'
import { parseChordPro } from '../chordpro/parse'
import { expandTabs, normalizeInputText } from '../util/text'
import { detectTextFormat, type TextFormat } from './detect'
import { applyTitleFallback, textToSong, type ImportWarning } from './textToSong'

export type { ImportWarning } from './textToSong'

/** A word the user should double-check (low OCR confidence), located by its input line index. */
export interface UncertainWord {
  text: string
  confidence: number
  sourceLine: number
}

/** How the source encoded the song; `openlyrics` comes from the OpenLyrics XML importer. */
export type ImportFormat = TextFormat | 'openlyrics'

export interface ImportResult {
  song: Song
  format: ImportFormat
  warnings: ImportWarning[]
  uncertain: UncertainWord[]
}

export interface ImportTextOptions {
  /** Low-confidence OCR words, passed through to the result for highlighting. */
  uncertain?: UncertainWord[]
}

/**
 * Import a song from text (paste, TXT/DOCX/PDF/OCR output). The text is normalised (BOM, CRLF,
 * exotic spaces, NFC, tabs) first; ChordPro goes through the ChordPro parser, anything else through
 * `textToSong`. `song.id` and `song.updatedAt` are left empty for the caller to assign.
 */
export function importText(text: string, opts: ImportTextOptions = {}): ImportResult {
  const normalized = normalizeInputText(text)
    .split('\n')
    .map((l) => expandTabs(l))
    .join('\n')
  const format = detectTextFormat(normalized)
  let song: Song
  let warnings: ImportWarning[]
  if (format === 'chordpro') {
    song = parseChordPro(normalized)
    warnings = applyTitleFallback(song)
    if (song.sections.length === 0) warnings.push({ code: 'emptySection' })
  } else {
    ;({ song, warnings } = textToSong(normalized))
  }
  song.id = ''
  song.updatedAt = ''
  return { song, format, warnings, uncertain: opts.uncertain ?? [] }
}
