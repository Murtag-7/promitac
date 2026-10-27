import type { Element, Node } from '@xmldom/xmldom'
import type { BibleData, BookId } from '../model'
import {
  BibleBuilder,
  childElements,
  childText,
  expectRoot,
  findElement,
  isCanonicalBook,
  isElement,
  isText,
  leadingNumber,
  normalizeLanguage,
  parseXmlDocument,
  tagName,
  type ParseBibleOptions
} from './common'

// prettier-ignore
const OSIS_BOOKS: Record<string, BookId> = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS', Judg: 'JDG', Ruth: 'RUT',
  '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR',
  Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO', Eccl: 'ECC', Song: 'SNG', Isa: 'ISA',
  Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL', Amos: 'AMO', Obad: 'OBA',
  Jonah: 'JON', Mic: 'MIC', Nah: 'NAM', Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO',
  Gal: 'GAL', Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH', '1Tim': '1TI',
  '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV'
}

/** OSIS book id ("Gen", "1Cor") → USFM id; also accepts USFM ids. Null for books outside the canon. */
export function osisBookToUsfm(osisBook: string): BookId | null {
  const mapped = OSIS_BOOKS[osisBook]
  if (mapped) return mapped
  const upper = osisBook.toUpperCase()
  return isCanonicalBook(upper) ? upper : null
}

/** Elements whose content is never verse text. */
const SKIP = new Set(['note', 'header', 'index', 'figure', 'rdg', 'milestone'])
/** Elements that separate words (paragraphs, poetry lines, line breaks …). */
const BREAKS = new Set(['p', 'l', 'lg', 'lb', 'br', 'div', 'list', 'item', 'table', 'row', 'cell'])

interface VerseRef {
  book: BookId
  chapter: number
  verse: number
}

interface WalkState {
  builder: BibleBuilder
  book: BookId | null
  chapter: number | null
  current: VerseRef | null
}

/** "Gen.1.1", "KJV:Gen.1.1" or "Gen.1.1!a" → reference; null when it is not a canonical verse. */
function parseOsisRef(osisRef: string): VerseRef | null {
  const [bookPart, chapterPart, versePart] = osisRef.replace(/^[^:]*:/, '').split('.')
  const book = bookPart ? osisBookToUsfm(bookPart) : null
  const chapter = leadingNumber(chapterPart)
  const verse = leadingNumber(versePart)
  return book && chapter && verse ? { book, chapter, verse } : null
}

function verseRefs(el: Element, state: WalkState): VerseRef[] {
  const ids = (el.getAttribute('osisID') || el.getAttribute('sID') || '').split(/\s+/).filter(Boolean)
  const refs = ids.map(parseOsisRef).filter((r): r is VerseRef => r !== null)
  if (refs.length > 0) return refs
  const n = leadingNumber(el.getAttribute('n'))
  return n && state.book && state.chapter ? [{ book: state.book, chapter: state.chapter, verse: n }] : []
}

function addText(state: WalkState, text: string): void {
  const v = state.current
  if (v) state.builder.add(v.book, v.chapter, v.verse, text)
}

function handleVerse(el: Element, state: WalkState): void {
  if (el.getAttribute('eID')) {
    state.current = null
    return
  }
  const refs = verseRefs(el, state)
  // Combined verses ("Gen.1.1 Gen.1.2"): the text goes to the first, the others exist but stay empty.
  for (const ref of refs.slice(1)) state.builder.add(ref.book, ref.chapter, ref.verse, '')
  const target = refs[0] ?? null
  if (el.getAttribute('sID') || !el.firstChild) {
    state.current = target
    return
  }
  state.current = target
  walk(el, state)
  state.current = null
}

function handleChapter(el: Element, state: WalkState): boolean {
  if (el.getAttribute('eID')) return false
  const id = el.getAttribute('osisID') || el.getAttribute('sID') || ''
  const [bookPart, chapterPart] = id.replace(/^[^:]*:/, '').split('.')
  const book = bookPart ? osisBookToUsfm(bookPart) : null
  if (book) state.book = book
  state.chapter = leadingNumber(chapterPart) ?? leadingNumber(el.getAttribute('n')) ?? state.chapter
  return Boolean(el.firstChild)
}

function walk(node: Node, state: WalkState): void {
  for (let n = node.firstChild; n; n = n.nextSibling) {
    if (isText(n)) {
      addText(state, n.nodeValue ?? '')
      continue
    }
    if (!isElement(n)) continue
    const tag = tagName(n)
    if (tag === 'verse') {
      handleVerse(n, state)
      continue
    }
    if (tag === 'chapter' && !handleChapter(n, state)) continue
    if (tag === 'div' && n.getAttribute('type') === 'book') {
      state.book = osisBookToUsfm(n.getAttribute('osisID') ?? '')
      state.chapter = null
    }
    if (SKIP.has(tag)) continue
    // Section headings are dropped; canonical titles (psalm superscriptions) inside a verse are kept.
    if (tag === 'title' && n.getAttribute('canonical') !== 'true') continue
    const isBreak = BREAKS.has(tag)
    if (isBreak) addText(state, ' ')
    walk(n, state)
    if (isBreak) addText(state, ' ')
  }
}

/**
 * OSIS XML with verses either as containers (`<verse osisID="Gen.1.1">text</verse>`) or as
 * milestones (`<verse sID="Gen.1.1" osisID="Gen.1.1"/>text<verse eID="Gen.1.1"/>`).
 */
export function parseOsis(xml: string, opts: ParseBibleOptions = {}): BibleData {
  const root = expectRoot(parseXmlDocument(xml), 'osis', ['osis', 'osistext'])
  const osisText = tagName(root) === 'osistext' ? root : (findElement(root, 'osistext') ?? root)
  const workId = osisText.getAttribute('osisIDWork')?.trim() ?? ''
  const header = childElements(osisText).find((e) => tagName(e) === 'header') ?? null
  const works = header ? childElements(header).filter((e) => tagName(e) === 'work') : []
  const work = works.find((w) => w.getAttribute('osisWork') === workId) ?? works[0] ?? null

  const state: WalkState = { builder: new BibleBuilder(), book: null, chapter: null, current: null }
  walk(osisText, state)

  return state.builder.build({
    format: 'osis',
    name: childText(work, 'title') || workId || opts.fallbackName || 'OSIS',
    identifier: workId,
    language: normalizeLanguage(osisText.getAttribute('xml:lang') || childText(work, 'language')),
    license: childText(work, 'rights') || undefined
  })
}
