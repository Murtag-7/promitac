import { parseChordPro } from '@core/chordpro/parse'
import { DEFAULT_SETTINGS } from '@core/settings/model'
import { BUILT_IN_THEMES } from '@core/theme/defaults'
import type { MediaItem } from '@core/media/model'
import type { ServicePlan } from '@core/plan/model'
import { buildFrame, buildLiveItems, sameOnScreen, withPinnedItem } from './items'

const song = {
  ...parseChordPro('{title: Test}\n{start_of_verse: V1}\n[G]Ahoj [D]světe\n{end_of_verse}\n'),
  id: 's1',
  updatedAt: ''
}
const media: MediaItem = {
  id: 'm1',
  name: 'Pozadí',
  kind: 'image',
  fileName: 'm1.png',
  mime: 'image/png',
  size: 10,
  localOnly: false,
  updatedAt: ''
}
const plan: ServicePlan = {
  id: 'p',
  title: 'P',
  date: '2026-11-01',
  isTemplate: false,
  updatedAt: '',
  items: [
    { id: 'a', type: 'song', songId: 's1' },
    { id: 'b', type: 'song', songId: 'missing' },
    { id: 'c', type: 'media', mediaId: 'm1' },
    { id: 'd', type: 'bible', reference: 'nesmysl 99', translationId: 'cs-bkr' },
    { id: 'e', type: 'bible', reference: 'J 3,16', translationId: 'cs-bkr' },
    { id: 'f', type: 'text', title: 'Oznámení', body: 'Řádek 1\n\nŘádek 2' }
  ]
}
const deps = { songs: { s1: song }, bibles: {}, media: [media], settings: DEFAULT_SETTINGS }

describe('buildLiveItems', () => {
  it('builds slides and flags problems', () => {
    const items = buildLiveItems(plan, deps)
    expect(items.map((i) => i.problem ?? 'ok')).toEqual(['ok', 'missing', 'ok', 'invalid', 'loading', 'ok'])
    expect(items[0]?.slides[0]?.lines).toEqual(['Ahoj světe'])
    expect(items[5]?.slides).toHaveLength(2)
  })

  it('keeps identity of unchanged items', () => {
    expect(buildLiveItems(plan, deps)[0]).toBe(buildLiveItems(plan, deps)[0])
  })
})

describe('buildFrame', () => {
  const base = {
    themes: BUILT_IN_THEMES,
    settings: { ...DEFAULT_SETTINGS, logoMediaId: 'm1' },
    alert: null,
    timer: null,
    backgroundOverride: null,
    seq: 1,
    mediaItems: [media],
    mediaUrl: (m: MediaItem) => `app://media/${m.fileName}`
  }

  it('never contains chords and resolves media urls', () => {
    const items = buildLiveItems(plan, deps)
    const frame = buildFrame({ ...base, items, live: { itemId: 'a', slideIndex: 0, overlay: 'none' } })
    expect(JSON.stringify(frame.slide)).not.toMatch(/\[G\]|"G"|"D"/)
    expect(frame.media.m1).toEqual({ url: 'app://media/m1.png', kind: 'image' })
    expect(frame.theme.id).toBe('classic-dark')
  })

  it('media slide frames carry the media url', () => {
    const items = buildLiveItems(plan, deps)
    const frame = buildFrame({
      ...base,
      settings: DEFAULT_SETTINGS,
      items,
      live: { itemId: 'c', slideIndex: 0, overlay: 'none' }
    })
    expect(frame.slide?.kind).toBe('media')
    expect(frame.media.m1?.url).toBe('app://media/m1.png')
  })

  it('nothing live → empty slide', () => {
    const frame = buildFrame({ ...base, items: [], live: { itemId: null, slideIndex: 0, overlay: 'none' } })
    expect(frame.slide).toBeNull()
  })
})

describe('withPinnedItem', () => {
  const items = buildLiveItems(plan, deps)
  const live = items[0]!
  const edited = {
    ...live,
    slides: [...live.slides, { id: 'x', kind: 'text' as const, lines: ['Nová sloka'] }]
  }

  it('keeps the on-screen version when a sync changed the item', () => {
    const after = items.map((i, n) => (n === 0 ? edited : i))
    const out = withPinnedItem(after, { item: live, index: 0 })
    expect(out[0]).toBe(live)
    expect(out).toHaveLength(items.length)
  })

  it('puts the item back where it was when a sync removed it from the plan', () => {
    const after = items.filter((i) => i.id !== live.id)
    const out = withPinnedItem(after, { item: live, index: 0 })
    expect(out[0]?.id).toBe(live.id)
    expect(withPinnedItem([], { item: live, index: 3 })).toEqual([live])
  })

  it('compares what would be on screen', () => {
    expect(sameOnScreen(live, { ...live })).toBe(true)
    expect(sameOnScreen(live, edited)).toBe(false)
    expect(sameOnScreen(live, undefined)).toBe(false)
  })
})
