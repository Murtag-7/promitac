export type PlanItem =
  | { id: string; type: 'song'; songId: string; arrangement?: string[] }
  | { id: string; type: 'bible'; reference: string; translationId: string }
  | { id: string; type: 'media'; mediaId: string }
  | { id: string; type: 'text'; title: string; body: string }
  | { id: string; type: 'blank' }

export type PlanItemType = PlanItem['type']

export interface ServicePlan {
  id: string
  title: string
  /** Service date as YYYY-MM-DD (local). */
  date: string
  isTemplate: boolean
  items: PlanItem[]
  updatedAt: string
}
