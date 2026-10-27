import { safeStorage } from 'electron'
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '../storage/fsUtil'
import type { AuthStorage } from './supabaseRemote'

/**
 * Supabase session storage in a file, encrypted with the OS keychain (Keychain / DPAPI) when the
 * platform offers it. The session never reaches the renderer.
 */
export class FileAuthStorage implements AuthStorage {
  private cache: Record<string, string> | null = null

  constructor(private readonly file: string) {}

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache
    try {
      const raw = await readFile(this.file)
      const json =
        safeStorage.isEncryptionAvailable() && raw[0] !== 0x7b ? safeStorage.decryptString(raw) : raw.toString('utf8')
      this.cache = JSON.parse(json) as Record<string, string>
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  private async persist(): Promise<void> {
    const json = JSON.stringify(this.cache ?? {})
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : json
    await writeFileAtomic(this.file, data)
  }

  async getItem(key: string): Promise<string | null> {
    return (await this.load())[key] ?? null
  }

  async setItem(key: string, value: string): Promise<void> {
    ;(await this.load())[key] = value
    await this.persist()
  }

  async removeItem(key: string): Promise<void> {
    delete (await this.load())[key]
    await this.persist()
  }

  async clear(): Promise<void> {
    this.cache = {}
    await this.persist()
  }
}
