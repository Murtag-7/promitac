import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom'
import { slugify } from '../../util/slug'
import { BOOKS } from '../books'
import type { BibleBook, BibleData, BookId } from '../model'

export type BibleFormat = 'zefania' | 'osis' | 'usfx'

export type BibleFormatErrorCode = 'invalid-xml' | 'unknown-format' | 'wrong-format' | 'no-verses'

/** Thrown for files that cannot be imported; `code` lets the UI show a localised message. */
export class BibleFormatError extends Error {
  readonly code: BibleFormatErrorCode

  constructor(code: BibleFormatErrorCode, message: string) {
    super(message)
    this.name = 'BibleFormatError'
    this.code = code
  }
}

export interface ParseBibleOptions {
  /** Name used when the file itself does not carry one (e.g. the file name). */
  fallbackName?: string
}

export const ELEMENT_NODE = 1
export const TEXT_NODE = 3
export const CDATA_SECTION_NODE = 4

/** Parse XML leniently (recoverable errors are ignored) but turn fatal errors into BibleFormatError. */
export function parseXmlDocument(xml: string): Document {
  try {
    const doc = new DOMParser({ onError: () => undefined }).parseFromString(
      xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml,
      'text/xml'
    )
    if (!doc.documentElement) throw new Error('missing root element')
    return doc
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error)
    throw new BibleFormatError('invalid-xml', `The file is not valid XML: ${detail}`)
  }
}

/** Element name without namespace prefix, lowercase ("osis:verse" → "verse", "VERS" → "vers"). */
export function tagName(el: Element): string {
  return (el.localName ?? el.nodeName).replace(/^.*:/, '').toLowerCase()
}

export function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE
}

export function isText(node: Node): boolean {
  return node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE
}

export function childElements(parent: Node): Element[] {
  const out: Element[] = []
  for (let n = parent.firstChild; n; n = n.nextSibling) if (isElement(n)) out.push(n)
  return out
}

/** First descendant element with the given (case-insensitive, prefix-less) name. */
export function findElement(root: Node, name: string): Element | null {
  for (let n = root.firstChild; n; n = n.nextSibling) {
    if (!isElement(n)) continue
    if (tagName(n) === name) return n
    const found = findElement(n, name)
    if (found) return found
  }
  return null
}

/** Trimmed text of the first child element with the given name, or ''. */
export function childText(parent: Node | null, name: string): string {
  if (!parent) return ''
  const el = childElements(parent).find((e) => tagName(e) === name)
  return el ? collapseSpaces(el.textContent ?? '') : ''
}

export function collapseSpaces(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}

/** Tidy the whitespace left by markup and indentation in collected verse text. */
export function cleanVerseText(text: string): string {
  return collapseSpaces(text)
}

/** Positive integer at the start of a value ("16", "1-2", "3a"), or null. */
export function leadingNumber(value: string | null | undefined): number | null {
  const match = /^\s*(\d+)/.exec(value ?? '')
  if (!match) return null
  const n = Number(match[1])
  return n > 0 ? n : null
}

const LANGUAGES: Record<string, string> = {
  ces: 'cs',
  cze: 'cs',
  czech: 'cs',
  cesky: 'cs',
  cestina: 'cs',
  eng: 'en',
  english: 'en',
  slk: 'sk',
  slo: 'sk',
  slovak: 'sk',
  slovensky: 'sk',
  slovencina: 'sk',
  deu: 'de',
  ger: 'de',
  german: 'de',
  deutsch: 'de',
  pol: 'pl',
  polish: 'pl',
  fra: 'fr',
  fre: 'fr',
  french: 'fr',
  spa: 'es',
  spanish: 'es',
  ita: 'it',
  rus: 'ru',
  ukr: 'uk',
  hun: 'hu',
  por: 'pt',
  nld: 'nl',
  dut: 'nl',
  lat: 'la',
  latin: 'la',
  heb: 'he',
  ell: 'el',
  gre: 'el'
}

