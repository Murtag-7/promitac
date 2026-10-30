/**
 * Chord recognition shared by the ChordPro parser, transposition and the import assistant.
 * Supports English and Czech/German notation (H = B natural, B = B flat, Fis/Es/As…).
 */

export interface ParsedChord {
  root: string
  /** '', '#', 'b', or German 'is' / 'es' / 's'. */
  accidental: string
  /** Everything between root and bass, e.g. "mi7", "sus4", "maj7". */
  suffix: string
  bass: { root: string; accidental: string } | null
  /** Written in parentheses, e.g. "(G)". */
  optional: boolean
}

const ROOT = '([A-H])'
const ACC = '(is|es|#|b|s)?'
// One "quality" unit; the suffix is any sequence of them.
const QUALITY_UNIT =
  'maj|ma|min|mi|moll|m|M|dim|aug|sus|add|°|ø|\\+|-|[0-9]{1,2}|[#b][0-9]{1,2}|\\((?:maj|add|sus|[#b])?[0-9]{1,2}\\)'
const SUFFIX = `((?:${QUALITY_UNIT})*)`
const BASS = '(?:/([A-H])(is|es|#|b)?)?'
const CHORD_RE = new RegExp(`^${ROOT}${ACC}${SUFFIX}${BASS}$`)

/** Parse a chord token; returns null when the token is not a chord. */
export function parseChord(token: string): ParsedChord | null {
  let body = token.trim()
  if (!body) return null
  let optional = false
  if (body.startsWith('(') && body.endsWith(')') && body.length > 2) {
    optional = true
    body = body.slice(1, -1)
  }
  const m = CHORD_RE.exec(body)
  if (!m) return null
  const [, root = '', accidental = '', suffix = '', bassRoot, bassAcc = ''] = m
  // "Es"/"As" are German flats, but "Hs"/"Bs"/"Cs" etc. are not real chords.
  if (accidental === 's' && root !== 'E' && root !== 'A') return null
  return {
    root,
    accidental,
    suffix,
    bass: bassRoot ? { root: bassRoot, accidental: bassAcc } : null,
    optional
  }
}

/** True for chord tokens like `G`, `Ami`, `F#m7/C#`, `(G)` and the no-chord marker `N.C.`. */
export function isChord(token: string): boolean {
  if (token === 'N.C.' || token === 'N.C') return true
  return parseChord(token) !== null
}

/** Map German accidental spellings to '#'/'b'. */
export function normalizeAccidental(acc: string): '' | '#' | 'b' {
  if (acc === '#' || acc === 'is') return '#'
  if (acc === 'b' || acc === 'es' || acc === 's') return 'b'
  return ''
}
