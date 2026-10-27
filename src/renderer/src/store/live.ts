import { create } from 'zustand'
import { initialLiveState, liveReducer, type LiveAction, type LiveState } from '@core/live/state'
import type { PlanItem } from '@core/plan/model'
import type { ThemeBackground } from '@core/theme/model'
import { cs } from '@/i18n/cs'
import { buildLiveItems, type LiveItem } from '@/live/items'
import { useBible } from './bible'
import { useLibrary } from './library'
import { useMedia } from './media'
import { todayIso, usePlans } from './plans'
import { useSettings } from './settings'

interface LiveStore {
  /** Plan used on the Live screen. */
  planId: string | null
  /** Plan item whose slides are shown in the grid (may differ from what is live). */
  selectedItemId: string | null
  live: LiveState
  pending: string | null
  alert: string | null
  timer: { endsAt: number; label: string } | null
  backgroundOverride: ThemeBackground | null
  identify: { label: string } | null
  setPlan(id: string | null): void
  select(itemId: string | null): void
  dispatch(action: LiveAction): void
  setPending(p: string | null): void
  showAlert(text: string | null): void
  startTimer(minutes: number, label: string): void
  stopTimer(): void
  setBackgroundOverride(bg: ThemeBackground | null): void
  setIdentify(v: { label: string } | null): void
}

/** Live items of the current live plan, computed from all stores. */
export function currentLiveItems(): LiveItem[] {
  const { planId } = useLive.getState()
  const plan = planId ? usePlans.getState().plans[planId] : null
  return buildLiveItems(plan, {
    songs: useLibrary.getState().songs,
    bibles: useBible.getState().data,
    media: useMedia.getState().items,
    settings: useSettings.getState().settings
  })
}

export const useLive = create<LiveStore>((set, get) => ({
  planId: null,
  selectedItemId: null,
  live: initialLiveState,
  pending: null,
  alert: null,
  timer: null,
  backgroundOverride: null,
  identify: null,
  setPlan: (planId) => set({ planId, selectedItemId: null }),
  select: (selectedItemId) => set({ selectedItemId }),
  dispatch: (input) => {
    const items = currentLiveItems()
    const before = get().live
    // Nothing on screen yet: "next" starts the item the operator has selected.
    const selected = get().selectedItemId
    const action: LiveAction =
      input.type === 'next' && !before.itemId && selected
        ? { type: 'goto', itemId: selected, slideIndex: 0 }
        : input
    const live = liveReducer(before, action, { items })
    if (live === before) return
    // Follow the live item in the grid when navigation moves to another item.
    const follow =
      live.itemId !== before.itemId && (get().selectedItemId === before.itemId || !get().selectedItemId)
    set({ live, ...(follow ? { selectedItemId: live.itemId } : {}) })
  },
  setPending: (pending) => set({ pending }),
  showAlert: (alert) => set({ alert: alert?.trim() ? alert.trim() : null }),
  startTimer: (minutes, label) => set({ timer: { endsAt: Date.now() + minutes * 60_000, label } }),
  stopTimer: () => set({ timer: null }),
  setBackgroundOverride: (backgroundOverride) => set({ backgroundOverride }),
  setIdentify: (identify) => set({ identify })
}))

type NewPlanItem = PlanItem extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never

/** The plan used for live projection; creates today's plan when there is none. */
export async function ensureLivePlan(): Promise<string> {
  const existing = useLive.getState().planId
  if (existing && usePlans.getState().plans[existing]) return existing
  const plan = await usePlans.getState().create(todayIso(), cs.plan.defaultTitle)
  useLive.getState().setPlan(plan.id)
  return plan.id
}

/** Append an item to the live plan (used by "Přidat do plánu" in Songs, Bible, Media). */
export async function addToLivePlan(item: NewPlanItem): Promise<PlanItem | null> {
  const planId = await ensureLivePlan()
  return usePlans.getState().addItem(planId, item)
}

/**
 * "Promítnout hned": insert the item right after what is live now and put its first slide on
 * screen, so the plan keeps a record of what was actually projected.
 */
export async function projectNow(item: NewPlanItem): Promise<void> {
  const planId = await ensureLivePlan()
  const plan = usePlans.getState().plans[planId]
  const liveIdx = plan ? plan.items.findIndex((i) => i.id === useLive.getState().live.itemId) : -1
  const added = await usePlans.getState().addItem(planId, item, liveIdx >= 0 ? liveIdx + 1 : undefined)
  if (!added) return
  useLive.getState().select(added.id)
  useLive.getState().dispatch({ type: 'goto', itemId: added.id, slideIndex: 0 })
}
