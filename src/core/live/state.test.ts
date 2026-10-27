import type { Slide } from '../slides/model'
import { initialLiveState, liveReducer, type LiveContext } from './state'

const s = (id: string, sectionId?: string, sectionType?: Slide['sectionType']): Slide => ({
  id,
  kind: 'song',
  lines: [id],
  sectionId,
  sectionType
})

const ctx: LiveContext = {
  items: [
    {
      id: 'a',
      slides: [s('a1', 'V1', 'verse'), s('a2', 'C', 'chorus'), s('a3', 'V2', 'verse'), s('a4', 'C', 'chorus')]
    },
    { id: 'b', slides: [s('b1')] },
    { id: 'empty', slides: [] },
    { id: 'c', slides: [s('c1'), s('c2')] }
  ]
}

describe('liveReducer', () => {
  it('goes to a slide', () => {
    const st = liveReducer(initialLiveState, { type: 'goto', itemId: 'a', slideIndex: 2 }, ctx)
    expect(st).toMatchObject({ itemId: 'a', slideIndex: 2, overlay: 'none' })
  })

  it('next on the last slide continues with the next item, skipping empty ones', () => {
    let st = liveReducer(initialLiveState, { type: 'goto', itemId: 'a', slideIndex: 3 }, ctx)
    st = liveReducer(st, { type: 'next' }, ctx)
    expect(st).toMatchObject({ itemId: 'b', slideIndex: 0 })
    st = liveReducer(st, { type: 'next' }, ctx)
    expect(st).toMatchObject({ itemId: 'c', slideIndex: 0 })
  })

  it('prev on the first slide goes to the last slide of the previous item', () => {
    let st = liveReducer(initialLiveState, { type: 'goto', itemId: 'c', slideIndex: 0 }, ctx)
    st = liveReducer(st, { type: 'prev' }, ctx)
    expect(st).toMatchObject({ itemId: 'b', slideIndex: 0 })
    st = liveReducer(st, { type: 'prev' }, ctx)
    expect(st).toMatchObject({ itemId: 'a', slideIndex: 3 })
  })

  it('stays at the ends of the plan', () => {
    let st = liveReducer(initialLiveState, { type: 'goto', itemId: 'c', slideIndex: 1 }, ctx)
    expect(liveReducer(st, { type: 'next' }, ctx)).toBe(st)
    st = liveReducer(initialLiveState, { type: 'goto', itemId: 'a', slideIndex: 0 }, ctx)
    expect(liveReducer(st, { type: 'prev' }, ctx)).toBe(st)
  })

  it('next with nothing live starts the first item', () => {
    expect(liveReducer(initialLiveState, { type: 'next' }, ctx)).toMatchObject({ itemId: 'a', slideIndex: 0 })
  })

  it('toggles overlays and clears them when moving', () => {
    let st = liveReducer(initialLiveState, { type: 'goto', itemId: 'a', slideIndex: 0 }, ctx)
    st = liveReducer(st, { type: 'toggleOverlay', overlay: 'black' }, ctx)
    expect(st.overlay).toBe('black')
    st = liveReducer(st, { type: 'toggleOverlay', overlay: 'black' }, ctx)
    expect(st.overlay).toBe('none')
    st = liveReducer(st, { type: 'toggleOverlay', overlay: 'logo' }, ctx)
    st = liveReducer(st, { type: 'next' }, ctx)
    expect(st).toMatchObject({ overlay: 'none', slideIndex: 1 })
  })

  it('cancel removes the overlay', () => {
    let st = liveReducer(initialLiveState, { type: 'goto', itemId: 'a', slideIndex: 0 }, ctx)
    st = liveReducer(st, { type: 'toggleOverlay', overlay: 'clear' }, ctx)
    expect(liveReducer(st, { type: 'cancel' }, ctx).overlay).toBe('none')
  })

  it('jumps to the next occurrence of a section after the current slide', () => {
    let st = liveReducer(initialLiveState, { type: 'goto', itemId: 'a', slideIndex: 0 }, ctx)
    st = liveReducer(st, { type: 'gotoSection', sectionType: 'chorus' }, ctx)
    expect(st.slideIndex).toBe(1)
    st = liveReducer(st, { type: 'gotoSection', sectionType: 'chorus' }, ctx)
    expect(st.slideIndex).toBe(3)
    st = liveReducer(st, { type: 'gotoSection', sectionType: 'chorus' }, ctx)
    expect(st.slideIndex).toBe(1)
    st = liveReducer(st, { type: 'gotoSection', sectionType: 'verse', number: 2 }, ctx)
    expect(st.slideIndex).toBe(2)
  })

  it('ignores section jumps that do not exist', () => {
    const st = liveReducer(initialLiveState, { type: 'goto', itemId: 'a', slideIndex: 0 }, ctx)
    expect(liveReducer(st, { type: 'gotoSection', sectionType: 'bridge' }, ctx)).toBe(st)
  })

  it('clamps when the live item shrank', () => {
    const st = liveReducer(initialLiveState, { type: 'goto', itemId: 'c', slideIndex: 9 }, ctx)
    expect(st.slideIndex).toBe(1)
  })
})
