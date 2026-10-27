import { app } from 'electron'
import { join } from 'node:path'

/**
 * All user data lives below one folder so it is easy to back up.
 * PROMITAC_USER_DATA overrides the location (tests, portable use).
 */
export function initUserDataPath(): void {
  const override = process.env.PROMITAC_USER_DATA
  if (override) app.setPath('userData', override)
}

export function dataDir(): string {
  return app.getPath('userData')
}

export const paths = {
  library: () => join(dataDir(), 'library'),
  songs: () => join(dataDir(), 'library', 'songs'),
  trash: () => join(dataDir(), 'library', 'trash'),
  tombstones: () => join(dataDir(), 'library', 'tombstones.json'),
  plans: () => join(dataDir(), 'library', 'plans'),
  themes: () => join(dataDir(), 'library', 'themes'),
  media: () => join(dataDir(), 'library', 'media'),
  mediaIndex: () => join(dataDir(), 'library', 'media.json'),
  bibles: () => join(dataDir(), 'bibles'),
  settings: () => join(dataDir(), 'settings.json'),
  sync: () => join(dataDir(), 'sync'),
  backups: () => join(dataDir(), 'backups')
}

/** Bundled read-only resources (Bibles). In dev they come straight from the repo. */
export function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(import.meta.dirname, '..', '..', 'resources')
}

/** The bundled main script lives in out/main, the renderer build in out/renderer. */
export function rendererDir(): string {
  return join(import.meta.dirname, '..', 'renderer')
}
