import { DOMParser, type Element, type Node } from '@xmldom/xmldom'
import { emptySong, type SectionType, type Segment, type Song, type SongLine } from '../chordpro/model'
import { nextSectionId, SECTION_PREFIX } from '../chordpro/sections'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4

/** OpenLyrics verse name prefix → section type (`v1`, `c`, `p`, `b`, `i`, `e`, `o`). */
const TYPE_BY_LETTER: Record<string, SectionType> = {
  v: 'verse',
  c: 'chorus',
  p: 'prechorus',
  b: 'bridge',
  i: 'intro',
  e: 'ending',
  o: 'outro'
}

/** OpenLyrics 0.9 chord structures → conventional chord suffixes; unknown ones are used as written. */
const STRUCTURE_SUFFIX: Record<string, string> = {
  '': '',
  maj: '',
  major: '',
  M: '',
  m: 'm',
  min: 'm',
  minor: 'm',
  dom7: '7',
  dom9: '9',
  dom11: '11',
  dom13: '13',
  min7: 'm7',
  minmaj7: 'mmaj7',
  min6: 'm6',
  min9: 'm9',
  hdim7: 'm7b5'
}

function fail(reason: string): never {
  throw new Error(`Not an OpenLyrics document: ${reason}`)
}

const isElement = (node: Node): node is Element => node.nodeType === ELEMENT_NODE
const nameOf = (node: Node): string => (node.localName ?? node.nodeName).replace(/^.*:/, '')

function childNodes(node: Node): Node[] {
  const out: Node[] = []
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes.item(i)
    if (child) out.push(child)
  }
  return out
}

function children(node: Node, name: string): Element[] {
  return childNodes(node).filter((c): c is Element => isElement(c) && nameOf(c) === name)
}

const child = (node: Node, name: string): Element | undefined => children(node, name)[0]
const text = (node: Node | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** `<chord name="Am"/>` (0.8) or `<chord root="A" structure="m" bass="E"/>` (0.9) → `Am` / `Am/E`. */
function chordName(el: Element): string {
  const root = el.getAttribute('root')?.trim()
  if (!root) return el.getAttribute('name')?.trim() ?? ''
  const structure = el.getAttribute('structure')?.trim() ?? ''
  const suffix = Object.hasOwn(STRUCTURE_SUFFIX, structure) ? (STRUCTURE_SUFFIX[structure] ?? '') : structure
  const bass = el.getAttribute('bass')?.trim()
  return `${root}${suffix}${bass ? `/${bass}` : ''}`
}

/** Builds the lines of one `<lines>` element from its mixed content. */
class LineBuilder {
  readonly lines: Segment[][] = [[]]

  private get line(): Segment[] {
    return this.lines[this.lines.length - 1] ?? []
  }

  text(value: string): void {
    // Whitespace that spans a line break of the XML file is formatting, not text.
    const t = value.replace(/\s*\n\s*/g, ' ')
    if (!t) return
    const last = this.line[this.line.length - 1]
    if (last) last.text += t
    else this.line.push({ chord: null, text: t })
  }

  chord(name: string): void {
    if (name) this.line.push({ chord: name, text: '' })
  }

  newLine(): void {
    this.lines.push([])
  }

  walk(node: Node): void {
    for (const c of childNodes(node)) {
      if (c.nodeType === TEXT_NODE || c.nodeType === CDATA_SECTION_NODE) {
        this.text(c.nodeValue ?? '')
        continue
      }
      if (!isElement(c)) continue
      switch (nameOf(c)) {
        case 'br':
          this.newLine()
          break
        case 'comment':
          break
        case 'chord':
          this.chord(chordName(c))
          this.walk(c)
          break
        case 'line':
          // OpenLyrics 0.7: one element per line.
          if (this.line.length > 0) this.newLine()
          this.walk(c)
          this.newLine()
          break
        default:
          // Formatting tags (`<tag name="it">`) and unknown elements: keep their text.
          this.walk(c)
      }
    }
  }
}

/** Trim a line's outer whitespace; chords stay attached to their text. */
function trimLine(segments: Segment[]): Segment[] {
  const out = segments.map((s) => ({ ...s }))
  while (out[0] && out[0].chord === null && !out[0].text.trim()) out.shift()
  const first = out[0]
  if (first) first.text = first.text.trimStart()
  while (out.length > 0) {
    const last = out[out.length - 1]
    if (!last) break
    last.text = last.text.trimEnd()
    if (last.chord === null && !last.text) out.pop()
    else break
  }
  return out
}

function verseLines(verse: Element): SongLine[] {
  const out: SongLine[] = []
  for (const linesEl of children(verse, 'lines')) {
    const builder = new LineBuilder()
    builder.walk(linesEl)
    const lines = builder.lines.map(trimLine)
    while (lines.length > 0 && lines[0]?.length === 0) lines.shift()
    while (lines.length > 0 && lines[lines.length - 1]?.length === 0) lines.pop()
    if (lines.length === 0) continue
    // Several <lines> in one verse = forced slide break.
    if (out.length > 0) out.push({ kind: 'lyrics', segments: [] })
    for (const segments of lines) out.push({ kind: 'lyrics', segments })
  }
  return out
}

function parseXml(xml: string): Element {
  let root: Element | null = null
  try {
    const doc = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') throw new Error(message)
      }
    }).parseFromString(xml, 'text/xml')
    root = doc.documentElement
  } catch (e) {
    fail(`invalid XML (${e instanceof Error ? e.message : String(e)})`)
  }
  if (!root) fail('empty document')
  return root
}

