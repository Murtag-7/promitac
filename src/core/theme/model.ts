/** Fonts bundled with the app (all with full Czech diacritics). */
export type FontId = 'inter' | 'source-sans-3' | 'montserrat' | 'lora' | 'source-serif-4'

export const FONTS: Record<FontId, { label: string; css: string }> = {
  inter: { label: 'Inter', css: "'Inter Variable', 'Inter', system-ui, sans-serif" },
  'source-sans-3': { label: 'Source Sans 3', css: "'Source Sans 3', system-ui, sans-serif" },
  montserrat: { label: 'Montserrat', css: "'Montserrat Variable', 'Montserrat', system-ui, sans-serif" },
  lora: { label: 'Lora', css: "'Lora Variable', 'Lora', Georgia, serif" },
  'source-serif-4': {
    label: 'Source Serif 4',
    css: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
  }
}

export type ThemeBackground =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'image' | 'video'; mediaId: string; fallbackColor: string }

export interface ThemeText {
  font: FontId
  weight: number
  color: string
  /** Font sizes in px relative to the virtual 1920×1080 canvas. */
  maxSize: number
  minSize: number
  autoFit: boolean
  lineHeight: number
  uppercase: boolean
  align: 'left' | 'center' | 'right'
  vAlign: 'top' | 'center' | 'bottom'
  /** Text shadow strength 0–1. */
  shadow: number
  /** Outline width in px (0 = none). */
  outline: number
  outlineColor: string
}

export interface Theme {
  id: string
  name: string
  builtIn?: boolean
  background: ThemeBackground
  /** Darkening overlay over image/video backgrounds, 0–0.9. */
  dim: number
  text: ThemeText
  /** Safe margin in % of the canvas width/height. */
  safeMargin: number
  /** Footer = Bible reference / song copyright line. */
  footer: { position: 'top' | 'bottom'; size: number; show: boolean }
  transition: { kind: 'fade' | 'none'; durationMs: number }
  updatedAt: string
}

/** Virtual projection canvas – everything is laid out at this size and scaled to the real output. */
export const CANVAS = { width: 1920, height: 1080 } as const
