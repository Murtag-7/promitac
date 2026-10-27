import { isChord } from '../chordpro/chords'
import type { SectionType } from '../chordpro/model'
import { fold } from '../search/normalize'

/** A section heading such as `R:`, `2.`, `Sloka 3`, `Ref. 2×` or `Intro: G D` at the start of a line. */
export interface SectionMarker {
  type: SectionType
  /** Written number: `2.` → 2, `R2:` → 2, `Sloka 3` → 3. */
  number?: number
  /** Text after the marker on the same line, untouched (`line.slice(prefixLength)`). */
  rest: string
  /** `Ref. 2×`, `R (2x)`, `R: 2x` → 2. */
  repeat?: number
  /** Number of characters removed from the start of the line (leading spaces included). */
  prefixLength: number
}

interface Keyword {
  word: string
  type: SectionType
  /** One/two-letter abbreviations: never a marker on their own (`R`, `B` alone could be text or a chord). */
  short?: boolean
  /** An abbreviation dot may be followed by text (`Ref. Text`), unlike `Most. Text`. */
  abbr?: boolean
  /** Also a valid chord name (`B`, `B2`): only a terminator makes it a marker. */
  chordLike?: boolean
}

const KEYWORD_LIST: Keyword[] = [
  { word: 'r', type: 'chorus', short: true, abbr: true },
  { word: 'ref', type: 'chorus', abbr: true },
  { word: 'refr', type: 'chorus', abbr: true },
  { word: 'refren', type: 'chorus' },
  { word: 'refrain', type: 'chorus' },
  { word: 'chorus', type: 'chorus' },
  { word: 'ch', type: 'chorus', short: true, abbr: true },
  { word: 'sbor', type: 'chorus' },
  { word: 'v', type: 'verse', short: true, abbr: true },
  { word: 'sloka', type: 'verse' },
  { word: 'verse', type: 'verse' },
  { word: 'strofa', type: 'verse' },
  { word: 'predrefren', type: 'prechorus' },
  { word: 'pre-chorus', type: 'prechorus' },
  { word: 'prechorus', type: 'prechorus' },
  { word: 'pre chorus', type: 'prechorus' },
  { word: 'pr', type: 'prechorus', short: true, abbr: true },
  { word: 'b', type: 'bridge', short: true, abbr: true, chordLike: true },
  { word: 'br', type: 'bridge', short: true, abbr: true },
  { word: 'bridge', type: 'bridge' },
  { word: 'most', type: 'bridge' },
  { word: 'intro', type: 'intro' },
  { word: 'predehra', type: 'intro' },
  { word: 'uvod', type: 'intro' },
  { word: 'mezihra', type: 'interlude' },
  { word: 'interlude', type: 'interlude' },
  { word: 'instrumental', type: 'interlude' },
  { word: 'inst', type: 'interlude', abbr: true },
  { word: 'instr', type: 'interlude', abbr: true },
  { word: 'outro', type: 'outro' },
  { word: 'dohra', type: 'outro' },
  { word: 'tag', type: 'tag' },
  { word: 'coda', type: 'ending' },
  { word: 'ending', type: 'ending' },
  { word: 'konec', type: 'ending' },
  { word: 'zaver', type: 'ending' }
]

/** Longest keywords first, so that `Refrén` is not read as `R` + text. */
const KEYWORDS = [...KEYWORD_LIST].sort((a, b) => b.word.length - a.word.length)

/** Highest plain number accepted as a verse marker (`100. výročí` is text, not verse 100). */
const MAX_VERSE_NUMBER = 20

/**
 * Lowercase and strip diacritics character by character, keeping the string length, so that
 * indexes found in the folded string are valid in the original one.
 */
export function foldKeepLength(s: string): string {
  let out = ''
  for (const ch of s) {
    const f = fold(ch)
    out += f.length === ch.length ? f : ch
  }
  return out
}

