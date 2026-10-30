import type { Song } from '../chordpro/model'
import { firstLyricLine } from '../chordpro/text'
import { fold } from '../search/normalize'

/** Minimum length of a first lyric line to count as a match ("Amen, amen" is too common). */
const MIN_FIRST_LINE = 12

/** Case, diacritics, spacing and trailing punctuation do not matter. */
function normalizeKey(s: string): string {
  return fold(s)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s,.;:!?…]+$/, '')
}

/**
 * Library songs that are probably the same song: the same title or the same first lyric line
 * (at least 12 characters), compared without case/diacritics. The song itself (same id) is skipped.
 */
export function findDuplicates(song: Song, library: Song[]): Song[] {
  const title = normalizeKey(song.meta.title)
  const first = normalizeKey(firstLyricLine(song))
  const firstKey = first.length >= MIN_FIRST_LINE ? first : ''
  return library.filter((other) => {
    if (song.id !== '' && other.id === song.id) return false
    if (title && normalizeKey(other.meta.title) === title) return true
    return firstKey !== '' && normalizeKey(firstLyricLine(other)) === firstKey
  })
}
