import { isChord } from '../chordpro/chords'
import { expandTabs } from '../util/text'

/** Tokens that may appear on chord lines but carry no chord (bar lines, repeat marks, beats). */
const IGNORABLE = /^(?:\|+|\|:|:\||\/+|[-–—]+|\.+|%|\*|x\d+|\d+x|\(\d+x\)|×\d+|\d+×|\(\d+×\))$/i

export interface ChordToken {
  chord: string
  col: number
}

/** Chord tokens of a line together with their column (tabs expanded). Non-chords are skipped. */
export function chordTokens(line: string): ChordToken[] {
  const expanded = expandTabs(line)
  const out: ChordToken[] = []
  for (const m of expanded.matchAll(/[^\s|]+/g)) {
    const token = m[0]
    if (IGNORABLE.test(token)) continue
    if (isChord(token)) out.push({ chord: token, col: m.index ?? 0 })
  }
  return out
}

/** A line is a chord line when more than half of its meaningful tokens are chords. */
export function isChordLine(line: string): boolean {
  const tokens = expandTabs(line)
    .split(/[\s|]+/)
    .filter((t) => t && !IGNORABLE.test(t))
  if (tokens.length === 0) return false
  const chords = tokens.filter((t) => isChord(t)).length
  return chords > 0 && chords / tokens.length > 0.5
}

/**
 * Insert the chords of `chordLine` into `lyricLine` as inline `[X]` markers at the same character
 * column. The lyrics are never modified: stripping the markers gives back the original line
 * (plus trailing padding when a chord stands past the end of the text).
 */
export function mergeChordLine(chordLine: string, lyricLine: string): string {
  const lyrics = expandTabs(lyricLine)
  let out = ''
  let pos = 0
  for (const { chord, col } of chordTokens(chordLine)) {
    if (col > lyrics.length) {
      out += lyrics.slice(pos) + ' '.repeat(col - Math.max(pos, lyrics.length))
      pos = Math.max(pos, lyrics.length)
      // Keep chords that are past the text separated by at least one space.
      if (out.endsWith(']')) out += ' '
    } else {
      out += lyrics.slice(pos, col)
      pos = col
    }
    out += `[${chord}]`
  }
  return out + lyrics.slice(pos)
}

/** An instrumental line of chords without lyrics, e.g. an intro. */
export function chordOnlyLine(chordLine: string): string {
  return chordTokens(chordLine)
    .map((t) => `[${t.chord}]`)
    .join(' ')
}
