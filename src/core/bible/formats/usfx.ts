import type { Element, Node } from '@xmldom/xmldom'
import type { BibleData, BookId } from '../model'
import {
  BibleBuilder,
  collapseSpaces,
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

/** Footnotes, cross references, headings, labels and metadata: never verse text. */
const SKIP = new Set([
  'f',
  'fe',
  'ef',
  'x',
  'ex',
  's',
  'h',
  'toc',
  'id',
  'ide',
  'rem',
  'cl',
  'cp',
  'ca',
  'va',
  'vp',
  'fig',
  'periph',
  'languagecode',
  'milestone'
])
/** Elements that separate words. */
const BREAKS = new Set(['p', 'q', 'b', 'd', 'li', 'table', 'tr', 'th', 'tc', 'qc', 'qr', 'qa'])
/** Paragraph styles (sfm attribute) used for titles and introductions rather than Bible text. */
const HEADING_STYLE = /^(mt|ms|mr|mte|r|sr|sp|s|d|cl|i)/

interface WalkState {
  builder: BibleBuilder
  book: BookId | null
  chapter: number | null
  verse: number | null
  name: string
}

function addText(state: WalkState, text: string): void {
  if (state.book && state.chapter && state.verse)
    state.builder.add(state.book, state.chapter, state.verse, text)
}

function walk(node: Node, state: WalkState): void {
  for (let n = node.firstChild; n; n = n.nextSibling) {
    if (isText(n)) {
      addText(state, n.nodeValue ?? '')
      continue
    }
    if (!isElement(n)) continue
    const el: Element = n
    switch (tagName(el)) {
      case 'book': {
        const id = (el.getAttribute('id') ?? '').trim().toUpperCase()
        state.book = isCanonicalBook(id) ? id : null
        state.chapter = null
        state.verse = null
        if (state.book) walk(el, state)
        state.book = null
        state.verse = null
        continue
      }
      case 'c':
        state.chapter = leadingNumber(el.getAttribute('id'))
        state.verse = null
        continue
      case 'v':
        state.verse = leadingNumber(el.getAttribute('id'))
        continue
      case 've':
        state.verse = null
        continue
      case 'id':
        if (!state.name && state.book) state.name = collapseSpaces(el.textContent ?? '')
        continue
    }
    const tag = tagName(el)
    if (SKIP.has(tag)) continue
    if (tag === 'p' && HEADING_STYLE.test(el.getAttribute('sfm') ?? '')) continue
    const isBreak = BREAKS.has(tag)
    if (isBreak) addText(state, ' ')
    walk(el, state)
    if (isBreak) addText(state, ' ')
  }
}

/**
 * USFX XML: `<usfx><book id="GEN"><c id="1"/><v id="1"/>text<ve/>…`. Verse text runs from `<v>` to
 * `<ve/>` or the next `<v>`/`<c>`/book end. Non-canonical books (FRT, GLO, deuterocanon) are ignored.
 */
export function parseUsfx(xml: string, opts: ParseBibleOptions = {}): BibleData {
  const root = expectRoot(parseXmlDocument(xml), 'usfx', ['usfx'])
  const state: WalkState = { builder: new BibleBuilder(), book: null, chapter: null, verse: null, name: '' }
  walk(root, state)
  const languageEl = findElement(root, 'languagecode')

  return state.builder.build({
    format: 'usfx',
    name: state.name || opts.fallbackName || 'USFX',
    identifier: '',
    language: normalizeLanguage(languageEl?.textContent)
  })
}