const isSpace = (ch: string | undefined): boolean => ch === ' ' || ch === '\t'
const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9'
const isLetter = (ch: string | undefined): boolean => ch !== undefined && /\p{L}/u.test(ch)

function skipSpaces(s: string, p: number): number {
  while (isSpace(s[p])) p++
  return p
}

/** Repeat mark at `p` of a folded string: `2x`, `2×`, `x2`, `(2x)`, `[2x]`, `2krát`. */
function matchRepeat(f: string, p: number): { n: number; end: number } | null {
  const m = /^([([]\s*)?(?:(\d{1,2})\s*(?:x|×|krat)(?![\p{L}\d])|(?:x|×)\s*(\d{1,2})(?!\d))(\s*[)\]])?/u.exec(
    f.slice(p)
  )
  if (!m) return null
  const [whole, open, a, b, close] = m
  const n = Number(a ?? b)
  if (!(n >= 1)) return null
  // A closing bracket without an opening one belongs to something else.
  const end = p + whole.length - (!open && close ? close.length : 0)
  return { n, end }
}

/** Number at `p` unless it is the count of a repeat mark (`2x`). */
function matchNumber(f: string, p: number): { n: number; end: number } | null {
  if (!isDigit(f[p])) return null
  let end = p
  while (isDigit(f[end]) && end - p < 3) end++
  if (end - p > 2 || matchRepeat(f, p)) return null
  const n = Number(f.slice(p, end))
  return n >= 1 ? { n, end } : null
}

interface Tail {
  number?: number
  repeat?: number
  prefixLength: number
}

/**
 * Parse what follows a keyword (or a verse number) ending at `p`: optional abbreviation dot,
 * number, terminator, repeat mark and a final colon. Returns null when the line goes on with text
 * that is not separated from the keyword by a terminator.
 */
function scanTail(f: string, p: number, kw: Keyword | null, bracketed: boolean): Tail | null {
  let number: number | undefined
  let repeat: number | undefined
  let terminated = false
  /** Text may follow on the same line (`R: Text`, `Ref. Text`, `2. Text`, but not `Most. Text`). */
  let textAllowed = false
  let separated = false

  if (kw === null) {
    // `1.` / `1)` / `1:` – the terminator is mandatory and must be followed by space or end.
    const t = f[p]
    if (t !== '.' && t !== ')' && t !== ':') return null
    p++
    if (p < f.length && !isSpace(f[p])) return null
    terminated = true
    textAllowed = true
  } else {
    if (f[p] === '.') {
      p++
      terminated = true
      textAllowed = kw.abbr === true
    }
    const q = skipSpaces(f, p)
    if (!terminated && (q === p || !kw.short)) {
      const num = matchNumber(f, q)
      if (num) {
        number = num.n
        p = num.end
      }
    }
    const t = skipSpaces(f, p)
    const term = f[t]
    if (term === ':' || (!terminated && (term === '.' || term === ')'))) {
      p = t + 1
      terminated = true
      textAllowed = term === ':' || kw.abbr === true || number !== undefined
      // `Most.Text` / `R.Text` – a dot glued to text is not a heading.
      if (term !== ':' && p < f.length && !isSpace(f[p])) return null
      if (term === ':') separated = true
    }
  }

  let q = skipSpaces(f, p)
  const rep = matchRepeat(f, q)
  if (rep && (q > p || p === 0 || !isLetter(f[p - 1]))) {
    repeat = rep.n
    p = rep.end
    q = skipSpaces(f, p)
    if (f[q] === ':') {
      p = q + 1
      terminated = true
      textAllowed = true
      separated = true
    }
  }

  q = skipSpaces(f, p)
  if (q >= f.length) {
    if (kw && !bracketed) {
      if (kw.chordLike && !terminated) return null
      if (kw.short && !terminated && number === undefined && repeat === undefined) return null
    }
    return {
      ...(number !== undefined ? { number } : {}),
      ...(repeat !== undefined ? { repeat } : {}),
      prefixLength: q
    }
  }
  if (bracketed || !terminated || !textAllowed) return null
  if (q === p && !separated) return null
  return {
    ...(number !== undefined ? { number } : {}),
    ...(repeat !== undefined ? { repeat } : {}),
    prefixLength: q
  }
}

