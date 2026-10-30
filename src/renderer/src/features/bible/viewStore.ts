import { create } from 'zustand'
import type { BookId } from '@core/bible/model'
import { formatReference, parseReference, type BibleRef } from '@core/bible/reference'

/** Chapters shown in the reading pane (may be wider than the selected passage). */
export interface ChapterView {
  book: BookId
  from: number
  to: number
}

export interface VersePos {
  chapter: number
  verse: number
}

interface BibleViewState {
  /** Text of the reference field – the selected passage is always parsed from it. */
  input: string
  view: ChapterView | null
  /** Verse a shift-click extends from. */
  anchor: VersePos | null
  /** Book whose chapter grid is open in the browser column; null = list of books. */
  browseBook: BookId | null
  /** Bumped when the reading pane should scroll to the selection (typing, chapter pick). */
  scrollKey: number
  setInput(text: string): void
  pickChapter(book: BookId, chapter: number): void
  clickVerse(pos: VersePos, extend: boolean): void
  browse(book: BookId | null): void
}

function compare(a: VersePos, b: VersePos): number {
  return a.chapter - b.chapter || a.verse - b.verse
}

/** Reference covering `a`..`b` (in any order) inside one book. */
export function rangeRef(book: BookId, a: VersePos, b: VersePos): BibleRef {
  const [start, end] = compare(a, b) <= 0 ? [a, b] : [b, a]
  const ref: BibleRef = { book, chapter: start.chapter, verseStart: start.verse }
  if (end.chapter !== start.chapter) {
    ref.chapterEnd = end.chapter
    ref.verseEnd = end.verse
  } else if (end.verse !== start.verse) {
    ref.verseEnd = end.verse
  }
  return ref
}

/** Is verse `pos` part of an explicit verse selection? Whole-chapter references select nothing. */
export function isSelected(ref: BibleRef | null, book: BookId, pos: VersePos): boolean {
  if (!ref || ref.book !== book || ref.verseStart === undefined) return false
  const start: VersePos = { chapter: ref.chapter, verse: ref.verseStart }
  const end: VersePos =
    ref.chapterEnd !== undefined
      ? { chapter: ref.chapterEnd, verse: ref.verseEnd ?? Number.MAX_SAFE_INTEGER }
      : { chapter: ref.chapter, verse: ref.verseEnd ?? ref.verseStart }
  return compare(pos, start) >= 0 && compare(pos, end) <= 0
}

export const useBibleView = create<BibleViewState>((set, get) => ({
  input: '',
  view: null,
  anchor: null,
  browseBook: null,
  scrollKey: 0,
  setInput: (input) => {
    const ref = parseReference(input)
    if (!ref) {
      set({ input })
      return
    }
    set({
      input,
      view: { book: ref.book, from: ref.chapter, to: ref.chapterEnd ?? ref.chapter },
      anchor: ref.verseStart !== undefined ? { chapter: ref.chapter, verse: ref.verseStart } : null,
      browseBook: ref.book,
      scrollKey: get().scrollKey + 1
    })
  },
  pickChapter: (book, chapter) =>
    set({
      input: formatReference({ book, chapter }),
      view: { book, from: chapter, to: chapter },
      anchor: null,
      browseBook: book,
      scrollKey: get().scrollKey + 1
    }),
  clickVerse: (pos, extend) => {
    const { view, anchor } = get()
    if (!view) return
    const from = extend && anchor ? anchor : pos
    set({ input: formatReference(rangeRef(view.book, from, pos)), anchor: from })
  },
  browse: (browseBook) => set({ browseBook })
}))
