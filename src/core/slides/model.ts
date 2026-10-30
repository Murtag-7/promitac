import type { SectionType } from '../chordpro/model'

export type SlideKind = 'song' | 'bible' | 'text' | 'media' | 'blank'

/** One projectable screen. `lines` never contain chords. */
export interface Slide {
  /** Stable within its plan item (e.g. "C#1.0"). */
  id: string
  kind: SlideKind
  lines: string[]
  sectionId?: string
  sectionType?: SectionType
  /** Bible reference / song copyright shown small on the slide. */
  footer?: string
  /** Heading for text/announcement slides. */
  title?: string
  mediaId?: string
  /**
   * Bible slides: the same text as `lines`, split into verses so the verse number can be typeset
   * small and kept with its first word. `number` is absent on the continuation of a split verse.
   */
  verses?: SlideVerse[]
}

export interface SlideVerse {
  number?: string
  text: string
}
