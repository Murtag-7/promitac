import type { SectionType } from '../chordpro/model'
import type { LiveAction } from './state'

export interface KeyInput {
  key: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  shift?: boolean
}

const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'])
const PREV = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])

const SECTION_KEYS: Record<string, SectionType> = {
  r: 'chorus',
  m: 'bridge',
  p: 'prechorus',
  i: 'intro',
  o: 'outro',
  e: 'ending',
  t: 'tag'
}

/**
 * Map a key press during live projection to an action. `pending` carries a prefix between key
 * presses (V followed by a digit). Presentation clickers send PageUp/PageDown/arrows and "."/B.
 * B = black (common convention), so the bridge ("most") is M.
 */
export function resolveKey(
  e: KeyInput,
  pending: string | null
): { action: LiveAction | null; pending: string | null } {
  if (e.ctrl || e.meta || e.alt) return { action: null, pending: null }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

  if (pending === 'v') {
    if (/^[1-9]$/.test(key))
      return { action: { type: 'gotoSection', sectionType: 'verse', number: Number(key) }, pending: null }
    if (key === 'v') return { action: { type: 'gotoSection', sectionType: 'verse' }, pending: null }
  }

  if (e.shift && (key === 'ArrowDown' || key === 'ArrowRight'))
    return { action: { type: 'nextItem' }, pending: null }
  if (e.shift && (key === 'ArrowUp' || key === 'ArrowLeft'))
    return { action: { type: 'prevItem' }, pending: null }
  if (NEXT.has(key)) return { action: { type: 'next' }, pending: null }
  if (PREV.has(key)) return { action: { type: 'prev' }, pending: null }
  if (key === 'Escape') return { action: { type: 'cancel' }, pending: null }
  if (key === 'b' || key === '.')
    return { action: { type: 'toggleOverlay', overlay: 'black' }, pending: null }
  if (key === 'c') return { action: { type: 'toggleOverlay', overlay: 'clear' }, pending: null }
  if (key === 'l') return { action: { type: 'toggleOverlay', overlay: 'logo' }, pending: null }
  if (key === 'v') return { action: null, pending: 'v' }
  if (/^[1-9]$/.test(key))
    return { action: { type: 'gotoSection', sectionType: 'verse', number: Number(key) }, pending: null }
  const section = SECTION_KEYS[key]
  if (section) return { action: { type: 'gotoSection', sectionType: section }, pending: null }
  return { action: null, pending: null }
}
