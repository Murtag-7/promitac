import { useEffect, useMemo, useRef } from 'react'
import { CalendarPlus, ListMusic } from 'lucide-react'
import { resolveKey } from '@core/live/keymap'
import { liveReducer } from '@core/live/state'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { buildLiveItems } from '@/live/items'
import { useBible } from '@/store/bible'
import { useLibrary } from '@/store/library'
import { useLive } from '@/store/live'
import { useMedia } from '@/store/media'
import { usePlans } from '@/store/plans'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { CueList } from './CueList'
import { LiveSidebar } from './LiveSidebar'
import { SlideGrid } from './SlideGrid'

/** Plan items with their slides for the live plan (reactive). */
export function useLiveItems() {
  const planId = useLive((s) => s.planId)
  const plan = usePlans((s) => (planId ? s.plans[planId] : undefined))
  const songs = useLibrary((s) => s.songs)
  const bibles = useBible((s) => s.data)
  const media = useMedia((s) => s.items)
  const settings = useSettings((s) => s.settings)
  const items = useMemo(
    () => buildLiveItems(plan, { songs, bibles, media, settings }),
    [plan, songs, bibles, media, settings]
  )
  // Bible translations load lazily the first time a plan needs them.
  useEffect(() => {
    for (const it of items) {
      if (it.problem === 'loading' && it.item.type === 'bible')
        void useBible.getState().ensure(it.item.translationId)
    }
  }, [items])
  return { plan, items }
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function LiveScreen() {
  const { plan, items } = useLiveItems()
  const live = useLive((s) => s.live)
  const selectedItemId = useLive((s) => s.selectedItemId)
  const select = useLive((s) => s.select)
  const dispatch = useLive((s) => s.dispatch)
  const setView = useUi((s) => s.setView)
  const openPlan = useUi((s) => s.openPlan)
  const pendingTimer = useRef<number | undefined>(undefined)

  // Keyboard & presentation clicker control. Keyboard actions are never animated in the UI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target) || e.repeat) return
      const { pending, setPending } = useLive.getState()
      const res = resolveKey({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, pending)
      if (!res.action && !res.pending && !pending) return
      e.preventDefault()
      window.clearTimeout(pendingTimer.current)
      setPending(res.pending)
      if (res.pending) {
        pendingTimer.current = window.setTimeout(() => {
          // "V" alone → next verse
          if (useLive.getState().pending === 'v') {
            useLive.getState().dispatch({ type: 'gotoSection', sectionType: 'verse' })
          }
          useLive.getState().setPending(null)
        }, 1200)
      }
      if (res.action) dispatch(res.action)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(pendingTimer.current)
    }
  }, [dispatch])

  const selected =
    items.find((i) => i.id === selectedItemId) ?? items.find((i) => i.id === live.itemId) ?? items[0]

  const nextState = useMemo(() => {
    if (!live.itemId)
      return selected ? { itemId: selected.id, slideIndex: 0, overlay: 'none' as const } : null
    const n = liveReducer(live, { type: 'next' }, { items })
    return n === live ? null : n
  }, [live, items, selected])

  if (!plan) {
    return (
      <EmptyState icon={ListMusic} title={cs.live.noPlan} text={cs.live.noPlanHint}>
        <Button variant="primary" onClick={() => setView('plan')}>
          <CalendarPlus aria-hidden />
          {cs.live.openPlan}
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(232px,272px)_minmax(0,1fr)_minmax(320px,400px)]">
      <CueList
        plan={plan}
        items={items}
        selectedId={selected?.id ?? null}
        liveItemId={live.itemId}
        onSelect={select}
        onGoLive={(id) => dispatch({ type: 'goto', itemId: id, slideIndex: 0 })}
        onEditPlan={() => openPlan(plan.id)}
      />
      <section className="min-h-0 border-x border-line" aria-label={cs.live.title}>
        {items.length === 0 ? (
          <EmptyState title={cs.live.emptyPlanTitle} text={cs.live.emptyPlanHint}>
            <Button variant="primary" onClick={() => openPlan(plan.id)}>
              {cs.live.editPlan}
            </Button>
          </EmptyState>
        ) : selected ? (
          <SlideGrid
            item={selected}
            live={live}
            nextState={nextState}
            onSlide={(i) => dispatch({ type: 'goto', itemId: selected.id, slideIndex: i })}
          />
        ) : (
          <EmptyState title={cs.live.selectItem} />
        )}
      </section>
      <LiveSidebar items={items} nextState={nextState} />
    </div>
  )
}
