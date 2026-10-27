import { DEFAULT_THEME_ID } from '../theme/defaults'

export interface OutputConfig {
  id: string
  name: string
  /** Electron display id, or 'auto' = first display that is not the primary one. */
  displayId: number | 'auto'
  enabled: boolean
  /** Show in a normal window instead of fullscreen (testing with one monitor). */
  windowed: boolean
  /** Optional per-output theme override (P2). */
  themeId?: string
}

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export interface AppSettings {
  linesPerSlide: number
  defaultThemeId: string
  outputs: OutputConfig[]
  logoMediaId?: string
  uiTheme: 'dark' | 'light'
  deviceName: string
  bibleTranslationId: string
  bibleMaxChars: number
  bibleVerseNumbers: boolean
  supabase?: SupabaseConfig
  /** Optional AI key for the import assistant (P2, disabled by default). */
  aiApiKey?: string
  aiProvider?: 'gemini'
}

export const DEFAULT_SETTINGS: AppSettings = {
  linesPerSlide: 4,
  defaultThemeId: DEFAULT_THEME_ID,
  outputs: [{ id: 'main', name: 'Plátno', displayId: 'auto', enabled: true, windowed: false }],
  uiTheme: 'dark',
  deviceName: 'Počítač',
  bibleTranslationId: 'cs-bkr',
  bibleMaxChars: 260,
  bibleVerseNumbers: true
}

export function withDefaults(partial: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(partial ?? {}) }
  if (!Array.isArray(merged.outputs) || merged.outputs.length === 0) merged.outputs = DEFAULT_SETTINGS.outputs
  if (!Number.isFinite(merged.linesPerSlide) || merged.linesPerSlide < 1) merged.linesPerSlide = 4
  return merged
}
