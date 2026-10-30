export interface FitInput {
  /** Width of every line when rendered at font-size 1px (from canvas measureText). */
  lineWidthsAt1px: number[]
  lineHeight: number
  availWidth: number
  availHeight: number
  min: number
  max: number
  /** Running text (Bible): wrapping is natural, pick the largest size at which wrapped text fits. */
  paragraph?: boolean
}

/** Safety factor for word-wrapping estimates (words do not break exactly at the edge). */
const WRAP_SLACK = 0.92

function wrappedLines(widths: number[], size: number, availWidth: number): number {
  return widths.reduce((n, w) => n + Math.max(1, Math.ceil((w * size) / (availWidth * WRAP_SLACK))), 0)
}

/**
 * Largest font size at which the text fits the safe area. Prefers one line per source line;
 * wraps only below the theme minimum, and shrinks further rather than ever clipping text.
 */
export function fitFontSize(input: FitInput): { size: number; wrap: boolean } {
  const { lineWidthsAt1px: widths, lineHeight, availWidth, availHeight, min, max } = input
  if (widths.length === 0) return { size: max, wrap: false }
  const fits = (s: number): boolean => wrappedLines(widths, s, availWidth) * s * lineHeight <= availHeight
  const widest = Math.max(...widths, 0.0001)
  const noWrap = Math.min(max, availWidth / widest, availHeight / (widths.length * lineHeight))
  if (noWrap >= (input.paragraph ? max : min)) return { size: Math.floor(noWrap * 10) / 10, wrap: false }

  const top = input.paragraph ? max : min
  if (fits(top)) return { size: top, wrap: true }
  let lo = 4
  let hi = top
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return { size: Math.floor(lo * 10) / 10, wrap: true }
}
