import { resolveKey } from './keymap'

const k = (
  key: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}
) => ({
  key,
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
  ...mods
})

describe('resolveKey', () => {
  it.each(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'])('%j → next', (key) => {
    expect(resolveKey(k(key), null).action).toEqual({ type: 'next' })
  })
  it.each(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])('%j → prev', (key) => {
    expect(resolveKey(k(key), null).action).toEqual({ type: 'prev' })
  })
  it('maps overlays', () => {
    expect(resolveKey(k('b'), null).action).toEqual({ type: 'toggleOverlay', overlay: 'black' })
    expect(resolveKey(k('B'), null).action).toEqual({ type: 'toggleOverlay', overlay: 'black' })
    expect(resolveKey(k('.'), null).action).toEqual({ type: 'toggleOverlay', overlay: 'black' })
    expect(resolveKey(k('c'), null).action).toEqual({ type: 'toggleOverlay', overlay: 'clear' })
    expect(resolveKey(k('l'), null).action).toEqual({ type: 'toggleOverlay', overlay: 'logo' })
    expect(resolveKey(k('Escape'), null).action).toEqual({ type: 'cancel' })
  })
  it('V then a digit jumps to that verse', () => {
    const first = resolveKey(k('v'), null)
    expect(first).toEqual({ action: null, pending: 'v' })
    expect(resolveKey(k('2'), first.pending).action).toEqual({
      type: 'gotoSection',
      sectionType: 'verse',
      number: 2
    })
  })
  it('a lone digit jumps to that verse', () => {
    expect(resolveKey(k('3'), null).action).toEqual({ type: 'gotoSection', sectionType: 'verse', number: 3 })
  })
  it('section letters', () => {
    expect(resolveKey(k('r'), null).action).toEqual({ type: 'gotoSection', sectionType: 'chorus' })
    expect(resolveKey(k('m'), null).action).toEqual({ type: 'gotoSection', sectionType: 'bridge' })
    expect(resolveKey(k('p'), null).action).toEqual({ type: 'gotoSection', sectionType: 'prechorus' })
    expect(resolveKey(k('i'), null).action).toEqual({ type: 'gotoSection', sectionType: 'intro' })
    expect(resolveKey(k('o'), null).action).toEqual({ type: 'gotoSection', sectionType: 'outro' })
    expect(resolveKey(k('e'), null).action).toEqual({ type: 'gotoSection', sectionType: 'ending' })
    expect(resolveKey(k('t'), null).action).toEqual({ type: 'gotoSection', sectionType: 'tag' })
  })
  it('a lone v jumps to the next verse when followed by a non-digit', () => {
    expect(resolveKey(k('ArrowRight'), 'v').action).toEqual({ type: 'next' })
  })
  it('ignores keys with Ctrl / Cmd / Alt', () => {
    expect(resolveKey(k('b', { ctrl: true }), null)).toEqual({ action: null, pending: null })
    expect(resolveKey(k('ArrowRight', { meta: true }), null)).toEqual({ action: null, pending: null })
    expect(resolveKey(k('c', { alt: true }), null)).toEqual({ action: null, pending: null })
  })
  it('unknown keys do nothing', () => {
    expect(resolveKey(k('z'), null)).toEqual({ action: null, pending: null })
  })
  it('Shift + arrows move between plan items', () => {
    expect(resolveKey(k('ArrowDown', { shift: true }), null).action).toEqual({ type: 'nextItem' })
    expect(resolveKey(k('ArrowRight', { shift: true }), null).action).toEqual({ type: 'nextItem' })
    expect(resolveKey(k('ArrowUp', { shift: true }), null).action).toEqual({ type: 'prevItem' })
    expect(resolveKey(k('ArrowLeft', { shift: true }), null).action).toEqual({ type: 'prevItem' })
  })
  it('Shift + letters still work (caps)', () => {
    expect(resolveKey(k('B', { shift: true }), null).action).toEqual({
      type: 'toggleOverlay',
      overlay: 'black'
    })
  })
})
