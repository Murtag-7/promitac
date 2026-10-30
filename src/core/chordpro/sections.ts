import { SECTION_TYPES, type SectionType } from './model'

/** Conventional short id prefix of each section type (V1, C, P, B, I, M, O, T, E). */
export const SECTION_PREFIX: Record<SectionType, string> = {
  verse: 'V',
  chorus: 'C',
  prechorus: 'P',
  bridge: 'B',
  intro: 'I',
  interlude: 'M',
  outro: 'O',
  tag: 'T',
  ending: 'E'
}

/**
 * First free id for a new section of `type`: verses are numbered from 1 (V1, V2, …),
 * other types start with the bare prefix (C, then C2, C3, …).
 */
export function nextSectionId(type: SectionType, existing: readonly string[]): string {
  const prefix = SECTION_PREFIX[type]
  const taken = new Set(existing)
  if (type !== 'verse' && !taken.has(prefix)) return prefix
  for (let n = type === 'verse' ? 1 : 2; ; n++) {
    const id = `${prefix}${n}`
    if (!taken.has(id)) return id
  }
}

const TYPE_BY_PREFIX = new Map<string, SectionType>(SECTION_TYPES.map((t) => [SECTION_PREFIX[t], t]))

/** Section type implied by an arrangement id ("V3" → verse, "C2" → chorus); null when unknown. */
export function sectionTypeFromId(id: string): SectionType | null {
  const m = /^([A-Z]+)\d*$/.exec(id.trim().toUpperCase())
  if (!m?.[1]) return null
  return TYPE_BY_PREFIX.get(m[1]) ?? null
}

const TYPE_BY_ENVIRONMENT: Record<string, SectionType> = {
  verse: 'verse',
  sov: 'verse',
  chorus: 'chorus',
  soc: 'chorus',
  bridge: 'bridge',
  sob: 'bridge',
  prechorus: 'prechorus',
  pre_chorus: 'prechorus',
  'pre-chorus': 'prechorus',
  intro: 'intro',
  interlude: 'interlude',
  outro: 'outro',
  tag: 'tag',
  ending: 'ending'
}

/**
 * Section type of a ChordPro environment name (`verse` from `{start_of_verse}`, or a short form
 * like `soc`). Returns null for non-lyric environments such as `tab` or `grid`.
 */
export function directiveToSectionType(name: string): SectionType | null {
  const key = name.trim().toLowerCase()
  return Object.hasOwn(TYPE_BY_ENVIRONMENT, key) ? (TYPE_BY_ENVIRONMENT[key] ?? null) : null
}
