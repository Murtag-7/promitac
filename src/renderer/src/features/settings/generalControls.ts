/**
 * Class names that bring the shared compact controls up to the 32 px minimum target size used in
 * the settings panels, without changing how they look.
 */

/** Invisible hit area around a Switch (20 px tall → 32 px). */
export const SWITCH_HIT = "relative after:absolute after:-inset-x-1.5 after:-inset-y-1.5 after:content-['']"

/** Segmented control with 32 px tall segments (matches the 36 px inputs and selects). */
export const SEGMENTED_TALL = '[&>button]:h-8 [&>button]:min-w-9 [&>button]:px-3'

/** Slider whose clickable track area is 32 px tall. */
export const SLIDER_TALL = 'h-8'

/** Sonner action button in the app's accent style. */
export const TOAST_ACTION =
  '!h-8 !rounded-control !bg-light !px-3 !text-small !font-[550] !text-light-ink hover:!bg-light/90'
