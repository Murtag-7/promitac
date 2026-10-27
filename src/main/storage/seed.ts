import { existsSync } from 'node:fs'
import { SAMPLE_SONGS } from '@core/samples/songs'
import { sundayTemplate } from '@core/plan/templates'
import type { CollectionRepo } from './collectionRepo'
import type { SongsRepo } from './songsRepo'
import type { ServicePlan } from '@core/plan/model'

/** First start: a few sample songs and the "Neděle" plan template, so the app is not empty. */
export async function seedIfFirstRun(
  libraryDir: string,
  songs: SongsRepo,
  plans: CollectionRepo<ServicePlan>,
  now: string
): Promise<boolean> {
  if (existsSync(libraryDir)) return false
  for (const s of SAMPLE_SONGS) await songs.save({ id: s.id, content: s.content, updatedAt: now })
  await plans.save(sundayTemplate(now))
  return true
}
