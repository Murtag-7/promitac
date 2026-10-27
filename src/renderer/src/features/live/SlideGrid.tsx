import { useEffect, useMemo, useRef } from 'react'
import type { LiveState } from '@core/live/state'
import { SlideTile } from '@/components/common/SlideTile'
import { SECTION_DOT, sectionLabel } from '@/components/common/SectionBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import type { LiveItem } from '@/live/items'
import { useLive } from '@/store/live'
import { mediaUrl, useMedia } from '@/store/media'

export function SlideGrid({
  item,
  live,
  nextState,
  onSlide
}: {
  item: LiveItem
  live: LiveState
  nextState: LiveState | null
  onSlide: (index: number) => void
}) {
  const media = useMedia((s) => s.items)
  // The countdown covers the slide on the wall just like black/logo/hidden text.
  const timerOn = useLive((s) => s.timer !== null)
  const gridRef = useRef<HTMLDivElement>(null)
  const isLiveItem = live.itemId === item.id

  // One chip per section (not per repetition); a click jumps to its next occurrence after the
  // current slide, like the section keys do.
  const jumps = useMemo(() => {
    const out: Array<{
      sectionId: string
      starts: number[]
      label: string
      type: NonNullable<LiveItem['slides'][number]['sectionType']>
    }> = []
    item.slides.forEach((s, i) => {
      const prev = item.slides[i - 1]
      if (!s.sectionType || !s.sectionId) return
      if (prev && prev.id.split('.')[0] === s.id.split('.')[0]) return
      const existing = out.find((j) => j.sectionId === s.sectionId)
      if (existing) existing.starts.push(i)
      else
        out.push({
          sectionId: s.sectionId,
          starts: [i],
          label: sectionLabel(s.sectionType, s.sectionId),
          type: s.sectionType
        })
    })
    return out
  }, [item.slides])

  // Keep the live slide in view when navigating with keys/clicker.
  useEffect(() => {
    if (!isLiveItem) return
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-slide-index="${live.slideIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [isLiveItem, live.slideIndex])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2.5 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-screen font-[650] tracking-[-0.01em] text-ink">{item.title}</h1>
          {item.subtitle ? <p className="truncate text-small text-ink-2">{item.subtitle}</p> : null}
        </div>
        {jumps.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={cs.live.sectionsJump}>
            {jumps.map((j) => {
              const current = isLiveItem ? item.slides[live.slideIndex]?.sectionId : undefined
              const active = current === j.sectionId
              const target =
                (isLiveItem ? j.starts.find((i) => i > live.slideIndex) : undefined) ?? j.starts[0] ?? 0
              return (
                <button
                  key={j.sectionId}
                  type="button"
                  onClick={() => onSlide(target)}
                  className={cn(
                    'press flex h-8 items-center gap-1.5 rounded-full px-3 text-small font-[550] text-ink-2 ring-1 ring-inset ring-line hover:bg-raised hover:text-ink',
                    active && 'bg-raised text-ink ring-line-strong'
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', SECTION_DOT[j.type])} aria-hidden />
                  {j.label}
                  {j.starts.length > 1 ? (
                    <span className="text-meta text-ink-2">×{j.starts.length}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
      {item.slides.length === 0 ? (
        <EmptyState
          title={item.problem ? cs.live.itemProblem[item.problem] : cs.songs.noSlides}
          text={item.problem === 'loading' ? cs.live.loadingBible : undefined}
        />
      ) : (
        <div
          ref={gridRef}
          className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(210px,1fr))] content-start gap-3 overflow-y-auto p-5"
        >
          {item.slides.map((slide, i) => {
            const state =
              isLiveItem && live.slideIndex === i
                ? 'live'
                : nextState && nextState.itemId === item.id && nextState.slideIndex === i
                  ? 'next'
                  : 'idle'
            const prev = item.slides[i - 1]
            const showSection = !prev || prev.id.split('.')[0] !== slide.id.split('.')[0]
            const m = slide.mediaId ? media.find((x) => x.id === slide.mediaId) : undefined
            return (
              <SlideTile
                key={`${slide.id}-${i}`}
                slide={slide}
                index={i}
                state={state}
                showSection={showSection}
                onClick={() => onSlide(i)}
                hidden={state === 'live' && (live.overlay !== 'none' || timerOn)}
                mediaUrl={m && m.kind === 'image' ? mediaUrl(m) : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