/**
 * Parse an OpenLyrics 0.8/0.9 song (OpenLP, Presenter and others): titles, authors, copyright,
 * CCLI, key, themes → tags, verses with `<br/>` line breaks and chords (`<chord name>` or
 * `<chord root structure bass>`), several `<lines>` → slide break, `verseOrder` → arrangement.
 * Throws an Error when the XML is malformed or not an OpenLyrics song.
 */
export function parseOpenLyrics(xml: string): Song {
  const root = parseXml(xml)
  if (nameOf(root) !== 'song') fail(`root element is <${root.nodeName}>, expected <song>`)
  const properties = child(root, 'properties')
  const lyrics = child(root, 'lyrics')
  if (!properties) fail('missing <properties>')
  if (!lyrics) fail('missing <lyrics>')

  const song = emptySong('', '')
  const titles = child(properties, 'titles')
  song.meta.title = titles ? text(children(titles, 'title')[0]) : ''
  const authors = child(properties, 'authors')
  const artist = authors
    ? children(authors, 'author')
        .map((a) => text(a))
        .filter(Boolean)
        .join(', ')
    : ''
  if (artist) song.meta.artist = artist
  const copyright = text(child(properties, 'copyright'))
  if (copyright) song.meta.copyright = copyright
  const ccli = text(child(properties, 'ccliNo'))
  if (ccli) song.meta.ccli = ccli
  const key = text(child(properties, 'key'))
  if (key) song.meta.key = key
  const themes = child(properties, 'themes')
  if (themes) {
    for (const theme of children(themes, 'theme')) {
      const t = text(theme)
      if (t && !song.meta.tags.includes(t)) song.meta.tags.push(t)
    }
  }

  // Sections: one per verse name (translations of the same verse in other languages are skipped).
  const idByName = new Map<string, string>()
  const used: string[] = []
  const drafts: Array<{ name: string; type: SectionType; number: number | null; lines: SongLine[] }> = []
  for (const verse of children(lyrics, 'verse')) {
    const name = (verse.getAttribute('name') ?? '').trim().toLowerCase()
    if (drafts.some((d) => d.name === name)) continue
    const m = /^([a-z]?)[a-z]*?(\d*)[a-z]*$/.exec(name)
    const type = TYPE_BY_LETTER[m?.[1] ?? ''] ?? 'verse'
    const number = m?.[2] ? Number(m[2]) : null
    drafts.push({ name, type, number, lines: verseLines(verse) })
  }
  // Numbered names first so that `v2` keeps V2 even when an unnumbered verse comes before it.
  const ids = new Map<(typeof drafts)[number], string>()
  for (const d of drafts) {
    if (d.number === null || d.number < 1) continue
    const prefix = SECTION_PREFIX[d.type]
    const id = d.type === 'verse' || d.number > 1 ? `${prefix}${d.number}` : prefix
    if (used.includes(id)) continue
    used.push(id)
    ids.set(d, id)
  }
  for (const d of drafts) {
    if (ids.has(d)) continue
    const id = nextSectionId(d.type, used)
    used.push(id)
    ids.set(d, id)
  }
  song.sections = drafts.map((d) => {
    const id = ids.get(d) ?? ''
    if (d.name) idByName.set(d.name, id)
    return { id, type: d.type, lines: d.lines }
  })

  const order = text(child(properties, 'verseOrder'))
    .split(/\s+/)
    .map((n) => idByName.get(n.toLowerCase()))
    .filter((id): id is string => id !== undefined)
  const definition = song.sections.map((s) => s.id)
  song.arrangement = order.join(' ') === definition.join(' ') ? [] : order
  return song
}
