import type { OutputConfig } from '@core/settings/model'
import type { DisplayInfo, OutputStatus, OutputWindowState } from '@shared/api'

/** 'auto' = the first display that is not the primary one (same rule as the main process). */
export function autoDisplay(displays: DisplayInfo[]): DisplayInfo | null {
  return displays.find((d) => !d.primary) ?? null
}

/** The display an output is configured for (null = not connected / none available). */
export function resolveDisplay(output: OutputConfig, displays: DisplayInfo[]): DisplayInfo | null {
  if (output.displayId === 'auto') return autoDisplay(displays)
  return displays.find((d) => d.id === output.displayId) ?? null
}

/** Display the output uses now: what main reports for an open window, else what the config resolves to. */
export function activeDisplayId(
  output: OutputConfig,
  status: OutputStatus | undefined,
  displays: DisplayInfo[]
): number | null {
  if (!output.enabled) return null
  if (status?.state === 'open' && status.displayId !== null) return status.displayId
  return resolveDisplay(output, displays)?.id ?? null
}

export function outputState(output: OutputConfig, status: OutputStatus | undefined): OutputWindowState {
  return status?.state ?? (output.enabled ? 'no-display' : 'disabled')
}

/** Same dot colours as the outputs status in the Live sidebar. */
export const STATE_DOT: Record<OutputWindowState, string> = {
  open: 'bg-light',
  disabled: 'bg-ink-3/60',
  'no-display': 'bg-warn',
  error: 'bg-warn'
}

export interface MapRect {
  id: number
  /** Fractions (0–1) of the bounding box of all displays. */
  left: number
  top: number
  width: number
  height: number
}

/** Display rectangles normalised to their common bounding box (keeps the real arrangement). */
export function displayMap(displays: DisplayInfo[]): { rects: MapRect[]; width: number; height: number } {
  if (displays.length === 0) return { rects: [], width: 0, height: 0 }
  const minX = Math.min(...displays.map((d) => d.bounds.x))
  const minY = Math.min(...displays.map((d) => d.bounds.y))
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  return {
    width,
    height,
    rects: displays.map((d) => ({
      id: d.id,
      left: (d.bounds.x - minX) / width,
      top: (d.bounds.y - minY) / height,
      width: d.bounds.width / width,
      height: d.bounds.height / height
    }))
  }
}

/** A new output on the first display no other output uses (falls back to 'auto'). */
export function newOutput(
  outputs: OutputConfig[],
  displays: DisplayInfo[],
  id: string,
  nameFor: (n: number) => string
): OutputConfig {
  const used = new Set(
    outputs.map((o) => resolveDisplay(o, displays)?.id).filter((v): v is number => v !== undefined)
  )
  const free = displays.find((d) => !d.isControl && !used.has(d.id))
  const names = new Set(outputs.map((o) => o.name))
  let n = outputs.length + 1
  while (names.has(nameFor(n))) n++
  return { id, name: nameFor(n), displayId: free ? free.id : 'auto', enabled: true, windowed: false }
}
