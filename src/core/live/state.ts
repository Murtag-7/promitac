import type { SectionType } from '../chordpro/model'
import type { Slide } from '../slides/model'
import type { Overlay } from './frame'

export interface LiveState {
  itemId: string | null
  slideIndex: number
  overlay: Overlay
}

export type LiveAction =
  | { type: 'goto'; itemId: string; slideIndex: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'nextItem' }
  | { type: 'prevItem' }
  | { type: 'toggleOverlay'; overlay: Exclude<Overlay, 'none'> }
  | { type: 'cancel' }
  | { type: 'gotoSection'; sectionType: SectionType; number?: number }

export interface LiveContext {
  items: Array<{ id: string; slides: Slide[] }>
}

export const initialLiveState: LiveState = { itemId: null, slideIndex: 0, overlay: 'none' }

function withSlide(state: LiveState, itemId: string, slideIndex: number): LiveState {
  if (state.itemId === itemId && state.slideIndex === slideIndex && state.overlay === 'none') return state
  return { itemId, slideIndex, overlay: 'none' }
}

/** Pure state machine of what is on the screen. The control UI renders frames from it. */
export function liveReducer(state: LiveState, action: LiveAction, ctx: LiveContext): LiveState {
  const items = ctx.items
  const idx = items.findIndex((i) => i.id === state.itemId)
  const current = idx >= 0 ? items[idx] : undefined

  switch (action.type) {
    case 'goto': {
      const item = items.find((i) => i.id === action.itemId)
      if (!item) return state
      const slideIndex = Math.max(0, Math.min(action.slideIndex, Math.max(0, item.slides.length - 1)))
      return { itemId: item.id, slideIndex, overlay: 'none' }
    }
    case 'next': {
      if (!current) {
        const first = items.find((i) => i.slides.length > 0)
        return first ? withSlide(state, first.id, 0) : state
      }
      if (state.slideIndex < current.slides.length - 1)
        return withSlide(state, current.id, state.slideIndex + 1)
      for (let i = idx + 1; i < items.length; i++) {
        const it = items[i]
        if (it && it.slides.length > 0) return withSlide(state, it.id, 0)
      }
      return state
    }
    case 'prev': {
      if (!current) return state
      if (state.slideIndex > 0) return withSlide(state, current.id, state.slideIndex - 1)
      for (let i = idx - 1; i >= 0; i--) {
        const it = items[i]
        if (it && it.slides.length > 0) return withSlide(state, it.id, it.slides.length - 1)
      }
      return state
    }
    case 'nextItem': {
      const start = current ? idx + 1 : 0
      for (let i = start; i < items.length; i++) {
        const it = items[i]
        if (it && it.slides.length > 0) return withSlide(state, it.id, 0)
      }
      return state
    }
    case 'prevItem': {
      if (!current) return state
      if (state.slideIndex > 0) return withSlide(state, current.id, 0)
      for (let i = idx - 1; i >= 0; i--) {
        const it = items[i]
        if (it && it.slides.length > 0) return withSlide(state, it.id, 0)
      }
      return state
    }
    case 'toggleOverlay':
      return { ...state, overlay: state.overlay === action.overlay ? 'none' : action.overlay }
    case 'cancel':
      return state.overlay === 'none' ? state : { ...state, overlay: 'none' }
    case 'gotoSection': {
      if (!current) return state
      const matches = (s: Slide): boolean => {
        if (s.sectionType !== action.sectionType) return false
        if (action.number === undefined) return true
        return (
          s.sectionId === `V${action.number}` || s.sectionId?.replace(/\D/g, '') === String(action.number)
        )
      }
      // First slide of each section occurrence (slide ids look like "C#1.0" → chunk 0 starts a section).
      const starts = current.slides
        .map((s, i) => ({ s, i }))
        .filter(
          ({ s, i }) =>
            matches(s) && (i === 0 || current.slides[i - 1]?.id.split('.')[0] !== s.id.split('.')[0])
        )
      if (starts.length === 0) return state
      const after = starts.find(({ i }) => i > state.slideIndex) ?? starts[0]
      return after ? withSlide(state, current.id, after.i) : state
    }
  }
}