function parseInner(line: string, bracketed: boolean): SectionMarker | null {
  const f = foldKeepLength(line)
  const start = skipSpaces(f, 0)
  if (start >= f.length) return null

  if (isDigit(f[start])) {
    const num = matchNumber(f, start)
    if (!num || num.n > MAX_VERSE_NUMBER) return null
    const tail = scanTail(f, num.end, null, bracketed)
    if (!tail) return null
    return {
      type: 'verse',
      number: num.n,
      ...(tail.repeat !== undefined ? { repeat: tail.repeat } : {}),
      rest: line.slice(tail.prefixLength),
      prefixLength: tail.prefixLength
    }
  }

  for (const kw of KEYWORDS) {
    if (!f.startsWith(kw.word, start)) continue
    const end = start + kw.word.length
    if (isLetter(f[end])) continue
    const tail = scanTail(f, end, kw, bracketed)
    if (!tail) continue
    return {
      type: kw.type,
      ...(tail.number !== undefined ? { number: tail.number } : {}),
      ...(tail.repeat !== undefined ? { repeat: tail.repeat } : {}),
      rest: line.slice(tail.prefixLength),
      prefixLength: tail.prefixLength
    }
  }
  return null
}

const BRACKETED_RE = /^\s*(?:\[([^[\]()]+)\]|\(([^[\]()]+)\))\s*$/

/**
 * Recognise a section marker at the start of a line (case and diacritics insensitive):
 * `R:`, `Ref. 2×`, `1.`, `Sloka 2`, `Verse 3:`, `Bridge`, `Most:`, `Předrefrén`, `Intro: G D`,
 * `[Chorus]`, `(R)`… Text after a terminator is returned in `rest`. Ordinary lyric lines
 * (`Refrén je krásný`, `Most přes řeku`, `V tom domě`) give null.
 */
export function parseMarker(line: string): SectionMarker | null {
  const bracketed = BRACKETED_RE.exec(line)
  if (bracketed) {
    const inner = (bracketed[1] ?? bracketed[2] ?? '').trim()
    if (isChord(inner)) return null
    const m = parseInner(inner, true)
    if (!m) return null
    return { ...m, rest: '', prefixLength: line.length }
  }
  return parseInner(line, false)
}

const REPEAT_LINE_RE = /^\s*[([]?\s*(?:(\d{1,2})\s*(?:x|×|krát|krat)|(?:x|×)\s*(\d{1,2}))\s*[)\]]?\s*:?\s*$/i

/** A line that only says how many times to repeat: `(2x)`, `2×`, `x2`, `[3x]`, `2krát`. */
export function parseRepeatLine(line: string): number | null {
  const m = REPEAT_LINE_RE.exec(line)
  if (!m) return null
  const n = Number(m[1] ?? m[2])
  return n >= 1 ? n : null
}

const TRAILING_REPEAT_RE =
  /(?:\s+[([]?|[([])\s*(?:(\d{1,2})\s*(?:x|×|krát|krat)|(?:x|×)\s*(\d{1,2}))\s*[)\]]?\s*$/i

/** A repeat mark at the end of a lyric line: `Haleluja (2x)` → `{ text: 'Haleluja', repeat: 2 }`. */
export function splitTrailingRepeat(line: string): { text: string; repeat: number } | null {
  const m = TRAILING_REPEAT_RE.exec(line)
  if (!m) return null
  const text = line.slice(0, m.index).trimEnd()
  const n = Number(m[1] ?? m[2])
  if (!text.trim() || !(n >= 1)) return null
  return { text, repeat: n }
}
