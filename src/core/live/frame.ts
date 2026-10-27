import type { Slide } from '../slides/model'
import type { Theme, ThemeBackground } from '../theme/model'

export type Overlay = 'none' | 'black' | 'clear' | 'logo'

/** Everything an output window needs to render – sent from the control window via main. */
export interface OutputFrame {
  /** Monotonic counter so outputs can drop stale frames. */
  seq: number
  slide: Slide | null
  theme: Theme
  overlay: Overlay
  logoMediaId?: string
  backgroundOverride?: ThemeBackground
  alert: { text: string } | null
  timer: { endsAt: number; label: string } | null
  /** Test pattern for output identification. */
  identify?: { label: string } | null
}
