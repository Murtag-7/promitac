import type { Slide } from '../slides/model'
import type { BibleData } from './model'
import { formatReference, type BibleRef, type RefLang } from './reference'

export interface PassageVerse {
  chapter: number
  verse: number
  text: string
}

/**
 * Verses of `ref` that exist in `data`, in order. Whole chapters when no verse is given; ranges are
 * clamped to the verses the translation has; verses missing in the translation (empty) are skipped.
 */
export function getVerses(data: BibleData, ref: BibleRef): PassageVerse[] {
  const book = data.books.find((b) => b.id === ref.book)
  if (!book) return []
  const lastChapter = Math.min(ref.chapterEnd ?? ref.chapter, book.chapters.length)
  const out: PassageVerse[] = []
  for (let chapter = ref.chapter; chapter <= lastChapter; chapter++) {
    const verses = book.chapters[chapter - 1] ?? []
    const isFirst = chapter === ref.chapter
    const isLast = chapter === (ref.chapterEnd ?? ref.chapter)
    let from = 1
    let to = verses.length
    if (ref.verseStart !== undefined) {
      if (isFirst) from = ref.verseStart
      if (isLast) to = Math.min(to, ref.verseEnd ?? (ref.chapterEnd === undefined ? ref.verseStart : to))
    }
    for (let verse = from; verse <= to; verse++) {
      const text = verses[verse - 1]
      if (text) out.push({ chapter, verse, text })
    }
  }
  return out
}

export interface PassageSlideOptions {
  /** Maximum characters of one slide's text (verse numbers included). */
  maxChars: number
  verseNumbers: boolean
  /** Translation label shown after the reference, e.g. "BKR". Empty → no brackets. */
  label: string
  lang?: RefLang
}

interface Unit {
  text: string
  chapter: number
  verse: number
}

const SPLITTERS: RegExp[] = [/(?<=[.!?;])\s+/u, /(?<=,)\s+/u, /\s+/u]

/** Split `text` into pieces of at most `max` characters, preferring sentence, then comma, then word boundaries. */
function splitText(text: string, max: number, level = 0): string[] {
  if (text.length <= max) return [text]
  const splitter = SPLITTERS[level]
  if (!splitter) {
    const pieces: string[] = []
    for (let i = 0; i < text.length; i += max) pieces.push(text.slice(i, i + max))
    return pieces
  }
  const parts = text.split(splitter).filter(Boolean)
  if (parts.length < 2) return splitText(text, max, level + 1)
  const out: string[] = []
  let current = ''
  for (const part of parts) {
    for (const piece of splitText(part, max, level + 1)) {
      if (!current) current = piece
      else if (current.length + 1 + piece.length <= max) current += ` ${piece}`
      else {
        out.push(current)
        current = piece
      }
    }
  }
  if (current) out.push(current)
  return out
}

function slideRef(ref: BibleRef, units: Unit[], wholePassage: boolean): BibleRef {
  if (wholePassage && ref.verseStart === undefined) {
    return ref.chapterEnd === undefined
      ? { book: ref.book, chapter: ref.chapter }
      : { book: ref.book, chapter: ref.chapter, chapterEnd: ref.chapterEnd }
  }
  const first = units[0]!
  const last = units[units.length - 1]!
  const sub: BibleRef = { book: ref.book, chapter: first.chapter, verseStart: first.verse }
  if (last.chapter !== first.chapter) {
    sub.chapterEnd = last.chapter
    sub.verseEnd = last.verse
  } else if (last.verse !== first.verse) {
    sub.verseEnd = last.verse
  }
  return sub
}

/**
 * Turn verses into projectable slides: whole verses are grouped greedily up to `maxChars`; a verse
 * longer than that is split at sentence boundaries. Each slide carries its own reference in the footer.
 */
export function passageToSlides(verses: PassageVerse[], ref: BibleRef, opts: PassageSlideOptions): Slide[] {
  if (verses.length === 0) return []
  const max = Math.max(10, Math.floor(opts.maxChars))
  const spansChapters = verses.some((v) => v.chapter !== verses[0]!.chapter)

  const units: Unit[] = []
  for (const v of verses) {
    const text = v.text.replace(/\s+/gu, ' ').trim()
    const prefix = !opts.verseNumbers ? '' : spansChapters ? `${v.chapter}:${v.verse} ` : `${v.verse} `
    for (const piece of splitText(prefix + text, max))
      units.push({ text: piece, chapter: v.chapter, verse: v.verse })
  }

  const groups: Unit[][] = []
  let current: Unit[] = []
  let length = 0
  for (const unit of units) {
    if (current.length > 0 && length + 1 + unit.text.length > max) {
      groups.push(current)
      current = []
      length = 0
    }
    length += (current.length > 0 ? 1 : 0) + unit.text.length
    current.push(unit)
  }
  if (current.length > 0) groups.push(current)

  return groups.map((group, i) => {
    const sub = slideRef(ref, group, groups.length === 1)
    const reference = formatReference(sub, opts.lang ?? 'cs')
    return {
      id: `bible#${i}`,
      kind: 'bible',
      lines: [group.map((u) => u.text).join(' ')],
      footer: opts.label ? `${reference} (${opts.label})` : reference
    }
  })
}
