import { useEffect, useMemo, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import { BOOKS, getBook, type BookInfo } from '@core/bible/books'
import type { BibleData } from '@core/bible/model'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { useBibleView } from './viewStore'

const GROUPS: Array<{ testament: BookInfo['testament']; label: string }> = [
  { testament: 'OT', label: cs.bible.oldTestament },
  { testament: 'NT', label: cs.bible.newTestament }
]

/** Left column: books grouped by testament, then the chapter grid of the chosen book. */
export function BookBrowser({ data, footer }: { data: BibleData | undefined; footer?: React.ReactNode }) {
  const browseBook = useBibleView((s) => s.browseBook)
  const book = browseBook ? getBook(browseBook) : undefined
  const present = useMemo(() => (data ? new Set(data.books.map((b) => b.id)) : null), [data])

  return (
    <aside aria-label={cs.bible.booksLabel} className="flex min-h-0 flex-col bg-panel">
      {book ? <ChapterGrid book={book} /> : <BookList present={present} />}
      {footer}
    </aside>
  )
}

function BookList({ present }: { present: Set<string> | null }) {
  const current = useBibleView((s) => s.view?.book ?? null)
  const browse = useBibleView((s) => s.browse)
  const pickChapter = useBibleView((s) => s.pickChapter)
  const listRef = useRef<HTMLDivElement>(null)

  // Coming back from a chapter grid: keep the current book in sight.
  useEffect(() => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !el) return
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
    list.scrollTop = Math.max(0, top - list.clientHeight / 3)
  }, [])

  const open = (book: BookInfo): void => {
    if (book.chapters === 1) pickChapter(book.id, 1)
    else browse(book.id)
  }

  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {GROUPS.map((group) => (
        <section key={group.testament} aria-label={group.label}>
          <h2 className="px-2.5 pb-1.5 pt-4 text-small font-[650] text-ink-2">{group.label}</h2>
          <ul className="flex flex-col">
            {BOOKS.filter((b) => b.testament === group.testament).map((book) => {
              const missing = present !== null && !present.has(book.id)
              const isCurrent = book.id === current
              return (
                <li key={book.id}>
                  <button
                    type="button"
                    onClick={() => open(book)}
                    aria-current={isCurrent ? 'true' : undefined}
                    title={missing ? cs.bible.bookMissing : undefined}
                    className={cn(
                      'press flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left text-body hover:bg-raised',
                      isCurrent && 'bg-raised ring-1 ring-inset ring-line-strong',
                      missing ? 'text-ink-3' : 'text-ink'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{book.nameCs}</span>
                    <span className="shrink-0 text-small text-ink-2">{book.abbrCs}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ChapterGrid({ book }: { book: BookInfo }) {
  const view = useBibleView((s) => s.view)
  const browse = useBibleView((s) => s.browse)
  const pickChapter = useBibleView((s) => s.pickChapter)
  const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1)
  const inView = (c: number): boolean =>
    view !== null && view.book === book.id && c >= view.from && c <= view.to

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-3 py-3">
        <Button variant="ghost" size="sm" className="-ml-1 self-start px-2" onClick={() => browse(null)}>
          <ChevronLeft aria-hidden />
          {cs.bible.allBooks}
        </Button>
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="truncate text-title font-[650] tracking-[-0.01em] text-ink">{book.nameCs}</h2>
          <span className="shrink-0 text-small text-ink-2">{book.abbrCs}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div
          role="group"
          aria-label={cs.bible.chaptersOf(book.nameCs)}
          className="grid grid-cols-[repeat(auto-fill,minmax(38px,1fr))] gap-1.5"
        >
          {chapters.map((c) => {
            const active = inView(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => pickChapter(book.id, c)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'press h-9 rounded-control text-small font-[550] tabular ring-1 ring-inset',
                  active
                    ? 'bg-light text-light-ink ring-light hover:bg-light/90'
                    : 'bg-raised text-ink ring-line hover:bg-raised-2 hover:ring-line-strong'
                )}
              >
                {c}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
