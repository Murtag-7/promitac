import { existsSync } from 'node:fs'
import { SAMPLE_SONGS } from '@core/samples/songs'
import { planFromTemplate, sundayTemplate } from '@core/plan/templates'
import type { ServicePlan } from '@core/plan/model'
import { newId } from '@core/util/id'
import type { CollectionRepo } from './collectionRepo'
import type { SongsRepo } from './songsRepo'

function upcomingSunday(now: Date): string {
  const d = new Date(now)
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A ready-to-project example so the first start is not an empty screen. */
export function samplePlan(now: string): ServicePlan {
  const plan = planFromTemplate(sundayTemplate(now), upcomingSunday(new Date(now)), now)
  // Fixed id: two computers that both seeded merge into one sample plan when they join a sbor.
  plan.id = '7a1d5e0c-0000-4000-8000-000000000002'
  plan.title = 'Ukázková bohoslužba'
  plan.items = [
    { id: newId(), type: 'text', title: 'Vítejte', body: 'Vítejte na bohoslužbě' },
    { id: newId(), type: 'song', songId: SAMPLE_SONGS[0]?.id ?? '' },
    { id: newId(), type: 'bible', reference: 'Žalmy 23', translationId: 'cs-bkr' },
    { id: newId(), type: 'song', songId: SAMPLE_SONGS[2]?.id ?? '' },
    { id: newId(), type: 'song', songId: SAMPLE_SONGS[1]?.id ?? '' },
    { id: newId(), type: 'blank' }
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
  for (const s of SAMPLE_SONGS) await songs.save({ id: s.id, content: s.content, updatedAt: now })
  await plans.save(sundayTemplate(now))
  await plans.save(samplePlan(now))
  return true
}
