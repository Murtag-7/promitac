import type { Song, SongLine, SongSection } from './model'

export interface SerializeOptions {
  /** Write `{x_id}` and `{x_updated}` (default true). Other `x_*` directives are always written. */
  includeAppMeta?: boolean
}

/** Block extras (`start_of_tab` etc.) carry multi-line raw content and go to the end of the file. */
const BLOCK_EXTRA_RE = /^start_of_(.+)$/

/** Directive values must stay on one line. */
function oneLine(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ').trim()
}

function directive(name: string, value: string): string {
  const v = oneLine(value)
  return v ? `{${name}: ${v}}` : `{${name}}`
}

function quoteLabel(label: string): string {
  const clean = oneLine(label)
  if (!clean.includes('"')) return `"${clean}"`
  if (!clean.includes("'")) return `'${clean}'`
  return `"${clean.replace(/"/g, '')}"`
}

function lineToChordPro(line: SongLine): string {
  if (line.kind === 'comment') return directive('comment', line.text)
  return line.segments.map((s) => (s.chord === null ? s.text : `[${s.chord}]${s.text}`)).join('')
}

function sectionToChordPro(section: SongSection): string[] {
  const value = section.label ? `${section.id} label=${quoteLabel(section.label)}` : section.id
  return [
    `{start_of_${section.type}: ${value}}`,
    ...section.lines.map(lineToChordPro),
    `{end_of_${section.type}}`
  ]
}

/**
 * Canonical ChordPro text of a song: meta directives, then the sections, then preserved
 * non-lyric blocks. `parseChordPro(serializeChordPro(song))` gives the song back.
 */
export function serializeChordPro(song: Song, opts: SerializeOptions = {}): string {
  const includeAppMeta = opts.includeAppMeta ?? true
  const { meta } = song
  const header: string[] = [`{title: ${oneLine(meta.title)}}`]
  if (meta.artist) header.push(directive('artist', meta.artist))
  if (meta.key) header.push(directive('key', meta.key))
  if (meta.ccli) header.push(directive('ccli', meta.ccli))
  if (meta.copyright) header.push(directive('copyright', meta.copyright))
  if (meta.tags.length > 0) header.push(directive('tags', meta.tags.join(', ')))
  if (song.arrangement.length > 0) header.push(directive('arrangement', song.arrangement.join(' ')))
  if (song.linesPerSlide !== undefined)
    header.push(directive('x_lines_per_slide', String(song.linesPerSlide)))
  if (song.themeId) header.push(directive('x_theme', song.themeId))

  const blocks: string[][] = []
  for (const [name, value] of meta.extra) {
    const block = BLOCK_EXTRA_RE.exec(name)
    if (block) blocks.push([`{${name}}`, value, `{end_of_${block[1]}}`])
    else header.push(directive(name, value))
  }

  if (includeAppMeta) {
    if (song.id) header.push(directive('x_id', song.id))
    if (song.updatedAt) header.push(directive('x_updated', song.updatedAt))
  }

  const parts = [header, ...song.sections.map(sectionToChordPro), ...blocks]
  return `${parts.map((p) => p.join('\n')).join('\n\n')}\n`
}
