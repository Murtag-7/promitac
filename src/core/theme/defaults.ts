import type { Theme } from './model'

const EPOCH = '2026-01-01T00:00:00.000Z'

const baseText: Theme['text'] = {
  font: 'inter',
  weight: 600,
  color: '#ffffff',
  maxSize: 96,
  minSize: 44,
  autoFit: true,
  lineHeight: 1.25,
  uppercase: false,
  align: 'center',
  vAlign: 'center',
  shadow: 0.6,
  outline: 0,
  outlineColor: '#000000'
}

export const DEFAULT_THEME_ID = 'classic-dark'

/** Built-in themes. The default must stay readable from the back row. */
export const BUILT_IN_THEMES: Theme[] = [
  {
    id: 'classic-dark',
    name: 'Klasický tmavý',
    builtIn: true,
    background: { kind: 'color', color: '#0b0c0e' },
    dim: 0,
    text: { ...baseText },
    safeMargin: 6,
    footer: { position: 'bottom', size: 30, show: true },
    transition: { kind: 'fade', durationMs: 280 },
    updatedAt: EPOCH
  },
  {
    id: 'warm-light',
    name: 'Teplý světlý',
    builtIn: true,
    background: { kind: 'color', color: '#f4efe6' },
    dim: 0,
    text: { ...baseText, color: '#1d1b18', shadow: 0, font: 'source-serif-4', weight: 560 },
    safeMargin: 7,
    footer: { position: 'bottom', size: 30, show: true },
    transition: { kind: 'fade', durationMs: 280 },
    updatedAt: EPOCH
  },
  {
    id: 'night-blue',
    name: 'Noční modrá',
    builtIn: true,
    background: { kind: 'gradient', from: '#0f1b2d', to: '#1d2f4a', angle: 160 },
    dim: 0,
    text: { ...baseText, font: 'source-sans-3', weight: 600 },
    safeMargin: 6,
    footer: { position: 'bottom', size: 30, show: true },
    transition: { kind: 'fade', durationMs: 320 },
    updatedAt: EPOCH
  },
  {
    id: 'stage-contrast',
    name: 'Vysoký kontrast',
    builtIn: true,
    background: { kind: 'color', color: '#000000' },
    dim: 0,
    text: { ...baseText, color: '#fff7d6', weight: 700, maxSize: 110, minSize: 52, outline: 2, shadow: 0.4 },
    safeMargin: 5,
    footer: { position: 'top', size: 32, show: true },
    transition: { kind: 'none', durationMs: 0 },
    updatedAt: EPOCH
  }
]

export function findTheme(themes: Theme[], id: string | undefined): Theme {
  return (
    themes.find((t) => t.id === id) ??
    themes.find((t) => t.id === DEFAULT_THEME_ID) ??
    (BUILT_IN_THEMES[0] as Theme)
  )
}

export function isTheme(v: unknown): v is Theme {
  const t = v as Theme
  return (
    typeof t === 'object' &&
    t !== null &&
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    typeof t.text === 'object' &&
    t.text !== null &&
    typeof t.background === 'object' &&
    t.background !== null
  )
}
