import { useEffect, useMemo, useRef, useState } from 'react'
import { Music4, Plus, Search, X } from 'lucide-react'
import { firstLyricLine } from '@core/chordpro/text'
import { fold } from '@core/search/normalize'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { songIndex, useLibrary } from '@/store/library'

export function SongList({
  selectedId,
  onSelect,
  onCreate
}: {
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}) {
  const songs = useLibrary((s) => s.songs)
  const order = useLibrary((s) => s.order)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+F focuses the search, like everywhere else on the desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of Object.values(songs)) for (const t of s.meta.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs')).map(([t]) => t)
  }, [songs])

  // Every tag stays reachable without sideways scrolling: the most used first, the rest on request.
  const [showAllTags, setShowAllTags] = useState(false)
  const visibleTags =
    showAllTags || tags.length <= TAG_LIMIT
      ? tags
      : [...tags.slice(0, TAG_LIMIT), ...(tag && !tags.slice(0, TAG_LIMIT).includes(tag) ? [tag] : [])]
  const hiddenTagCount = tags.length - visibleTags.length

  const ids = useMemo(() => {
    const base = query.trim() ? songIndex.search(query, 300).map((r) => r.id) : order
    const filtered = tag ? base.filter((id) => songs[id]?.meta.tags.some((t) => fold(t) === fold(tag))) : base
    return filtered.filter((id) => songs[id])
  }, [query, tag, order, songs])

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel" aria-label={cs.songs.title}>
      <div className="flex flex-col gap-2.5 border-b border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="px-1 text-screen font-[650] tracking-[-0.01em] text-ink">{cs.songs.title}</h1>
          <Button size="sm" onClick={onCreate}>
            <Plus aria-hidden />
            {cs.songs.newSong}
          </Button>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
              if (e.key === 'Enter' && ids[0]) onSelect(ids[0])
            }}
            placeholder={cs.songs.searchPlaceholder}
            aria-label={cs.common.search}
            className="h-9 w-full rounded-control bg-raised pl-9 pr-8 text-body text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={cs.common.cancel}
              className="press absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[5px] text-ink-3 hover:bg-raised-2 hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1" role="group" aria-label={cs.songs.meta.tags}>
            <TagChip active={tag === null} onClick={() => setTag(null)}>
              {cs.songs.allTags}
            </TagChip>
            {visibleTags.map((t) => (
              <TagChip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </TagChip>
            ))}
            {hiddenTagCount > 0 ? (
              <TagChip active={false} onClick={() => setShowAllTags(true)}>
                {cs.songs.moreTags(hiddenTagCount)}
              </TagChip>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {ids.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-body text-ink">
              {query ? cs.songs.noResults(query) : cs.songs.emptyLibraryTitle}
            </p>
            <p className="mt-1 text-small text-ink-2">
              {query ? cs.songs.noResultsHint : cs.songs.emptyLibraryText}
            </p>
          </div>
        ) : (
          <ul aria-label={cs.common.songsCount(ids.length)}>
            {ids.map((id) => {
              const song = songs[id]
              if (!song) return null
              const first = firstLyricLine(song)
              return (
                <li key={id} className="[content-visibility:auto] [contain-intrinsic-size:auto_52px]">
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    aria-current={selectedId === id ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-raised',
                      selectedId === id && 'bg-raised ring-1 ring-inset ring-line-strong'
                    )}
                  >
                    <Music4 className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-[550] text-ink">
                        {song.meta.title || cs.common.untitled}
                      </span>
                      <span className="block truncate text-meta text-ink-3">
                        {song.meta.artist ? `${song.meta.artist} · ${first}` : first}
                      </span>
                    </span>
                    {song.meta.key ? (
                      <span className="mt-0.5 shrink-0 rounded-chip px-1.5 text-meta font-[600] text-ink-2 ring-1 ring-inset ring-line">
                        {song.meta.key}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-line px-4 py-2 text-meta text-ink-3">
        {cs.common.songsCount(ids.length)}
      </div>
    </aside>
  )
}

const TAG_LIMIT = 6

function TagChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'press h-7 shrink-0 rounded-full px-2.5 text-small font-[550] text-ink-2 ring-1 ring-inset ring-line hover:text-ink',
        active && 'bg-light text-light-ink ring-light hover:text-light-ink'
      )}
    >
      {children}
    </button>
  )
}
