import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Copy, LayoutTemplate, ListMusic, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import { SlideTile } from '@/components/common/SlideTile'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { cs } from '@/i18n/cs'
import { buildLiveItems } from '@/live/items'
import { useBible } from '@/store/bible'
import { useLibrary } from '@/store/library'
import { useLive } from '@/store/live'
import { mediaUrl, useMedia } from '@/store/media'
import { sortPlans, todayIso, usePlans } from '@/store/plans'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { AddItemBar } from './AddItemBar'
import { formatPlanDateLong } from './format'
import { PlanItems } from './PlanItems'
import { PlanList } from './PlanList'

export function PlanScreen() {
  const selectedPlanId = useUi((s) => s.selectedPlanId)
  const openPlan = useUi((s) => s.openPlan)
  const plans = usePlans((s) => s.plans)
  const livePlanId = useLive((s) => s.planId)

  // Default to the live plan, then the next upcoming one.
  useEffect(() => {
    if (selectedPlanId && plans[selectedPlanId]) return
    const { upcoming, past } = sortPlans(Object.values(plans))
    const fallback =
      (livePlanId && plans[livePlanId] ? livePlanId : null) ?? upcoming[0]?.id ?? past[0]?.id ?? null
    if (fallback !== selectedPlanId) openPlan(fallback)
  }, [selectedPlanId, plans, livePlanId, openPlan])

  const plan = selectedPlanId ? plans[selectedPlanId] : undefined
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
      <PlanList selectedId={selectedPlanId} onSelect={openPlan} />
      {plan ? (
        <PlanEditor key={plan.id} planId={plan.id} />
      ) : (
        <EmptyState icon={ListMusic} title={cs.plan.noPlans} text={cs.plan.noPlansHint} />
      )}
    </div>
  )
}

