import type { OutputConfig } from '@core/settings/model'
import type { DisplayInfo } from '@shared/api'

/**
 * Which display an output should use right now. Never returns the control window's display for a
 * fullscreen output (that would hide the operator's controls); windowed outputs may use any display.
 */
export function resolveOutputDisplay(
  config: OutputConfig,
  displays: DisplayInfo[],
  controlDisplayId: number | null
): DisplayInfo | null {
  if (!config.enabled) return null
  const allowed = (dd: DisplayInfo): boolean => config.windowed || dd.id !== controlDisplayId

  if (config.displayId === 'auto') {
    const external = displays.find((dd) => !dd.primary && dd.id !== controlDisplayId)
    if (external) return external
    // The system may have made the projector the primary display while the operator works on the
    // laptop screen: any display other than the control one is then the wall.
    if (controlDisplayId !== null && displays.length > 1) {
      const other = displays.find((dd) => dd.id !== controlDisplayId)
      if (other) return other
    }
    if (config.windowed) return displays.find((dd) => dd.id === controlDisplayId) ?? displays[0] ?? null
    return null
  }

  const byId = displays.find((dd) => dd.id === config.displayId)
  if (byId) return allowed(byId) ? byId : null
  if (config.displayLabel) {
    const byLabel = displays.find((dd) => dd.label === config.displayLabel)
    if (byLabel && allowed(byLabel)) return byLabel
  }
  return null
}
