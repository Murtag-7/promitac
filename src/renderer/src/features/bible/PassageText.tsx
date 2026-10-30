import { useEffect, useMemo, useRef } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, RotateCw, SearchX } from 'lucide-react'
import { getBook } from '@core/bible/books'
import type { BibleData, BibleTranslationInfo } from '@core/bible/model'
import { formatReference, type BibleRef } from '@core/bible/reference'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import type { TranslationStatus } from './useCurrentTranslation'
import { isSelected, useBibleView, type ChapterView } from './viewStore'

/** Centre column: the chapter(s) around the selected passage, verses clickable to select. */
export function PassageText({
  data,
  info,
  status,
  passage,
  onRetry
}: {
  data: BibleData | undefined
  info: BibleTranslationInfo | undefined
  status: TranslationStatus
  passage: BibleRef | null
  onRetry: () => void
}) {
  const view = useBibleView((s) => s.view)
  const setInput = useBibleView((s) => s.setInput)

  if (status === 'error') {
    return (
      <EmptyState icon={BookOpen} title={cs.bible.loadFailed} className="flex-1">
        <Button variant="primary" onClick={onRetry}>
          <RotateCw aria-hidden />
          {cs.common.retry}
        </Button>
      </EmptyState>
    )
  }
  if (!view) {
    return (
      <EmptyState icon={BookOpen} title={cs.bible.emptyTitle} text={cs.bible.empty} className="flex-1">
        <span className="text-small text-ink-2">{cs.bible.examplesLabel}</span>
        {cs.bible.examples.map((example) => (
          <Button key={example} variant="secondary" size="sm" onClick={() => setInput(example)}>
            {example}
          </Button>
        ))}
      </EmptyState>
    )
  }
  if (status === 'loading' || !data || !info) return <PassageSkeleton />
  return <Chapters data={data} info={info} view={view} passage={passage} />
}

function Chapters({
  data,
  info,
  view,
  passage
}: {
  data: BibleData
  info: BibleTranslationInfo
  view: ChapterView
  passage: BibleRef | null
}) {
  const scrollKey = useBibleView((s) => s.scrollKey)
  const clickVerse = useBibleView((s) => s.clickVerse)
  const pickChapter = useBibleView((s) => s.pickChapter)
  const scrollRef = useRef<HTMLDivElement>(null)
  const book = getBook(view.book)

  const chapters = useMemo(() => {
    const bookData = data.books.find((b) => b.id === view.book)
    const out: Array<{ chapter: number; verses: Array<{ verse: number; text: string }> }> = []
    for (let chapter = view.from; chapter <= view.to; chapter++) {
      const verses = (bookData?.chapters[chapter - 1] ?? [])
        .map((text, i) => ({ verse: i + 1, text }))
        .filter((v) => v.text)
      if (verses.length > 0) out.push({ chapter, verses })
    }
    return out
  }, [data, view])

  // Typed reference or chapter pick: bring the selection (or the chapter start) into view.
  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    const el = box.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!el) {
      box.scrollTop = 0
      return
    }
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    box.scrollTop = Math.max(0, top - box.clientHeight / 3)
  }, [scrollKey, data]) // only on explicit navigation, not on every verse click

  const heading = formatReference(
    view.to === view.from
      ? { book: view.book, chapter: view.from }
      : { book: view.book, chapter: view.from, chapterEnd: view.to }
  )
  const source = info.builtIn ? cs.bible.builtIn : info.license || cs.bible.importedLabel

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <article className="mx-auto w-full max-w-[72ch] px-6 pb-16 pt-6">
        <header className="mb-4 flex items-start gap-3 px-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-screen font-[650] tracking-[-0.01em] text-ink">{heading}</h1>
            <p className="mt-0.5 truncate text-small text-ink-2">
              {info.name} · {source}
            </p>
          </div>
          {book ? (
            <div className="flex shrink-0 items-center gap-1">
              <Tip label={cs.bible.prevChapter}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={cs.bible.prevChapter}
                  disabled={view.from <= 1}
                  onClick={() => pickChapter(view.book, view.from - 1)}
                >
                  <ChevronLeft aria-hidden />
                </Button>
              </Tip>
              <Tip label={cs.bible.nextChapter}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={cs.bible.nextChapter}
                  disabled={view.to >= book.chapters}
                  onClick={() => pickChapter(view.book, view.to + 1)}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </Tip>
            </div>
          ) : null}
        </header>

        {chapters.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={cs.bible.notInTranslation(info.abbreviation)}
            text={cs.bible.notInTranslationHint}
            className="h-auto py-16"
          />
        ) : (
          <>
            <p className="mb-3 px-3 text-small text-ink-2">{cs.bible.selectionHint}</p>
            <div aria-label={cs.bible.passageLabel} role="group">
              {chapters.map(({ chapter, verses }) => {
                const flags = verses.map((v) => isSelected(passage, view.book, { chapter, verse: v.verse }))
                return (
                  <section key={chapter} className="[&+section]:mt-6">
                    {view.from !== view.to ? (
                      <h2 className="px-3 pb-2 text-title font-[650] text-ink">
                        {cs.bible.chapterHeading(chapter)}
                      </h2>
                    ) : null}
                    <ol className="flex flex-col">
                      {verses.map((v, i) => {
                        const selected = flags[i] ?? false
                        const first = selected && !flags[i - 1]
                        const last = selected && !flags[i + 1]
                        return (
                          <li key={v.verse}>
                            <button
                              type="button"
                              data-verse={`${chapter}:${v.verse}`}
                              aria-pressed={selected}
                              onClick={(e) => clickVerse({ chapter, verse: v.verse }, e.shiftKey)}
                              className={cn(
                                'relative flex w-full items-baseline gap-3 px-3 py-[5px] text-left transition-colors duration-100',
                                selected
                                  ? 'bg-light/[0.08] hover:bg-light/[0.12]'
                                  : 'rounded-control hover:bg-raised',
                                first && 'rounded-t-control',
                                last && 'rounded-b-control'
                              )}
                            >
                              {selected ? (
                                <span
                                  aria-hidden
                                  className={cn(
                                    'absolute left-0 w-[3px] bg-light',
                                    first ? 'top-1.5 rounded-t-full' : 'top-0',
                                    last ? 'bottom-1.5 rounded-b-full' : 'bottom-0'
                                  )}
                                />
                              ) : null}
                              <span
                                className={cn(
                                  'w-7 shrink-0 text-right text-meta font-[650] tabular',
                                  selected ? 'text-light' : 'text-ink-2'
                                )}
                              >
                                {v.verse}
                              </span>
                              <span className="min-w-0 flex-1 text-[16px] leading-[26px] text-ink [text-wrap:pretty]">
                                {v.text}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ol>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </article>
    </div>
  )
}

const SKELETON_WIDTHS = ['92%', '78%', '96%', '64%', '88%', '72%', '94%', '58%']

/** Quiet loading state: placeholder lines where the text will appear. */
function PassageSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden" role="status" aria-label={cs.bible.loading}>
      <div className="mx-auto w-full max-w-[72ch] px-9 pt-7">
        <div className="mb-3 h-6 w-40 animate-pulse rounded-chip bg-raised" />
        <div className="mb-8 h-3.5 w-64 animate-pulse rounded-chip bg-raised" />
        <div className="flex flex-col gap-4">
          {SKELETON_WIDTHS.map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-5 animate-pulse rounded-chip bg-raised" />
              <div className="h-3.5 animate-pulse rounded-chip bg-raised" style={{ width: w }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
