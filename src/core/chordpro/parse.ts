import { expandTabs, normalizeInputText } from '../util/text'
import {
  emptySong,
  type SectionType,
  type Segment,
  type Song,
  type SongLine,
  type SongSection
} from './model'
import { directiveToSectionType, nextSectionId } from './sections'

/** `{name: value}`, `{name:value}`, `{name value}` or `{name}`. */
const DIRECTIVE_RE = /^\{\s*([A-Za-z][\w-]*)\s*(?::(.*)|\s(.*))?\}$/s
const SECTION_ID_RE = /^[A-Z]+\d*$/
const LABEL_RE = /(?:^|\s)label\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i

const SHORT_START: Record<string, string> = {
  sov: 'verse',
  soc: 'chorus',
  sob: 'bridge',
  sot: 'tab',
  sog: 'grid'
}
const SHORT_END: Record<string, string> = {
  eov: 'verse',
  eoc: 'chorus',
  eob: 'bridge',
  eot: 'tab',
  eog: 'grid'
}
const COMMENT_DIRECTIVES = new Set(['comment', 'c', 'comment_italic', 'ci', 'comment_box', 'cb', 'highlight'])
const META_FIELDS = {
  title: 'title',
  t: 'title',
  artist: 'artist',
  key: 'key',
  ccli: 'ccli',
  copyright: 'copyright'
} as const

interface Directive {
  name: string
  value: string
}

interface DraftSection {
  type: SectionType
  explicitId?: string
  label?: string
  /** Created from loose text outside of any section directive; a blank line ends it. */
  implicit: boolean
  /** Comments found outside of sections right before this one started. */
  lead: SongLine[]
  lines: SongLine[]
}

interface RawBlock {
  env: string
  lines: string[]
}

function parseDirective(trimmed: string): Directive | null {
  if (!trimmed.startsWith('{')) return null
  const m = DIRECTIVE_RE.exec(trimmed)
  if (!m?.[1]) return null
  return { name: m[1].toLowerCase(), value: (m[2] ?? m[3] ?? '').trim() }
}

/** Environment name of `{start_of_X}` or of a short form like `{soc}`; null otherwise. */
function startEnvironment(name: string): string | null {
  if (name.startsWith('start_of_')) return name.slice('start_of_'.length) || null
  return SHORT_START[name] ?? null
}

function endEnvironment(name: string): string | null {
  if (name.startsWith('end_of_')) return name.slice('end_of_'.length) || null
  return SHORT_END[name] ?? null
}

/** Section type of an environment, also with a ChordPro selector suffix (`verse-guitar`). */
function environmentSectionType(env: string): SectionType | null {
  return directiveToSectionType(env) ?? directiveToSectionType(env.split('-')[0] ?? '')
}

