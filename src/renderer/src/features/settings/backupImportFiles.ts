import type { Song } from '@core/chordpro/model'
import { stripDiacritics } from '@core/util/text'
import { decodeText } from '@shared/decodeText'

/** File types offered by "Importovat soubory písní". */
export const SONG_FILE_ACCEPT = '.chordpro,.cho,.crd,.chopro,.txt,.xml'

const TEXT_EXTENSIONS = new Set(['chordpro', 'cho', 'crd', 'chopro', 'txt'])

export type ImportFailureReason = 'unsupported' | 'empty' | 'unreadable'

export interface SongParsers {
  importText(text: string): { song: Song }
  parseOpenLyrics(xml: string): Song
}

export interface SongImportPlan {
  /** Songs to save (without an id yet), with the file they came from. */
  songs: Array<{ fileName: string; song: Song }>
  failed: Array<{ fileName: string; reason: ImportFailureReason }>
  /** Files whose song is already in the library (or twice in the selection). */
  duplicates: string[]
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).trim()
}

export { decodeText }

function hasLyrics(song: Song): boolean {
  return song.sections.some((s) =>
    s.lines.some((l) => l.kind === 'lyrics' && l.segments.some((seg) => seg.text.trim() !== ''))
  )
}

/** Title + lyrics, without case, diacritics, chords and spacing differences. */
export function songFingerprint(song: Song): string {
  const norm = (s: string): string => stripDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim()
  const lyrics = song.sections
    .flatMap((s) => s.lines)
    .map((l) => (l.kind === 'lyrics' ? l.segments.map((seg) => seg.text).join('') : ''))
    .join('\n')
  return `${norm(song.meta.title)}\n${norm(lyrics)}`
}

class ImportFileError extends Error {
  constructor(readonly reason: ImportFailureReason) {
    super(reason)
  }
}

/** One file → one song (id left empty). Throws ImportFileError with the reason. */
export function songFromFile(fileName: string, bytes: Uint8Array, parsers: SongParsers): Song {
  const ext = fileExtension(fileName)
  if (ext !== 'xml' && !TEXT_EXTENSIONS.has(ext)) throw new ImportFileError('unsupported')
  let song: Song
  try {
    const text = decodeText(bytes)
    if (!text.trim()) throw new ImportFileError('empty')
    song = ext === 'xml' ? parsers.parseOpenLyrics(text) : parsers.importText(text).song
  } catch (err) {
    if (err instanceof ImportFileError) throw err
    throw new ImportFileError('unreadable')
  }
  if (!hasLyrics(song)) throw new ImportFileError('empty')
  if (!song.meta.title.trim()) song = { ...song, meta: { ...song.meta, title: baseName(fileName) } }
  return song
}

/** Parse every file and sort the results into new songs, failures and duplicates. */
export function planSongImport(
  files: Array<{ name: string; bytes: Uint8Array }>,
  existing: Song[],
  parsers: SongParsers
): SongImportPlan {
  const seen = new Set(existing.map(songFingerprint))
  const plan: SongImportPlan = { songs: [], failed: [], duplicates: [] }
  for (const file of files) {
    try {
      const song = songFromFile(file.name, file.bytes, parsers)
      const key = songFingerprint(song)
      if (seen.has(key)) {
        plan.duplicates.push(file.name)
        continue
      }
      seen.add(key)
      plan.songs.push({ fileName: file.name, song })
    } catch (err) {
      plan.failed.push({
        fileName: file.name,
        reason: err instanceof ImportFileError ? err.reason : 'unreadable'
      })
    }
  }
  return plan
}
