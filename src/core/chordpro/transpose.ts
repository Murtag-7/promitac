import { normalizeAccidental, parseChord } from './chords'
import type { Song, SongLine } from './model'
import { allChords } from './text'

export type ChordNotation = 'german' | 'english'

export interface TransposeOptions {
  /** German/Czech: `H` = B natural, `B` = B flat. English: `B` = B natural, `Bb` = B flat. */
  notation: ChordNotation
  preferFlats: boolean
}

type Spelling = readonly string[]

const SHARPS: Spelling = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS: Spelling = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
/** Used when the song has no (readable) key: the most common spelling of each pitch. */
const MIXED: Spelling = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const NATURAL_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 }
/** Major keys written with flats: F, Bb, Eb, Ab, Db, Gb. */
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1, 6])
/** Minor keys written with flats: Dm, Gm, Cm, Fm, Bbm, Ebm. */
const FLAT_MINOR_KEYS = new Set([2, 7, 0, 5, 10, 3])

const mod12 = (n: number): number => ((n % 12) + 12) % 12

function pitchOf(root: string, accidental: string, notation: ChordNotation): number | null {
  const natural = NATURAL_PITCH[root]
  if (natural === undefined) return null
  const acc = normalizeAccidental(accidental)
  // German "B" is already B flat; "Bb"/"Bes" written by German users mean the same.
  if (root === 'B' && notation === 'german' && acc !== '#') return 10
  return mod12(natural + (acc === '#' ? 1 : acc === 'b' ? -1 : 0))
}

function spell(pitch: number, spelling: Spelling, notation: ChordNotation): string {
  if (notation === 'german') {
    if (pitch === 10) return 'B'
    if (pitch === 11) return 'H'
  }
  return spelling[pitch] ?? ''
}

function transposeWith(
  chord: string,
  semitones: number,
  notation: ChordNotation,
  spelling: Spelling
): string {
  const shift = mod12(Math.round(semitones))
  if (!Number.isFinite(shift) || shift === 0) return chord
  const parsed = parseChord(chord)
  if (!parsed) return chord
  const root = pitchOf(parsed.root, parsed.accidental, notation)
  if (root === null) return chord
  let out = spell(mod12(root + shift), spelling, notation) + parsed.suffix
  if (parsed.bass) {
    const bass = pitchOf(parsed.bass.root, parsed.bass.accidental, notation)
    if (bass === null) return chord
    out += `/${spell(mod12(bass + shift), spelling, notation)}`
  }
  return parsed.optional ? `(${out})` : out
}

/**
 * Transpose one chord, keeping its suffix, bass note and optional parentheses.
 * Input may use German spellings (Fis, Es, As, Des…); output always uses `#`/`b`.
 * Tokens that are not chords (e.g. `N.C.`) and whole-octave shifts return the input unchanged.
 */
export function transposeChord(chord: string, semitones: number, opts: TransposeOptions): string {
  return transposeWith(chord, semitones, opts.notation, opts.preferFlats ? FLATS : SHARPS)
}

/** German when any chord (or the key) uses `H` or a German accidental (Fis, Es…); else English. */
export function detectNotation(song: Song): ChordNotation {
  const tokens = song.meta.key ? [song.meta.key, ...allChords(song)] : allChords(song)
  for (const token of tokens) {
    const c = parseChord(token)
    if (!c) continue
    const notes = c.bass ? [c, c.bass] : [c]
    for (const n of notes) {
      if (n.root === 'H' || n.accidental === 'is' || n.accidental === 'es' || n.accidental === 's')
        return 'german'
    }
  }
  return 'english'
}

/** Spelling suggested by the key the song ends up in; mixed spelling without a readable key. */
function spellingForKey(key: string | undefined, semitones: number, notation: ChordNotation): Spelling {
  const parsed = key ? parseChord(key) : null
  const pitch = parsed ? pitchOf(parsed.root, parsed.accidental, notation) : null
  if (!parsed || pitch === null) return MIXED
  const target = mod12(pitch + Math.round(semitones))
  const minor = /^m(?!a)/.test(parsed.suffix)
  const flats = minor ? FLAT_MINOR_KEYS.has(target) : FLAT_MAJOR_KEYS.has(target)
  return flats ? FLATS : SHARPS
}

/**
 * New song with every chord and `meta.key` moved by `semitones`. The input is not modified.
 * The notation is detected from the song unless given; sharps/flats follow the resulting key.
 */
export function transposeSong(
  song: Song,
  semitones: number,
  notation: ChordNotation = detectNotation(song)
): Song {
  const spelling = spellingForKey(song.meta.key, semitones, notation)
  const move = (chord: string): string => transposeWith(chord, semitones, notation, spelling)
  const moveLine = (line: SongLine): SongLine =>
    line.kind === 'lyrics'
      ? {
          ...line,
          segments: line.segments.map((s) => ({
            chord: s.chord === null ? null : move(s.chord),
            text: s.text
          }))
        }
      : { ...line }
  return {
    ...song,
    meta: {
      ...song.meta,
      ...(song.meta.key ? { key: move(song.meta.key) } : {}),
      tags: [...song.meta.tags],
      extra: song.meta.extra.map(([name, value]) => [name, value])
    },
    sections: song.sections.map((section) => ({ ...section, lines: section.lines.map(moveLine) })),
    arrangement: [...song.arrangement]
  }
}
