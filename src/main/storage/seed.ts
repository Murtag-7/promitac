import { existsSync } from 'node:fs'
import { SAMPLE_SONGS } from '@core/samples/songs'
import { planFromTemplate, sundayTemplate } from '@core/plan/templates'
import type { ServicePlan } from '@core/plan/model'
import { SEED_UPDATED_AT } from '@core/sync/model'
import type { CollectionRepo } from './collectionRepo'
import type { SongsRepo } from './songsRepo'

function upcomingSunday(now: Date): string {
  const d = new Date(now)
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * A ready-to-project example so the first start is not an empty screen. Dated for the coming
 * Sunday, but stamped with SEED_UPDATED_AT: until someone edits it, the sbor's version wins.
 */
export function samplePlan(now: string): ServicePlan {
  const plan = planFromTemplate(
    sundayTemplate(SEED_UPDATED_AT),
    upcomingSunday(new Date(now)),
    SEED_UPDATED_AT
  )
  // Fixed id: two computers that both seeded merge into one sample plan when they join a sbor.
  plan.id = '7a1d5e0c-0000-4000-8000-000000000002'
  plan.title = 'Ukázková bohoslužba'
  const item = (n: number): string => `7a1d5e0c-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`
  plan.items = [
    { id: item(1), type: 'text', title: 'Vítejte', body: 'Vítejte na bohoslužbě' },
    { id: item(2), type: 'song', songId: SAMPLE_SONGS[0]?.id ?? '' },
    { id: item(3), type: 'bible', reference: 'Žalmy 23', translationId: 'cs-bkr' },
    { id: item(4), type: 'song', songId: SAMPLE_SONGS[2]?.id ?? '' },
    { id: item(5), type: 'song', songId: SAMPLE_SONGS[1]?.id ?? '' },
    { id: item(6), type: 'blank' }
  ]
  return plan
}

/** First start: a few sample songs, the "Neděle" template and a sample plan. */
export async function seedIfFirstRun(
  libraryDir: string,
  songs: SongsRepo,
  plans: CollectionRepo<ServicePlan>,
  now: string
): Promise<boolean> {
  if (existsSync(libraryDir)) return false
  for (const s of SAMPLE_SONGS) await songs.save({ id: s.id, content: s.content, updatedAt: SEED_UPDATED_AT })
  await plans.save(sundayTemplate(SEED_UPDATED_AT))
  await plans.save(samplePlan(now))
  return true
}
