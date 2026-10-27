import type { OutputFrame } from '@core/live/frame'
import { api } from '@/api/client'
import { useBible } from '@/store/bible'
import { useLibrary } from '@/store/library'
import { currentLiveItems, useLive } from '@/store/live'
import { useMedia } from '@/store/media'
import { usePlans } from '@/store/plans'
import { useSettings } from '@/store/settings'
import { useThemes } from '@/store/themes'
import { buildFrame } from './items'

let seq = 0
let lastSent = ''
let latest: OutputFrame | null = null

/** The frame currently on the outputs (used by the Live preview in the control window). */
export function latestFrame(): OutputFrame | null {
  return latest
}

function push(): void {
  const live = useLive.getState()
  const items = currentLiveItems()
  const frame = buildFrame({
    live: live.live,
    items,
    themes: useThemes.getState().themes,
    settings: useSettings.getState().settings,
    alert: live.alert,
    timer: live.timer,
    backgroundOverride: live.backgroundOverride,
    identify: live.identify,
    seq: 0,
    mediaItems: useMedia.getState().items,
    mediaUrl: (m) => api().media.url(m)
  })
  const key = JSON.stringify(frame)
  if (key === lastSent) return
  lastSent = key
  frame.seq = ++seq
  latest = frame
  api().output.setFrame(frame)
  for (const l of listeners) l(frame)
  // Bible translations load lazily – make sure the ones in the live plan are available.
  for (const it of items) {
    if (it.problem === 'loading' && it.item.type === 'bible')
      void useBible.getState().ensure(it.item.translationId)
  }
}

const listeners = new Set<(f: OutputFrame) => void>()
export function onLocalFrame(cb: (f: OutputFrame) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Recompute and send the output frame whenever anything it depends on changes. */
export function startOutputEngine(): () => void {
  const unsubs = [
    useLive.subscribe(push),
    useLibrary.subscribe(push),
    usePlans.subscribe(push),
    useThemes.subscribe(push),
    useSettings.subscribe(push),
    useBible.subscribe(push),
    useMedia.subscribe(push)
  ]
  push()
  return () => unsubs.forEach((u) => u())
}
