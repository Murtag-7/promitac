import { BookOpen, FileText, Image as ImageIcon, Music4, Pencil, Square, TriangleAlert } from 'lucide-react'
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
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                onDoubleClick={() => onGoLive(it.id)}
                aria-current={isSelected ? 'true' : undefined}
                data-live={isLive || undefined}
                className={cn(
                  'group flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-raised',
                  isSelected && 'bg-raised ring-1 ring-inset ring-line-strong'
                )}
              >
                <span className="w-4 shrink-0 text-right text-meta tabular text-ink-3">{idx + 1}</span>
                <Icon
                  className={cn('size-4 shrink-0', isLive ? 'text-live' : 'text-ink-3')}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn('block truncate text-body font-[550]', isLive ? 'text-ink' : 'text-ink')}
                  >
                    {it.title}
                  </span>
                  {it.problem ? (
                    <span className="flex items-center gap-1 text-meta text-warn">
                      <TriangleAlert className="size-3" aria-hidden />
                      {cs.live.itemProblem[it.problem]}
                    </span>
                  ) : it.subtitle ? (
                    <span className="block truncate text-meta text-ink-3">{it.subtitle}</span>
                  ) : null}
                </span>
                {isLive ? (
                  <span className="flex shrink-0 items-center gap-1 text-meta font-[650] text-live">
                    <span className="size-1.5 rounded-full bg-live" aria-hidden />
                    {cs.live.onAir}
                  </span>
                ) : null}
              </button>
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
