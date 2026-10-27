import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  Music4,
  Pencil,
  Play,
  Square,
  TriangleAlert
} from 'lucide-react'
import type { PlanItem, ServicePlan } from '@core/plan/model'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import type { LiveItem } from '@/live/items'
import { useLive } from '@/store/live'
import { sortPlans, usePlans } from '@/store/plans'
import { formatPlanDate } from '@/features/plan/format'

export const ITEM_ICON: Record<PlanItem['type'], typeof Music4> = {
  song: Music4,
  bible: BookOpen,
  media: ImageIcon,
  text: FileText,
  blank: Square
}

export function CueList({
  plan,
  items,
  selectedId,
  liveItemId,
  onSelect,
  onGoLive,
  onEditPlan
}: {
  plan: ServicePlan
  items: LiveItem[]
  selectedId: string | null
  liveItemId: string | null
  onSelect: (id: string) => void
  onGoLive: (id: string) => void
  onEditPlan: () => void
}) {
  const plans = usePlans((s) => s.plans)
  const setPlan = useLive((s) => s.setPlan)
  const hidden = useLive((s) => s.live.overlay !== 'none' || s.timer !== null)
  const { upcoming, past } = sortPlans(Object.values(plans))
  const options = [...upcoming, ...past].map((p) => ({
    value: p.id,
    label: `${formatPlanDate(p.date)} · ${p.title || cs.plan.defaultTitle}`
  }))

  return (
    <aside className="flex min-h-0 flex-col bg-panel" aria-label={cs.plan.title}>
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <Select
          aria-label={cs.live.planPicker}
          value={plan.id}
          onValueChange={setPlan}
          options={options}
          className="h-10 font-[550]"
        />
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto p-2" aria-label={plan.title}>
        {items.map((it, idx) => {
          const Icon = ITEM_ICON[it.item.type]
          const isLive = it.id === liveItemId
          const isSelected = it.id === selectedId
          return (
            <li key={it.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                onDoubleClick={() => onGoLive(it.id)}
                aria-current={isSelected ? 'true' : undefined}
                data-live={isLive || undefined}
                title={cs.live.goLiveHint}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-raised',
                  isSelected && 'bg-raised ring-1 ring-inset ring-line-strong'
                )}
              >
                <span className="w-4 shrink-0 text-right text-meta tabular text-ink-2">{idx + 1}</span>
                <Icon
                  className={cn('size-4 shrink-0', isLive ? 'text-live' : 'text-ink-2')}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-[550] text-ink">{it.title}</span>
                  {it.problem ? (
                    <span className="flex items-center gap-1 text-meta text-warn">
                      <TriangleAlert className="size-3" aria-hidden />
                      {cs.live.itemProblem[it.problem]}
                    </span>
                  ) : it.subtitle ? (
                    <span className="block truncate text-meta text-ink-2">{it.subtitle}</span>
                  ) : null}
                </span>
                {isLive ? (
                  <span className="flex shrink-0 items-center gap-1 text-meta font-[650] text-live">
                    <span
                      className={cn('size-1.5 rounded-full', hidden ? 'ring-1 ring-live' : 'bg-live')}
                      aria-hidden
                    />
                    {hidden ? cs.live.hiddenShort : cs.live.onAir}
                  </span>
                ) : (
                  <span className="w-7 shrink-0" aria-hidden />
                )}
              </button>
              {!isLive && it.slides.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onGoLive(it.id)}
                  aria-label={`${cs.live.goLiveItem}: ${it.title}`}
                  title={cs.live.goLiveItem}
                  className={cn(
                    'press absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-control text-ink-2 opacity-0 hover:bg-raised-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100',
                    isSelected && 'opacity-100'
                  )}
                >
                  <Play className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="border-t border-line p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onEditPlan}>
          <Pencil aria-hidden />
          {cs.live.editPlan}
        </Button>
      </div>
    </aside>
  )
}
