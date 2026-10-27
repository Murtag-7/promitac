import { isChord } from '../chordpro/chords'
import { isChordLine } from './chordLine'

export type TextFormat = 'chordpro' | 'inline-chords' | 'chords-over-text' | 'plain'

/** `{title…}`, `{t:…}`, `{start_of_…}`, `{soc}` / `{sov}` (and `{sob}`) at the start of a line. */
const CHORDPRO_DIRECTIVE_RE = /^\s*\{\s*(?:title\s*[:}\s]|t\s*:|start_of_|so[cvb]\s*[}:])/i
const BRACKET_RE = /\[([^[\]]+)\]/g

function isDirectiveLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('{') && t.endsWith('}')
}

/**
 * Guess how a pasted text encodes chords: ChordPro directives, inline `[C]` chords, chord lines
 * above the lyrics, or no chords at all.
 */
export function detectTextFormat(text: string): TextFormat {
  const lines = text.split(/\r\n?|\n/)
  if (lines.some((l) => CHORDPRO_DIRECTIVE_RE.test(l))) return 'chordpro'

  let inline = 0
  for (const line of lines) {
    if (isDirectiveLine(line)) continue
    for (const m of line.matchAll(BRACKET_RE)) if (isChord((m[1] ?? '').trim())) inline++
  }
  if (inline >= 2) return 'inline-chords'

  for (let i = 0; i + 1 < lines.length; i++) {
    const next = lines[i + 1] ?? ''
    if (isChordLine(lines[i] ?? '') && next.trim() !== '' && !isChordLine(next)) return 'chords-over-text'
  }
  return 'plain'
}
