import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Launch the built app with an isolated, temporary data folder. */
export async function launchApp(
  env: Record<string, string> = {},
  prepare?: (dataDir: string) => void
): Promise<{ app: ElectronApplication; dataDir: string }> {
  const dataDir = mkdtempSync(join(tmpdir(), 'promitac-e2e-'))
  prepare?.(dataDir)
  const childEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'NODE_OPTIONS') childEnv[k] = v
  }
  const app = await electron.launch({
    args: [resolve('out/main/index.js'), '--no-sandbox'],
    env: { ...childEnv, PROMITAC_USER_DATA: dataDir, ...env }
  })
  return { app, dataDir }
}
