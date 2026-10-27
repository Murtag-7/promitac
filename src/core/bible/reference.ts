import { findBook, getBook } from './books'
import type { BookId } from './model'

/**
 * A passage reference. Without `verseStart` it covers whole chapters (`chapter`..`chapterEnd`);
 * with `verseStart` it runs to `verseEnd` in `chapterEnd` (or in `chapter` when absent).
 */
export interface BibleRef {
  book: BookId
  chapter: number
  verseStart?: number
  chapterEnd?: number
  verseEnd?: number
}

export type RefLang = 'cs' | 'en'

// "<book> <chapter>[,:.<verse>][-–—<chapterOrVerse>[,:.<verse>]]"
const REFERENCE =
  /^(?<book>.*?\p{L}[\p{L}.]*)\s*(?<c1>\d{1,3})(?:\s*[,:.]\s*(?<v1>\d{1,3}))?(?:\s*[-‐‑‒–—−]\s*(?<n2>\d{1,3})(?:\s*[,:.]\s*(?<v2>\d{1,3}))?)?$/u

/**
 * Parse a typed reference such as `J 3,16`, `Jan 3:16-18`, `Ž 23`, `1 Kor 13:4–7`, `J 3,16-4,2`
 * or `1. Mojžíšova 1,1`. Returns null for unknown books and impossible numbers.
 */
export function parseReference(input: string): BibleRef | null {
  const text = input.replace(/\s+/gu, ' ').trim().replace(/\.+$/, '').trim()
  const match = REFERENCE.exec(text)
  if (!match?.groups) return null
  const { book: bookPart, c1, v1, n2, v2 } = match.groups
  const book = findBook(bookPart!)
  if (!book) return null

  let chapter = Number(c1)
  let verseStart = v1 === undefined ? undefined : Number(v1)
  let chapterEnd: number | undefined
  let verseEnd: number | undefined
  const second = n2 === undefined ? undefined : Number(n2)

  if (verseStart === undefined && v2 !== undefined) return null // "J 3-4,2" is ambiguous

  if (book.chapters === 1 && verseStart === undefined && (chapter > 1 || second !== undefined)) {
    // One-chapter books are usually cited by verse only: "Ju 3", "Fm 4-6".
    verseStart = chapter
    verseEnd = second
    chapter = 1
  } else if (verseStart === undefined) {
    chapterEnd = second
  } else if (v2 !== undefined) {
    chapterEnd = second
    verseEnd = Number(v2)
  } else {
    verseEnd = second
  }

  if (chapter < 1 || chapter > book.chapters) return null
  if (verseStart !== undefined && verseStart < 1) return null
  if (chapterEnd !== undefined) {
    if (chapterEnd < chapter || chapterEnd > book.chapters) return null
    if (chapterEnd === chapter) chapterEnd = undefined
  }
  if (verseEnd !== undefined) {
    if (verseEnd < 1) return null
    if (chapterEnd === undefined && verseEnd < verseStart!) return null
    if (chapterEnd === undefined && verseEnd === verseStart) verseEnd = undefined
  }

  const ref: BibleRef = { book: book.id, chapter }
  if (verseStart !== undefined) ref.verseStart = verseStart
  if (chapterEnd !== undefined) ref.chapterEnd = chapterEnd
  if (verseEnd !== undefined) ref.verseEnd = verseEnd
  return ref
}

function formatWith(ref: BibleRef, bookName: string, lang: RefLang): string {
  const sep = lang === 'cs' ? ',' : ':'
  const dash = lang === 'cs' ? '–' : '-'
  let out = `${bookName} ${ref.chapter}`
  const crossChapter = ref.chapterEnd !== undefined && ref.chapterEnd !== ref.chapter
  if (ref.verseStart === undefined) {
    if (crossChapter) out += `${dash}${ref.chapterEnd}`
    return out
  }
  out += `${sep}${ref.verseStart}`
  if (crossChapter) {
    out += `${dash}${ref.chapterEnd}`
    if (ref.verseEnd !== undefined) out += `${sep}${ref.verseEnd}`
  } else if (ref.verseEnd !== undefined && ref.verseEnd !== ref.verseStart) {
    out += `${dash}${ref.verseEnd}`
  }
  return out
}

/** Full book name: Czech `Jan 3,16–18`, `Žalmy 23`, `Jan 3,16–4,2`; English `John 3:16-18`. */
export function formatReference(ref: BibleRef, lang: RefLang = 'cs'): string {
  const book = getBook(ref.book)
  const name = book ? (lang === 'cs' ? book.nameCs : book.nameEn) : ref.book
  return formatWith(ref, name, lang)
}

/** Abbreviated book name: Czech `J 3,16–18`, `1K 13,4–7`; English `1 Cor 13:4-7`. */
export function formatReferenceShort(ref: BibleRef, lang: RefLang = 'cs'): string {
  const book = getBook(ref.book)
  const name = book ? (lang === 'cs' ? book.abbrCs : book.abbrEn) : ref.book
  return formatWith(ref, name, lang)
}
