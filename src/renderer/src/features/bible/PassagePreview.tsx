import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ListPlus, MonitorPlay } from 'lucide-react'
import type { BibleData, BibleTranslationInfo } from '@core/bible/model'
import { getVerses, passageToSlides } from '@core/bible/passage'
import { formatReference, type BibleRef } from '@core/bible/reference'
import type { PlanItem } from '@core/plan/model'
import { ProjectionView } from '@/components/projection/ProjectionView'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { buildFrame, type LiveItem } from '@/live/items'
import { addToLivePlan, projectNow, useLive } from '@/store/live'
import { mediaUrl, useMedia } from '@/store/media'
import { useSettings } from '@/store/settings'
import { useThemes } from '@/store/themes'
import { useUi } from '@/store/ui'
import type { TranslationStatus } from './useCurrentTranslation'

const PREVIEW_ID = 'bible-preview'

/** Right column: how the selected passage looks on the screen, split into slides, plus the actions. */
export function PassagePreview({
  data,
  info,
  status,
  passage
}: {
  data: BibleData | undefined
  info: BibleTranslationInfo | undefined
  status: TranslationStatus
  passage: BibleRef | null
}) {
  const settings = useSettings((s) => s.settings)
  const themes = useThemes((s) => s.themes)
  const mediaItems = useMedia((s) => s.items)
  const backgroundOverride = useLive((s) => s.backgroundOverride)
  const [picked, setPicked] = useState<{ key: string; index: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const reference = passage ? formatReference(passage) : ''
  const slides = useMemo(() => {
    if (!data || !passage) return []
    return passageToSlides(getVerses(data, passage), passage, {
      maxChars: settings.bibleMaxChars,
      verseNumbers: settings.bibleVerseNumbers,
      label: data.abbreviation,
      lang: data.language === 'cs' ? 'cs' : 'en'
    })
  }, [data, passage, settings.bibleMaxChars, settings.bibleVerseNumbers])

  const key = `${data?.id ?? ''}|${reference}`
  const index = picked?.key === key ? Math.min(picked.index, Math.max(0, slides.length - 1)) : 0

  const frame = useMemo(() => {
    if (!data || !passage || slides.length === 0) return null
    const item: PlanItem = { id: PREVIEW_ID, type: 'bible', reference, translationId: data.id }
    const liveItem: LiveItem = { id: PREVIEW_ID, item, title: reference, slides }
    return buildFrame({
      live: { itemId: PREVIEW_ID, slideIndex: index, overlay: 'none' },
      items: [liveItem],
      themes,
      settings,
      alert: null,
      timer: null,
      backgroundOverride,
      seq: 0,
      mediaItems,
      mediaUrl: (m) => mediaUrl(m)
    })
  }, [data, passage, slides, reference, index, themes, settings, backgroundOverride, mediaItems])

  const ready = Boolean(data && info && passage && slides.length > 0)

  const run = async (action: 'plan' | 'project'): Promise<void> => {
    if (!data || !passage || busy) return
    setBusy(true)
    const item = { type: 'bible' as const, reference, translationId: data.id }
    try {
      if (action === 'plan') {
        await addToLivePlan(item)
        toast.success(cs.bible.addedToPlan(reference), {
          action: { label: cs.bible.showInLive, onClick: () => useUi.getState().setView('live') }
        })
      } else {
        await projectNow(item)
        useUi.getState().setView('live')
      }
    } catch (err) {
      console.error(err)
      toast.error(cs.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside aria-label={cs.bible.preview} className="flex min-h-0 flex-col bg-panel">
      <div className="flex items-baseline justify-between gap-2 px-4 pb-2.5 pt-4">
        <h2 className="text-title font-[650] text-ink">{cs.bible.preview}</h2>
        {ready ? (
          <span className="text-small tabular text-ink-2">{cs.common.slides(slides.length)}</span>
        ) : null}
      </div>

      <div className="px-4">
        {status === 'loading' && passage ? (
          <div className="aspect-video w-full animate-pulse rounded-card bg-raised" />
        ) : frame ? (
          <div className="overflow-hidden rounded-card ring-1 ring-line">
            <ProjectionView
              frame={frame}
              mode="preview"
              className="aspect-video w-full"
              label={`${cs.bible.preview}: ${reference}`}
            />
          </div>
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-card bg-raised px-6 text-center text-small text-ink-2 ring-1 ring-inset ring-line [text-wrap:pretty]">
            {cs.bible.previewEmpty}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {slides.length > 1 ? (
          <ol aria-label={cs.bible.previewSlides} className="flex flex-col gap-2">
            {slides.map((slide, i) => (
              <li key={slide.id}>
                <button
                  type="button"
                  aria-pressed={i === index}
                  onClick={() => setPicked({ key, index: i })}
                  className={cn(
                    'press w-full rounded-control bg-raised px-3 py-2.5 text-left ring-1 ring-inset ring-line hover:bg-raised-2 hover:ring-line-strong',
                    i === index && 'ring-2 ring-light hover:ring-light'
                  )}
                >
                  <span className="mb-1 flex items-center justify-between gap-2 text-meta text-ink-2">
                    <span className="shrink-0 font-[600] tabular">{cs.bible.previewSlide(i + 1)}</span>
                    <span className="truncate">{slide.footer}</span>
                  </span>
                  <span className="line-clamp-3 text-small text-ink">{slide.lines.join(' ')}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-line p-4">
        {ready ? (
          <div className="mb-1 min-w-0">
            <div className="truncate text-body font-[650] text-ink">{reference}</div>
            <div className="truncate text-small text-ink-2">{info?.name}</div>
          </div>
        ) : null}
        <Button variant="primary" size="lg" disabled={!ready || busy} onClick={() => void run('plan')}>
          <ListPlus aria-hidden />
          {cs.common.addToPlan}
        </Button>
        <Button variant="secondary" size="lg" disabled={!ready || busy} onClick={() => void run('project')}>
          <MonitorPlay aria-hidden />
          {cs.common.projectNow}
        </Button>
      </div>
    </aside>
  )
}
