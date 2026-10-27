/** USFM-style book code, e.g. "GEN", "PSA", "JHN". */
export type BookId = string

export interface BibleBook {
  id: BookId
  /** chapters[c - 1][v - 1] = verse text */
  chapters: string[][]
}

export interface BibleData {
  id: string
  name: string
  abbreviation: string
  language: string
  license?: string
  books: BibleBook[]
}

export interface BibleTranslationInfo {
  id: string
  name: string
  abbreviation: string
  language: string
  builtIn: boolean
  license?: string
}