/** Value of a section start: `V1`, `label="Sloka 1"`, `V1 label="Sloka 1"` or a plain label. */
function parseSectionValue(value: string): { id?: string; label?: string } {
  let rest = value.trim()
  let label: string | undefined
  const m = LABEL_RE.exec(rest)
  if (m) {
    label = m[1] ?? m[2] ?? m[3] ?? ''
    rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`.trim()
  }
  let id: string | undefined
  if (SECTION_ID_RE.test(rest)) id = rest
  else if (rest && label === undefined) label = rest
  label = label?.trim()
  return { ...(id ? { id } : {}), ...(label ? { label } : {}) }
}

/** `[G]Text první [D]sloky` → segments. An unclosed `[` and empty `[]` are plain text / ignored. */
function parseLyricLine(line: string): SongLine {
  const segments: Segment[] = []
  let chord: string | null = null
  let text = ''
  let i = 0
  while (i < line.length) {
    const open = line.indexOf('[', i)
    const close = open === -1 ? -1 : line.indexOf(']', open + 1)
    if (open === -1 || close === -1) {
      text += line.slice(i)
      break
    }
    text += line.slice(i, open)
    const token = line.slice(open + 1, close).trim()
    i = close + 1
    if (!token) continue
    if (chord !== null || text) segments.push({ chord, text })
    chord = token
    text = ''
  }
  if (chord !== null || text) segments.push({ chord, text })
  return { kind: 'lyrics', segments }
}

const BLANK = (): SongLine => ({ kind: 'lyrics', segments: [] })

function isBlank(line: SongLine | undefined): boolean {
  return line?.kind === 'lyrics' && line.segments.length === 0
}

/** Collapse runs of blank lines into one and drop leading/trailing blank lines. */
function tidyLines(lines: SongLine[]): SongLine[] {
  const out: SongLine[] = []
  for (const line of lines) {
    if (isBlank(line) && (out.length === 0 || isBlank(out[out.length - 1]))) continue
    out.push(line)
  }
  while (out.length > 0 && isBlank(out[out.length - 1])) out.pop()
  return out
}

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return n > 0 && Number.isSafeInteger(n) ? n : null
}

class ChordProParser {
  readonly song: Song = emptySong('', '')
  private readonly singleExtras: Array<[string, string]> = []
  private readonly blockExtras: Array<[string, string]> = []
  private readonly drafts: DraftSection[] = []
  private readonly seenMeta = new Set<string>()
  private pendingComments: SongLine[] = []
  private current: DraftSection | null = null
  private raw: RawBlock | null = null

  parse(text: string): Song {
    for (const sourceLine of normalizeInputText(text).split('\n')) this.line(expandTabs(sourceLine))
    this.closeRaw()
    this.closeSection()
    this.flushPendingComments()
    this.song.sections = assignIds(this.drafts)
    this.song.meta.extra = [...this.singleExtras, ...this.blockExtras]
    return this.song
  }

  private line(line: string): void {
    const trimmed = line.trim()
    const directive = parseDirective(trimmed)

    if (this.raw) {
      if (directive && endEnvironment(directive.name) === this.raw.env) {
        this.closeRaw()
        return
      }
      if (!directive || !startEnvironment(directive.name)) {
        this.raw.lines.push(line)
        return
      }
      // An unclosed block ends where the next environment starts.
      this.closeRaw()
    }

    if (trimmed.startsWith('#')) return
    if (directive) {
      this.directive(directive)
      return
    }
    if (!trimmed) {
      if (this.current?.implicit) this.closeSection()
      else this.current?.lines.push(BLANK())
      return
    }
    const section = this.current ?? this.openSection({ type: 'verse', implicit: true })
    section.lines.push(parseLyricLine(line.trimEnd()))
  }

  private directive({ name, value }: Directive): void {
    const startEnv = startEnvironment(name)
    if (startEnv) {
      const type = environmentSectionType(startEnv)
      if (type) {
        const { id, label } = parseSectionValue(value)
        this.openSection({
          type,
          implicit: false,
          ...(id ? { explicitId: id } : {}),
          ...(label ? { label } : {})
        })
      } else {
        // Non-lyric environment (tab, grid, abc…): kept verbatim, never projected.
        // Loose text ends here, an explicit section stays open around it.
        if (this.current?.implicit) this.closeSection()
        this.raw = { env: startEnv, lines: [] }
      }
      return
    }
    if (endEnvironment(name)) {
      this.closeSection()
      return
    }
    if (COMMENT_DIRECTIVES.has(name)) {
      const comment: SongLine = { kind: 'comment', text: value }
      if (this.current) this.current.lines.push(comment)
      else this.pendingComments.push(comment)
      return
    }
    this.meta(name, value)
  }

  private meta(name: string, value: string): void {
    const { song } = this
    if (Object.hasOwn(META_FIELDS, name)) {
      const field = META_FIELDS[name as keyof typeof META_FIELDS]
      if (value && this.once(field)) song.meta[field] = value
      return
    }
    switch (name) {
      case 'tags':
        for (const tag of value.split(',')) if (tag.trim()) song.meta.tags.push(tag.trim())
        return
      case 'arrangement':
        if (value && this.once(name)) song.arrangement = value.split(/[\s,]+/).filter(Boolean)
        return
      case 'x_id':
        if (value && this.once(name)) song.id = value
        return
      case 'x_updated':
        if (value && this.once(name)) song.updatedAt = value
        return
      case 'x_theme':
        if (value && this.once(name)) song.themeId = value
        return
      case 'x_lines_per_slide': {
        const n = parsePositiveInt(value)
        if (n === null) this.singleExtras.push([name, value])
        else if (this.once(name)) song.linesPerSlide = n
        return
      }
      default:
        this.singleExtras.push([name, value])
    }
  }

  /** The first occurrence of a scalar meta directive wins; later duplicates are ignored. */
  private once(key: string): boolean {
    if (this.seenMeta.has(key)) return false
    this.seenMeta.add(key)
    return true
  }

  private openSection(draft: Omit<DraftSection, 'lead' | 'lines'>): DraftSection {
    this.closeSection()
    const section: DraftSection = { ...draft, lead: this.pendingComments, lines: [] }
    this.pendingComments = []
    this.drafts.push(section)
    this.current = section
    return section
  }

  private closeSection(): void {
    if (!this.current) return
    this.current.lines = [...this.current.lead, ...tidyLines(this.current.lines)]
    this.current.lead = []
    this.current = null
  }

  private closeRaw(): void {
    if (!this.raw) return
    this.blockExtras.push([`start_of_${this.raw.env}`, this.raw.lines.join('\n')])
    this.raw = null
  }

  /** Comments after the last section belong to it; without any section they are kept in extra. */
  private flushPendingComments(): void {
    const last = this.drafts[this.drafts.length - 1]
    for (const comment of this.pendingComments) {
      if (last) last.lines.push(comment)
      else if (comment.kind === 'comment') this.singleExtras.push(['comment', comment.text])
    }
    this.pendingComments = []
  }
}

/** Explicit ids win (first occurrence); duplicates and missing ids get the first free id. */
function assignIds(drafts: DraftSection[]): SongSection[] {
  const used = new Set<string>()
  const explicit = drafts.map((d) => {
    if (!d.explicitId || used.has(d.explicitId)) return null
    used.add(d.explicitId)
    return d.explicitId
  })
  return drafts.map((d, i) => {
    let id = explicit[i]
    if (!id) {
      id = nextSectionId(d.type, [...used])
      used.add(id)
    }
    return { id, type: d.type, ...(d.label ? { label: d.label } : {}), lines: d.lines }
  })
}

/**
 * Parse ChordPro text into a Song. Never throws: unknown directives and non-lyric environments are
 * kept in `meta.extra`, unclosed sections are closed, loose text becomes verses split by blank lines.
 * Missing `{x_id}` / `{x_updated}` give '' (the caller assigns them).
 */
export function parseChordPro(text: string): Song {
  return new ChordProParser().parse(text)
}
