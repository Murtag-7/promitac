import { hostname } from 'node:os'
import { type AppSettings, withDefaults } from '@core/settings/model'
import { readJson, writeJsonAtomic } from './fsUtil'

export class SettingsRepo {
  private cache: AppSettings | null = null

  constructor(private readonly file: string) {}

  async get(): Promise<AppSettings> {
    if (!this.cache) {
      const stored = await readJson<Partial<AppSettings> | null>(this.file, null)
      this.cache = withDefaults(stored)
      if (!stored?.deviceName) this.cache.deviceName = defaultDeviceName()
      if (!stored) await writeJsonAtomic(this.file, this.cache)
    }
    return this.cache
  }

  /** Forget the cached copy (after a backup restore rewrote the file). */
  invalidate(): void {
    this.cache = null
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = withDefaults({ ...(await this.get()), ...patch })
    this.cache = next
    await writeJsonAtomic(this.file, next)
    return next
  }
}

function defaultDeviceName(): string {
  const host = hostname().replace(/\.local$/, '')
  return host || 'Počítač'
}