/** Normalise "ENG", "ces", "en-US", "Czech" … to a short language code; 'und' when unknown. */
export function normalizeLanguage(value: string | null | undefined): string {
  const raw = (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .trim()
    .toLowerCase()
  if (!raw) return 'und'
  const base = raw.split(/[-_\s]/)[0]!
  return LANGUAGES[raw] ?? LANGUAGES[base] ?? (/^[a-z]{2,3}$/.test(base) ? base : 'und')
}

/** Abbreviation from initials ("Český ekumenický překlad" → "ČEP", "King James Version" → "KJV"). */
export function deriveAbbreviation(name: string): string {
  const words = name.match(/\p{L}[\p{L}\p{N}]*/gu) ?? []
  const initials = words
    .map((w) => w[0]!)
    .join('')
    .toUpperCase()
    .slice(0, 6)
  if (initials.length >= 2) return initials
  return (words[0] ?? name).slice(0, 3).toUpperCase() || 'BIB'
}

/** A short identifier from the file ("KJV", "CzeBKR") is used as the abbreviation as-is. */
export function pickAbbreviation(identifier: string, name: string): string {
  const id = identifier.trim()
  if (id && id.length <= 10 && !/\s/.test(id)) return id
  return deriveAbbreviation(name)
}

const USFM_IDS = new Set(BOOKS.map((b) => b.id))
const BOOK_ORDER = new Map(BOOKS.map((b) => [b.id, b.order]))

export function isCanonicalBook(id: string): id is BookId {
  return USFM_IDS.has(id)
}

/** Collects verses in any order and produces BibleData with dense, 1-based-indexed arrays. */
export class BibleBuilder {
  private readonly books = new Map<BookId, Map<number, Map<number, string[]>>>()
  private verseCount = 0

  /** Append raw text to a verse (fragments are concatenated as-is). Unknown books are ignored. */
  add(book: BookId, chapter: number, verse: number, text: string): void {
    if (!isCanonicalBook(book) || chapter < 1 || verse < 1) return
    let chapters = this.books.get(book)
    if (!chapters) this.books.set(book, (chapters = new Map()))
    let verses = chapters.get(chapter)
    if (!verses) chapters.set(chapter, (verses = new Map()))
    let parts = verses.get(verse)
    if (!parts) {
      verses.set(verse, (parts = []))
      this.verseCount++
    }
    parts.push(text)
  }

  build(meta: {
    format: BibleFormat
    name: string
    identifier: string
    language: string
    license?: string
  }): BibleData {
    const books: BibleBook[] = []
    let nonEmpty = 0
    for (const [id, chapterMap] of this.books) {
      const chapterCount = Math.max(...chapterMap.keys())
      const chapters: string[][] = []
      for (let c = 1; c <= chapterCount; c++) {
        const verseMap = chapterMap.get(c)
        const verses: string[] = []
        if (verseMap) {
          const verseCount = Math.max(...verseMap.keys())
          for (let v = 1; v <= verseCount; v++) {
            const text = cleanVerseText((verseMap.get(v) ?? []).join(''))
            if (text) nonEmpty++
            verses.push(text)
          }
        }
        chapters.push(verses)
      }
      books.push({ id, chapters })
    }
    if (this.verseCount === 0 || nonEmpty === 0) {
      throw new BibleFormatError('no-verses', `No Bible verses were found in this ${meta.format} file.`)
    }
    books.sort((a, b) => BOOK_ORDER.get(a.id)! - BOOK_ORDER.get(b.id)!)
    const abbreviation = pickAbbreviation(meta.identifier, meta.name)
    const data: BibleData = {
      id: slugify(`${meta.language}-${meta.identifier.trim() || abbreviation}`),
      name: meta.name,
      abbreviation,
      language: meta.language,
      books
    }
    if (meta.license) data.license = meta.license
    return data
  }
}

/** Throw unless the document root has one of the expected names. */
export function expectRoot(doc: Document, format: BibleFormat, names: string[]): Element {
  const root = doc.documentElement!
  if (!names.includes(tagName(root))) {
    throw new BibleFormatError(
      'wrong-format',
      `Expected a ${format} file (<${names[0]}>), found <${root.nodeName}>.`
    )
  }
  return root
}
