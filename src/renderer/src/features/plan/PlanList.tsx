import { useState } from 'react'
import { CalendarPlus, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { useLive } from '@/store/live'
import { sortPlans, todayIso, usePlans } from '@/store/plans'
import { formatPlanDate } from './format'

function nextSundayIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PlanList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const plans = usePlans((s) => s.plans)
  const livePlanId = useLive((s) => s.planId)
  const { upcoming, past } = sortPlans(Object.values(plans))
  const templates = Object.values(plans)
    .filter((p) => p.isTemplate)
    .sort((a, b) => a.title.localeCompare(b.title, 'cs'))

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel" aria-label={cs.plan.plans}>
      <div className="flex items-center justify-between gap-2 border-b border-line p-3">
        <h1 className="px-1 text-screen font-[650] tracking-[-0.01em] text-ink">{cs.plan.title}</h1>
        <NewPlanButton onCreated={onSelect} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {upcoming.length + past.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-body text-ink">{cs.plan.noPlans}</p>
            <p className="mt-1 text-small text-ink-2">{cs.plan.noPlansHint}</p>
          </div>
        ) : null}
        <PlanGroup title={cs.plan.upcoming} plans={upcoming} selectedId={selectedId} liveId={livePlanId} onSelect={onSelect} />
        <PlanGroup title={cs.plan.past} plans={past} selectedId={selectedId} liveId={livePlanId} onSelect={onSelect} />
        <PlanGroup
          title={cs.plan.templates}
          plans={templates}
          selectedId={selectedId}
          liveId={livePlanId}
          onSelect={onSelect}
          template
        />
      </div>
    </aside>
  )
}

function PlanGroup({
  title,
  plans,
  selectedId,
  liveId,
  onSelect,
  template
}: {
  title: string
  plans: ReturnType<typeof sortPlans>['upcoming']
  selectedId: string | null
  liveId: string | null
  onSelect: (id: string) => void
  template?: boolean
}) {
  if (plans.length === 0) return null
  return (
    <section className="mb-3">
      <h2 className="px-2.5 pb-1 pt-2 text-meta font-[600] text-ink-3">{title}</h2>
      <ul>
        {plans.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-current={selectedId === p.id ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-raised',
                selectedId === p.id && 'bg-raised ring-1 ring-inset ring-line-strong'
              )}
            >
              {template ? (
                <LayoutTemplate className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
              ) : (
                <span className="w-[58px] shrink-0 text-small tabular font-[550] text-ink-2">{formatPlanDate(p.date)}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-[550] text-ink">{p.title || cs.plan.defaultTitle}</span>
                <span className="block text-meta text-ink-3">{cs.common.items(p.items.length)}</span>
              </span>
              {liveId === p.id ? (
                <span className="size-2 shrink-0 rounded-full bg-live" aria-label={cs.live.onAir} title={cs.live.onAir} />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NewPlanButton({ onCreated }: { onCreated: (id: string) => void }) {
  const plans = usePlans((s) => s.plans)
  const create = usePlans((s) => s.create)
  const fromTemplate = usePlans((s) => s.fromTemplate)
  const templates = Object.values(plans).filter((p) => p.isTemplate)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(nextSundayIso)
  const [title, setTitle] = useState<string>(cs.plan.defaultTitle)
  const [templateId, setTemplateId] = useState<string>('none')

  const submit = async (): Promise<void> => {
    const plan =
      templateId !== 'none'
        ? await fromTemplate(templateId, date || todayIso())
        : await create(date || todayIso(), title.trim() || cs.plan.defaultTitle)
    if (!plan) return
    if (templateId !== 'none' && title.trim()) await usePlans.getState().save({ ...plan, title: title.trim() })
    setOpen(false)
    onCreated(plan.id)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <CalendarPlus aria-hidden />
          {cs.plan.newPlan}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px]">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label={cs.plan.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label={cs.plan.planTitle}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {templates.length > 0 ? (
            <Field label={cs.plan.useTemplate}>
              <Select
                aria-label={cs.plan.useTemplate}
                value={templateId}
                onValueChange={setTemplateId}
                options={[
                  { value: 'none', label: cs.common.none },
                  ...templates.map((t) => ({ value: t.id, label: t.title }))
                ]}
              />
            </Field>
          ) : null}
          <Button type="submit" variant="primary">
            {cs.plan.newPlan}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
