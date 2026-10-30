import { duplicatePlan, isServicePlan, moveItem, planFromTemplate, sundayTemplate } from './templates'

const T = '2026-10-27T10:00:00.000Z'

describe('plan templates', () => {
  it('creates a plan from a template with fresh ids', () => {
    const tpl = sundayTemplate(T)
    const plan = planFromTemplate(tpl, '2026-11-01', T)
    expect(plan.isTemplate).toBe(false)
    expect(plan.date).toBe('2026-11-01')
    expect(plan.id).not.toBe(tpl.id)
    expect(plan.items.map((i) => i.type)).toEqual(tpl.items.map((i) => i.type))
    plan.items.forEach((it, i) => expect(it.id).not.toBe(tpl.items[i]?.id))
  })

  it('duplicates a plan with new ids for the plan and every item', () => {
    const plan = planFromTemplate(sundayTemplate(T), '2026-11-01', T)
    const copy = duplicatePlan(plan, '2026-11-08', T)
    expect(copy.id).not.toBe(plan.id)
    expect(copy.date).toBe('2026-11-08')
    expect(new Set([...plan.items, ...copy.items].map((i) => i.id)).size).toBe(plan.items.length * 2)
  })

  it('moves items', () => {
    const plan = planFromTemplate(sundayTemplate(T), '2026-11-01', T)
    const moved = moveItem(plan, 0, 2)
    expect(moved.items.map((i) => i.id)).toEqual([plan.items[1]?.id, plan.items[2]?.id, plan.items[0]?.id])
    expect(moveItem(plan, 5, 0)).toBe(plan)
  })

  it('validates stored plans', () => {
    expect(isServicePlan(sundayTemplate(T))).toBe(true)
    expect(isServicePlan({ id: 'x' })).toBe(false)
    expect(isServicePlan(null)).toBe(false)
  })
})
