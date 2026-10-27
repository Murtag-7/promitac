import type { Song, SongLine } from './model'

/** Lyrics of a line without chords; '' for comment lines. */
export function lineText(line: SongLine): string {
  if (line.kind !== 'lyrics') return ''
  return line.segments.map((s) => s.text).join('')
}

/** A lyrics line without chords and without visible text (a forced slide break). */
export function isBlankLyricLine(line: SongLine): boolean {
  return line.kind === 'lyrics' && line.segments.every((s) => s.chord === null && s.text.trim() === '')
}

/** A lyrics line that carries chords but no visible text (e.g. an intro riff `[G] [D]`). */
export function isChordOnlyLine(line: SongLine): boolean {
  return (
    line.kind === 'lyrics' &&
    line.segments.some((s) => s.chord !== null) &&
    line.segments.every((s) => s.text.trim() === '')
  )
}

/** Trimmed texts of all lyric lines that have visible text, in file order. */
function lyricTexts(song: Song): string[] {
  const out: string[] = []
  for (const section of song.sections) {
    for (const line of section.lines) {
      const text = lineText(line).trim()
      if (text) out.push(text)
    }
  }
  return out
}

/** All lyrics of the song (no chords, comments or blank lines) joined with '\n' – for search. */
export function songLyricsText(song: Song): string {
  return lyricTexts(song).join('\n')
}

/** First line with visible text in file order; '' when the song has no lyrics. */
export function firstLyricLine(song: Song): string {
  for (const section of song.sections) {
    for (const line of section.lines) {
      const text = lineText(line).trim()
      if (text) return text
    }
  }
  return ''
}

/** Unique chords of the song in order of first appearance. */
export function allChords(song: Song): string[] {
  const seen = new Set<string>()
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue
      for (const s of line.segments) if (s.chord !== null) seen.add(s.chord)
    }
  }
  return [...seen]
}
