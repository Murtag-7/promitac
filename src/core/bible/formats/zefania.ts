import type { Node } from '@xmldom/xmldom'
import { BOOKS } from '../books'
import type { BibleData } from '../model'
import {
  BibleBuilder,
  childElements,
  childText,
  expectRoot,
  isElement,
  isText,
  leadingNumber,
  normalizeLanguage,
  parseXmlDocument,
  tagName,
  type ParseBibleOptions
} from './common'

/** Elements whose content is not part of the verse text. */
const SKIP = new Set(['note', 'xref', 'caption', 'remark', 'prolog', 'media'])
/** Elements that separate words. */
const BREAKS = new Set(['br', 'div'])

function verseText(node: Node, out: string[]): void {
  for (let n = node.firstChild; n; n = n.nextSibling) {
    if (isText(n)) out.push(n.nodeValue ?? '')
    else if (isElement(n)) {
      const tag = tagName(n)
      if (SKIP.has(tag)) continue
      if (BREAKS.has(tag)) out.push(' ')
      verseText(n, out)
      if (BREAKS.has(tag)) out.push(' ')
    }
  }
}

/**
 * Zefania XML: `<XMLBIBLE biblename><INFORMATION/><BIBLEBOOK bnumber><CHAPTER cnumber><VERS vnumber>`.
 * Book numbers 1–66 follow the Protestant canon; higher numbers (deuterocanon) are ignored.
 */
export function parseZefania(xml: string, opts: ParseBibleOptions = {}): BibleData {
  const root = expectRoot(parseXmlDocument(xml), 'zefania', ['xmlbible'])
  const info = childElements(root).find((e) => tagName(e) === 'information') ?? null
  const name =
    childText(info, 'title') || root.getAttribute('biblename')?.trim() || opts.fallbackName || 'Zefania'
  const builder = new BibleBuilder()

  for (const bookEl of childElements(root)) {
    if (tagName(bookEl) !== 'biblebook') continue
    const bnumber = leadingNumber(bookEl.getAttribute('bnumber'))
    const book = bnumber ? BOOKS[bnumber - 1] : undefined
    if (!book) continue
    for (const chapterEl of childElements(bookEl)) {
      if (tagName(chapterEl) !== 'chapter') continue
      const chapter = leadingNumber(chapterEl.getAttribute('cnumber'))
      if (!chapter) continue
      for (const verseEl of childElements(chapterEl)) {
        if (tagName(verseEl) !== 'vers') continue
        const verse = leadingNumber(verseEl.getAttribute('vnumber'))
        if (!verse) continue
        const parts: string[] = []
        verseText(verseEl, parts)
        builder.add(book.id, chapter, verse, parts.join(''))
      }
    }
  }

  return builder.build({
    format: 'zefania',
    name,
    identifier: childText(info, 'identifier'),
    language: normalizeLanguage(childText(info, 'language')),
    license: childText(info, 'rights') || undefined
  })
}
