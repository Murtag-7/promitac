import type { Song, SongSection } from '../chordpro/model'
import { isBlankLyricLine, isChordOnlyLine, lineText } from '../chordpro/text'
import type { Slide } from './model'

export const DEFAULT_LINES_PER_SLIDE = 4

/**
 * Split lines into ceil(n / max) chunks whose sizes differ by at most one, larger chunks first
 * (5 lines with max 4 → 3 + 2, never 4 + 1). A max below 1 (or invalid) is treated as 1.
 */
export function splitLinesBalanced(lines: string[], max: number): string[][] {
  const n = lines.length
  if (n === 0) return []
  const perSlide = max >= 1 ? Math.floor(max) : 1
  const count = Math.max(1, Math.ceil(n / perSlide))
  const base = Math.floor(n / count)
  const larger = n % count
  const chunks: string[][] = []
  let start = 0
  for (let i = 0; i < count; i++) {
    const size = base + (i < larger ? 1 : 0)
    chunks.push(lines.slice(start, start + size))
    start += size
  }
  return chunks
}

/** Projectable runs of a section: chords, comments and chord-only lines dropped, blank line = break. */
function sectionRuns(section: SongSection): string[][] {
  const runs: string[][] = []
  let run: string[] = []
  for (const line of section.lines) {
    if (line.kind !== 'lyrics' || isChordOnlyLine(line)) continue
    if (isBlankLyricLine(line)) {
      if (run.length > 0) runs.push(run)
      run = []
      continue
    }
    run.push(lineText(line).trimEnd())
  }
  if (run.length > 0) runs.push(run)
  return runs
}

function copyrightFooter(song: Song): string | undefined {
  const { copyright, ccli } = song.meta
  const parts = [copyright, ccli ? `CCLI ${ccli}` : undefined].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

export interface SongSlidesOptions {
  /** Global lines-per-slide setting; the song's own `linesPerSlide` wins. */
  linesPerSlide: number
  /** Overrides `song.arrangement` (e.g. a plan item with its own order). */
  arrangement?: string[]
}

/**
 * Slides of a song in arrangement order (empty arrangement = section order, unknown ids ignored).
 * A repeated section yields repeated slides with unique ids `<section>#<occurrence>.<chunk>`.
 * Copyright / CCLI is shown on the last slide only.
 */
export function songToSlides(song: Song, opts: SongSlidesOptions): Slide[] {
  const byId = new Map(song.sections.map((s) => [s.id, s]))
  const requested = opts.arrangement ?? song.arrangement
  const order = requested.length > 0 ? requested : song.sections.map((s) => s.id)
  const perSlide = song.linesPerSlide ?? opts.linesPerSlide
  const occurrences = new Map<string, number>()
  const slides: Slide[] = []

  for (const id of order) {
    const section = byId.get(id)
    if (!section) continue
    const occurrence = occurrences.get(id) ?? 0
    occurrences.set(id, occurrence + 1)
    let chunkIndex = 0
    for (const run of sectionRuns(section)) {
      for (const lines of splitLinesBalanced(run, perSlide)) {
        slides.push({
          id: `${section.id}#${occurrence}.${chunkIndex++}`,
          kind: 'song',
          lines,
          sectionId: section.id,
          sectionType: section.type
        })
      }
    }
  }

  const footer = copyrightFooter(song)
  const last = slides[slides.length - 1]
  if (footer && last) last.footer = footer
  return slides
}

/** Slides of an announcement / custom text item: blank line = slide break, long blocks balanced. */
export function textToSlides(title: string, body: string, linesPerSlide: number): Slide[] {
  const runs: string[][] = []
  let run: string[] = []
  for (const raw of body.split(/\r\n?|\n/)) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      if (run.length > 0) runs.push(run)
      run = []
    } else {
      run.push(line)
    }
  }
  if (run.length > 0) runs.push(run)

  const chunks = runs.flatMap((r) => splitLinesBalanced(r, linesPerSlide))
  if (chunks.length === 0) return [{ id: 'text#0', kind: 'text', lines: [], title }]
  return chunks.map((lines, i) => ({ id: `text#${i}`, kind: 'text', lines, title }))
}
