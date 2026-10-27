import { newId } from '../util/id'
import type { PlanItem, ServicePlan } from './model'

export const SUNDAY_TEMPLATE_ID = '7a1d5e0c-0000-4000-8000-000000000001'

export function sundayTemplate(updatedAt: string): ServicePlan {
  return {
    id: SUNDAY_TEMPLATE_ID,
    title: 'Neděle',
    date: '',
    isTemplate: true,
    updatedAt,
    items: [
      { id: newId(), type: 'text', title: 'Vítejte', body: 'Vítejte na bohoslužbě' },
      { id: newId(), type: 'blank' },
      { id: newId(), type: 'text', title: 'Oznámení', body: '' }
    ]
  }
}

/** Fresh ids for every item so copies never share identity with the original. */
function cloneItems(items: PlanItem[]): PlanItem[] {
  return items.map((it) => ({ ...it, id: newId() }) as PlanItem)
}

export function createPlan(date: string, title: string, updatedAt: string): ServicePlan {
  return { id: newId(), title, date, isTemplate: false, items: [], updatedAt }
}

export function planFromTemplate(template: ServicePlan, date: string, updatedAt: string): ServicePlan {
  return {
    id: newId(),
    title: template.title,
    date,
    isTemplate: false,
    items: cloneItems(template.items),
    updatedAt
  }
}

export function duplicatePlan(plan: ServicePlan, date: string, updatedAt: string): ServicePlan {
  return { ...plan, id: newId(), date, isTemplate: false, items: cloneItems(plan.items), updatedAt }
}

export function saveAsTemplate(plan: ServicePlan, title: string, updatedAt: string): ServicePlan {
  return { ...plan, id: newId(), title, date: '', isTemplate: true, items: cloneItems(plan.items), updatedAt }
}

export function moveItem(plan: ServicePlan, from: number, to: number): ServicePlan {
  if (from === to || from < 0 || from >= plan.items.length) return plan
  const items = [...plan.items]
  const [moved] = items.splice(from, 1)
  if (!moved) return plan
  items.splice(Math.max(0, Math.min(to, items.length)), 0, moved)
  return { ...plan, items }
}

export function isServicePlan(v: unknown): v is ServicePlan {
  const p = v as ServicePlan
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.id === 'string' &&
    typeof p.title === 'string' &&
    typeof p.date === 'string' &&
    Array.isArray(p.items)
  )
}
