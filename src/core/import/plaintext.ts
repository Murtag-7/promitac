import type { SectionType, Song, SongLine, SongSection } from '../chordpro/model'
import { SECTION_PREFIX } from '../chordpro/sections'
import { lineText } from '../chordpro/text'

/** Czech marker words understood by the import assistant (`parseMarker`). */
const MARKER_WORD: Record<Exclude<SectionType, 'verse' | 'chorus'>, string> = {
  prechorus: 'Předrefrén',
  bridge: 'Most',
  intro: 'Předehra',
  interlude: 'Mezihra',
  outro: 'Dohra',
  tag: 'Tag',
  ending: 'Závěr'
}

/** Number written in the id (`V2` → 2, `C3` → 3), when the id follows the type's convention. */
function idNumber(section: SongSection): number | null {
  const m = new RegExp(`^${SECTION_PREFIX[section.type]}(\\d+)$`).exec(section.id)
  return m?.[1] ? Number(m[1]) : null
}

/** `1.` for verses, `R:` / `R2:` for choruses, `Most:` / `Most 2:` … for the rest. */
function sectionMarker(section: SongSection): string {
  const n = idNumber(section)
  if (section.type === 'verse') return n !== null ? `${n}.` : 'Sloka:'
  if (section.type === 'chorus') return n !== null && n > 1 ? `R${n}:` : 'R:'
  const word = MARKER_WORD[section.type]
  return n !== null && n > 1 ? `${word} ${n}:` : `${word}:`
}

const lyricLines = (section: SongSection): SongLine[] =>
  section.lines.filter((l) => l.kind === 'lyrics' && l.segments.length > 0)

/** Chord line placing each chord at the column of the text it stands before (monospace). */
function chordLine(line: SongLine): string {
  if (line.kind !== 'lyrics') return ''
  let out = ''
  let col = 0
  for (const seg of line.segments) {
    if (seg.chord !== null) {
      const at = out.length > 0 ? Math.max(col, out.length + 1) : col
      out = out.padEnd(at) + seg.chord
    }
    col += seg.text.length
  }
  return out
}

function render(song: Song, withChords: boolean): string {
  const parts: string[][] = []
  if (song.meta.title.trim()) parts.push([song.meta.title.trim()])
  for (const section of song.sections) {
    const out: string[] = []
    for (const line of lyricLines(section)) {
      const text = lineText(line).trim()
      const chords = withChords ? chordLine(line) : ''
      if (chords) out.push(chords)
      if (text) out.push(text)
    }
    if (out.length > 0) parts.push([sectionMarker(section), ...out])
  }
  return parts.length > 0 ? `${parts.map((p) => p.join('\n')).join('\n\n')}\n` : ''
}

/**
 * Lyrics as plain text: title, then the sections in definition order, each with a Czech marker
 * (`1.`, `R:`, `Most:`…) on its own line. No chords, comments or slide breaks; sections without
 * text (instrumental parts) are left out. `importText` reads it back.
 */
export function songToPlainText(song: Song): string {
  return render(song, false)
}

/**
 * Chord sheet: like `songToPlainText`, but every line with chords gets a chord line above it with
 * each chord at the column of its syllable (for a monospace font). `importText` reads it back.
 */
export function songToChordSheet(song: Song): string {
  return render(song, true)
}
