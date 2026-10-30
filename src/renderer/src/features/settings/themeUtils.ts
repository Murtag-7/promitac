import type { OutputFrame } from '@core/live/frame'
import type { MediaItem } from '@core/media/model'
import type { Theme, ThemeBackground } from '@core/theme/model'
import { mediaUrl } from '@/store/media'

/** A frame that shows `theme` with a sample song slide – used by the theme previews. */
export function themePreviewFrame(
  theme: Theme,
  opts: { lines: readonly string[]; footer: string; mediaItems: MediaItem[] }
): OutputFrame {
  const media: OutputFrame['media'] = {}
  const bg = theme.background
  if (bg.kind === 'image' || bg.kind === 'video') {
    const item = opts.mediaItems.find((m) => m.id === bg.mediaId)
    if (item) media[item.id] = { url: mediaUrl(item), kind: item.kind }
  }
  return {
    seq: 0,
    slide: { id: 'preview', kind: 'song', lines: [...opts.lines], footer: opts.footer },
    theme,
    overlay: 'none',
    alert: null,
    timer: null,
    media
  }
}

/** Theme copy without the slide transition – previews react instantly while dragging. */
export function withoutTransition(theme: Theme): Theme {
  return { ...theme, transition: { kind: 'none', durationMs: 0 } }
}

/** Accepts `#rgb`, `rgb`, `#rrggbb` or `rrggbb`; returns lowercase `#rrggbb` or null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s.replace(/./g, (c) => c + c)}`
  return null
}

/** True only for a complete 6-digit colour – used while the user is still typing. */
export function isFullHex(input: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(input.trim())
}

/** Mix a colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = normalizeHex(hex) ?? '#000000'
  const target = amount >= 0 ? 255 : 0
  const a = Math.min(1, Math.abs(amount))
  const parts = [1, 3, 5].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16)
    return Math.round(v + (target - v) * a)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${parts.join('')}`
}

/** The single colour that best represents a background (used when switching background type). */
export function baseColor(bg: ThemeBackground): string {
  if (bg.kind === 'color') return bg.color
  if (bg.kind === 'gradient') return bg.from
  return bg.fallbackColor
}

/** Switch the background type while keeping the colours the user already chose. */
export function switchBackground(
  bg: ThemeBackground,
  kind: ThemeBackground['kind'],
  mediaItems: MediaItem[]
): ThemeBackground {
  if (bg.kind === kind) return bg
  const color = baseColor(bg)
  if (kind === 'color') return { kind: 'color', color }
  if (kind === 'gradient') return { kind: 'gradient', from: color, to: shade(color, 0.14), angle: 160 }
  const first = mediaItems.find((m) => m.kind === kind)
  return { kind, mediaId: first?.id ?? '', fallbackColor: color }
}

/** `base`, or `base 2`, `base 3`… so that the name is not used by another theme yet. */
export function uniqueName(
  base: string,
  taken: string[],
  numbered: (n: string, i: number) => string
): string {
  const names = new Set(taken.map((n) => n.trim().toLocaleLowerCase('cs')))
  if (!names.has(base.toLocaleLowerCase('cs'))) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = numbered(base, i)
    if (!names.has(candidate.toLocaleLowerCase('cs'))) return candidate
  }
  return base
}

/** Built-in themes first (in their fixed order), then user themes alphabetically. */
export function orderThemes(themes: Theme[]): { builtIn: Theme[]; user: Theme[] } {
  const builtIn = themes.filter((t) => t.builtIn)
  const user = themes
    .filter((t) => !t.builtIn)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' }))
  return { builtIn, user }
}
