import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

/** Write via a temp file + rename so a crash never leaves a half-written file. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    await writeFile(tmp, data)
    await rename(tmp, path)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n')
}

/** Read JSON; missing file → fallback. Corrupt file → renamed to *.corrupt-<time> and fallback. */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    await quarantine(path)
    return fallback
  }
}

/** Keep a broken file for manual recovery instead of overwriting it. */
export async function quarantine(path: string): Promise<string> {
  const target = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
  try {
    await rename(path, target)
  } catch {
    // ignore – the file may already be gone
  }
  return target
}
