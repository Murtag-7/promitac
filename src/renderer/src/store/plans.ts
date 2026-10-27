import { create } from 'zustand'
import type { PlanItem, ServicePlan } from '@core/plan/model'
import { createPlan, duplicatePlan, planFromTemplate, saveAsTemplate } from '@core/plan/templates'
import { newId, nowIso } from '@core/util/id'
import { api } from '@/api/client'

interface PlansState {
  loaded: boolean
  plans: Record<string, ServicePlan>
  load(): Promise<void>
  save(plan: ServicePlan): Promise<ServicePlan>
  remove(id: string): Promise<void>
  create(date: string, title: string): Promise<ServicePlan>
  fromTemplate(templateId: string, date: string): Promise<ServicePlan | null>
  duplicate(id: string, date: string): Promise<ServicePlan | null>
  saveAsTemplate(id: string, title: string): Promise<ServicePlan | null>
  addItem(planId: string, item: DistributiveOmit<PlanItem, 'id'>, index?: number): Promise<PlanItem | null>
  updateItem(planId: string, item: PlanItem): Promise<void>
  removeItem(planId: string, itemId: string): Promise<void>
  setItems(planId: string, items: PlanItem[]): Promise<void>
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Plans (not templates) sorted: upcoming first (soonest first), then past (latest first). */
export function sortPlans(plans: ServicePlan[]): { upcoming: ServicePlan[]; past: ServicePlan[] } {
  const today = todayIso()
  const real = plans.filter((p) => !p.isTemplate)
  return {
    upcoming: real.filter((p) => p.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    past: real.filter((p) => p.date < today).sort((a, b) => b.date.localeCompare(a.date))
  }
}

export const usePlans = create<PlansState>((set, get) => {
  const put = async (plan: ServicePlan): Promise<ServicePlan> => {
    const saved = { ...plan, updatedAt: nowIso() }
    set({ plans: { ...get().plans, [saved.id]: saved } })
    await api().plans.save(saved)
    return saved
  }
  return {
    loaded: false,
    plans: {},
    load: async () => {
      const list = await api().plans.list()
      set({ plans: Object.fromEntries(list.map((p) => [p.id, p])), loaded: true })
    },
    save: put,
    remove: async (id) => {
      const plans = { ...get().plans }
      delete plans[id]
      set({ plans })
      await api().plans.remove(id)
    },
    create: (date, title) => put(createPlan(date, title, nowIso())),
    fromTemplate: async (templateId, date) => {
      const tpl = get().plans[templateId]
      return tpl ? put(planFromTemplate(tpl, date, nowIso())) : null
    },
    duplicate: async (id, date) => {
      const p = get().plans[id]
      return p ? put(duplicatePlan(p, date, nowIso())) : null
    },
    saveAsTemplate: async (id, title) => {
      const p = get().plans[id]
      return p ? put(saveAsTemplate(p, title, nowIso())) : null
    },
    addItem: async (planId, item, index) => {
      const p = get().plans[planId]
      if (!p) return null
      const full = { ...item, id: newId() } as PlanItem
      const items = [...p.items]
      items.splice(index ?? items.length, 0, full)
      await put({ ...p, items })
      return full
    },
    updateItem: async (planId, item) => {
      const p = get().plans[planId]
      if (p) await put({ ...p, items: p.items.map((i) => (i.id === item.id ? item : i)) })
    },
    removeItem: async (planId, itemId) => {
      const p = get().plans[planId]
      if (p) await put({ ...p, items: p.items.filter((i) => i.id !== itemId) })
    },
    setItems: async (planId, items) => {
      const p = get().plans[planId]
      if (p) await put({ ...p, items })
    }
  }
})