function PlanEditor({ planId }: { planId: string }) {
  const plan = usePlans((s) => s.plans[planId])
  const save = usePlans((s) => s.save)
  const addItem = usePlans((s) => s.addItem)
  const updateItem = usePlans((s) => s.updateItem)
  const removeItem = usePlans((s) => s.removeItem)
  const setItems = usePlans((s) => s.setItems)
  const songs = useLibrary((s) => s.songs)
  const bibles = useBible((s) => s.data)
  const bibleFailed = useBible((s) => s.failed)
  const media = useMedia((s) => s.items)
  const settings = useSettings((s) => s.settings)
  const setLivePlan = useLive((s) => s.setPlan)
  const setView = useUi((s) => s.setView)
  const openPlan = useUi((s) => s.openPlan)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'duplicate' | 'template' | 'delete' | null>(null)

  const liveItems = useMemo(
    () => buildLiveItems(plan, { songs, bibles, bibleFailed, media, settings }),
    [plan, songs, bibles, bibleFailed, media, settings]
  )
  useEffect(() => {
    for (const it of liveItems) {
      if (it.problem === 'loading' && it.item.type === 'bible')
        void useBible.getState().ensure(it.item.translationId)
    }
  }, [liveItems])

  if (!plan) return null
  const selected = liveItems.find((i) => i.id === selectedItemId)

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <section className="flex min-h-0 flex-col" aria-label={plan.title}>
        <header className="flex flex-wrap items-end gap-3 border-b border-line px-6 py-4">
          <div className="flex min-w-[260px] flex-1 flex-col gap-1">
            <input
              value={plan.title}
              onChange={(e) => void save({ ...plan, title: e.target.value })}
              aria-label={cs.plan.planTitle}
              className="-mx-1.5 rounded-control bg-transparent px-1.5 py-0.5 text-screen font-[650] tracking-[-0.01em] text-ink hover:bg-raised focus-visible:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light"
            />
            {plan.isTemplate ? (
              <span className="text-small text-ink-2">{cs.plan.templates}</span>
            ) : (
              <label className="flex items-center gap-2 text-small text-ink-2">
                <span className="sr-only">{cs.plan.date}</span>
                <input
                  type="date"
                  value={plan.date}
                  onChange={(e) => e.target.value && void save({ ...plan, date: e.target.value })}
                  className="rounded-control bg-transparent px-1 py-0.5 text-small text-ink-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light"
                />
                <span className="text-ink-3">{formatPlanDateLong(plan.date)}</span>
              </label>
            )}
          </div>
          {!plan.isTemplate ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setLivePlan(plan.id)
                setView('live')
              }}
            >
              <Play aria-hidden />
              {cs.plan.projectPlan}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={async () => {
                const created = await usePlans.getState().fromTemplate(plan.id, todayIso())
                if (created) openPlan(created.id)
              }}
            >
              <CalendarPlus aria-hidden />
              {cs.plan.newFromTemplate}
            </Button>
          )}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={cs.common.more}>
                <MoreHorizontal aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => setDialog('duplicate')}>
                <Copy aria-hidden />
                {cs.plan.duplicateTo}
              </MenuItem>
              {!plan.isTemplate ? (
                <MenuItem onSelect={() => setDialog('template')}>
                  <LayoutTemplate aria-hidden />
                  {cs.plan.saveAsTemplate}
                </MenuItem>
              ) : null}
              <MenuSeparator />
              <MenuItem danger onSelect={() => setDialog('delete')}>
                <Trash2 aria-hidden />
                {cs.plan.deletePlan}
              </MenuItem>
            </MenuContent>
          </Menu>
        </header>

        <div className="border-b border-line px-6 py-3">
          <AddItemBar
            onAdd={async (item) => {
              const added = await addItem(plan.id, item)
              if (added) setSelectedItemId(added.id)
            }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {plan.items.length === 0 ? (
            <EmptyState title={cs.plan.emptyTitle} text={cs.plan.emptyHint} className="h-auto py-16" />
          ) : (
            <PlanItems
              items={plan.items}
              liveItems={liveItems}
              selectedId={selectedItemId}
              onSelect={(id) => setSelectedItemId(id === selectedItemId ? null : id)}
              onReorder={(items) => void setItems(plan.id, items)}
              onUpdate={(item) => void updateItem(plan.id, item)}
              onRemove={(id) => void removeItem(plan.id, id)}
            />
          )}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border-l border-line bg-panel" aria-label={cs.songs.previewTab}>
        <div className="border-b border-line px-4 py-3">
          <h2 className="truncate text-title font-[650] text-ink">
            {selected?.title ?? cs.songs.previewTab}
          </h2>
          {selected ? (
            <p className="text-meta text-ink-3">{cs.common.slides(selected.slides.length)}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selected ? (
            <div className="grid grid-cols-2 gap-2">
              {selected.slides.map((s, i) => {
                const prev = selected.slides[i - 1]
                const m = s.mediaId ? media.find((x) => x.id === s.mediaId) : undefined
                return (
                  <SlideTile
                    key={`${s.id}-${i}`}
                    slide={s}
                    index={i}
                    state="idle"
                    showSection={!prev || prev.id.split('.')[0] !== s.id.split('.')[0]}
                    mediaUrl={m && m.kind === 'image' ? mediaUrl(m) : undefined}
                  />
                )
              })}
            </div>
          ) : (
            <p className="text-small text-ink-2">{cs.live.selectItem}</p>
          )}
        </div>
      </aside>

      <DuplicateDialog
        open={dialog === 'duplicate'}
        onOpenChange={(o) => setDialog(o ? 'duplicate' : null)}
        onConfirm={async (date) => {
          const copy = await usePlans.getState().duplicate(plan.id, date)
          setDialog(null)
          if (copy) openPlan(copy.id)
        }}
      />
      <TemplateDialog
        open={dialog === 'template'}
        initial={plan.title}
        onOpenChange={(o) => setDialog(o ? 'template' : null)}
        onConfirm={async (title) => {
          await usePlans.getState().saveAsTemplate(plan.id, title)
          setDialog(null)
          toast(cs.plan.saveAsTemplate)
        }}
      />
      <Dialog open={dialog === 'delete'} onOpenChange={(o) => setDialog(o ? 'delete' : null)}>
        <DialogContent title={cs.plan.deletePlan} description={cs.plan.deletePlanText(plan.title)}>
          <DialogFooter>
            <DialogClose asChild>
              <Button>{cs.common.cancel}</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={async () => {
                setDialog(null)
                if (useLive.getState().planId === plan.id) setLivePlan(null)
                await usePlans.getState().remove(plan.id)
                openPlan(null)
              }}
            >
              <Trash2 aria-hidden />
              {cs.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DuplicateDialog({
  open,
  onOpenChange,
  onConfirm
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: (date: string) => void
}) {
  const [date, setDate] = useState(todayIso)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={cs.plan.duplicateTo}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (date) onConfirm(date)
          }}
        >
          <Field label={cs.plan.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button>{cs.common.cancel}</Button>
            </DialogClose>
            <Button type="submit" variant="primary">
              {cs.common.duplicate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TemplateDialog({
  open,
  initial,
  onOpenChange,
  onConfirm
}: {
  open: boolean
  initial: string
  onOpenChange: (o: boolean) => void
  onConfirm: (title: string) => void
}) {
  const [title, setTitle] = useState(initial)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={cs.plan.saveAsTemplate}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) onConfirm(title.trim())
          }}
        >
          <Field label={cs.plan.templateTitle}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button>{cs.common.cancel}</Button>
            </DialogClose>
            <Button type="submit" variant="primary">
              {cs.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
