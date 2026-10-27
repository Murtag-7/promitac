import type { ServicePlan } from '@core/plan/model'
import { isServicePlan } from '@core/plan/templates'
import { isTheme } from '@core/theme/defaults'
import type { Theme } from '@core/theme/model'
import { paths } from './paths'
import { CollectionRepo } from './storage/collectionRepo'
import { SettingsRepo } from './storage/settingsRepo'
import { SongsRepo } from './storage/songsRepo'
import { TombstoneStore } from './storage/tombstones'

/** All main-process services, created once after app ready. */
export interface AppContext {
  tombstones: TombstoneStore
  songs: SongsRepo
  plans: CollectionRepo<ServicePlan>
  themes: CollectionRepo<Theme>
  settings: SettingsRepo
}

export function createContext(): AppContext {
  const tombstones = new TombstoneStore(paths.tombstones())
  return {
    tombstones,
    songs: new SongsRepo(paths.songs(), paths.trash(), tombstones),
    plans: new CollectionRepo<ServicePlan>(paths.plans(), 'plans', tombstones, isServicePlan),
    themes: new CollectionRepo<Theme>(paths.themes(), 'themes', tombstones, isTheme),
    settings: new SettingsRepo(paths.settings())
  }
}
