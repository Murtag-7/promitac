import type { Slide } from '@core/slides/model'
import { ImageIcon } from 'lucide-react'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { SectionBadge } from './SectionBadge'

/**
 * Text card of one slide for the slide grid. Live = tally red frame, next = green.
 * Kept as readable text (not a scaled screenshot) so it is legible at 1280×720.
 */
export function SlideTile({
  slide,
  index,
  state,
  onClick,
  showSection,
  mediaUrl,
  hotkey
}: {
  slide: Slide
  index: number
  state: 'live' | 'next' | 'selected' | 'idle'
  onClick?: () => void
  showSection: boolean
  mediaUrl?: string
  hotkey?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-slide-index={index}
      data-state={state}
      aria-label={`${cs.common.project}: ${slide.title ?? ''} ${slide.lines.join(' ')}`.trim()}
      aria-pressed={state === 'live'}
      className={cn(
        'group relative flex aspect-[16/9] w-full flex-col overflow-hidden rounded-card bg-raised p-3 text-left ring-1 ring-inset ring-line transition-[box-shadow,background-color] duration-100 hover:bg-raised-2 hover:ring-line-strong',
        state === 'live' && 'bg-live-soft ring-2 ring-live hover:bg-live-soft hover:ring-live',
        state === 'next' && 'ring-2 ring-next/80 hover:ring-next',
        state === 'selected' && 'ring-2 ring-light/80 hover:ring-light'
      )}
    >
      <div className="mb-1.5 flex h-5 items-center gap-1.5">
        {showSection && slide.sectionType ? (
          <SectionBadge type={slide.sectionType} id={slide.sectionId} />
        ) : null}
        {state === 'live' ? (
          <span className="flex items-center gap-1 text-meta font-[650] text-live">
            <span className="size-1.5 rounded-full bg-live" aria-hidden />
            {cs.live.onAir}
          </span>
        ) : state === 'next' ? (
          <span className="text-meta font-[650] text-next">{cs.live.next}</span>
        ) : null}
        <span className="ml-auto text-meta tabular text-ink-3">{hotkey ?? index + 1}</span>
      </div>
      {slide.kind === 'media' ? (
        mediaUrl ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded-[6px] bg-black">
            <img src={mediaUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          </div>
        ) : (
          <div className="grid flex-1 place-items-center text-ink-3">
            <ImageIcon className="size-6" aria-hidden />
          </div>
        )
      ) : slide.kind === 'blank' ? (
        <div className="grid flex-1 place-items-center text-small text-ink-3">{cs.live.blankSlide}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden text-small leading-[18px] text-ink">
          {slide.title ? <div className="mb-0.5 font-[600] text-ink-2">{slide.title}</div> : null}
          {slide.lines.map((l, i) => (
            <div key={i} className={cn(slide.kind === 'bible' ? 'line-clamp-4' : 'truncate')}>
              {l}
            </div>
          ))}
          {slide.footer ? <div className="mt-1 truncate text-meta text-ink-3">{slide.footer}</div> : null}
        </div>
      )}
    </button>
  )
}
