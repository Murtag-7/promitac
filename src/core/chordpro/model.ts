/** Section kinds a song can contain. Ids follow the conventional short labels (V1, C, B, …). */
export type SectionType =
  'verse' | 'chorus' | 'prechorus' | 'bridge' | 'intro' | 'interlude' | 'outro' | 'tag' | 'ending'

export const SECTION_TYPES: readonly SectionType[] = [
  'verse',
  'chorus',
  'prechorus',
  'bridge',
  'intro',
  'interlude',
  'outro',
  'tag',
  'ending'
]

/** A piece of lyrics with the chord that starts right before it (ChordPro `[G]text`). */
export interface Segment {
  chord: string | null
  text: string
}

export type SongLine =
  | {
      kind: 'lyrics'
      segments: Segment[]
      /** Index of the line in the imported source text (import assistant only, never serialized). */
      source?: number
    }
  | { kind: 'comment'; text: string }

export interface SongSection {
  /** Arrangement id, e.g. "V1", "C", "B", "P". Unique within a song. */
  id: string
  type: SectionType
  /** Optional human label from `{start_of_verse: label="…"}`. */
  label?: string
  lines: SongLine[]
}

export interface SongMeta {
  title: string
  artist?: string
  key?: string
  ccli?: string
  copyright?: string
  tags: string[]
  /** Unknown directives preserved verbatim for round-tripping, in file order. */
  extra: Array<[name: string, value: string]>
}

export interface Song {
  id: string
  meta: SongMeta
  sections: SongSection[]
  /** Section ids in projection order; empty = sections in file order. */
  arrangement: string[]
  /** Per-song override of the global lines-per-slide setting. */
  linesPerSlide?: number
  themeId?: string
  /** ISO timestamp of the last local edit (used for sync, last-write-wins). */
  updatedAt: string
}

/** A song as stored on disk / transferred over IPC: the ChordPro text plus identity. */
export interface SongFile {
  id: string
  content: string
  updatedAt: string
}

export function emptySong(id: string, updatedAt: string): Song {
  return { id, meta: { title: '', tags: [], extra: [] }, sections: [], arrangement: [], updatedAt }
}
