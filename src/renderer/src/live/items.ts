import type { BibleData } from '@core/bible/model'
import { getVerses, passageToSlides } from '@core/bible/passage'
import { formatReference, parseReference } from '@core/bible/reference'
import type { Song } from '@core/chordpro/model'
import type { OutputFrame } from '@core/live/frame'
import type { LiveState } from '@core/live/state'
import type { MediaItem } from '@core/media/model'
import type { PlanItem, ServicePlan } from '@core/plan/model'
import type { AppSettings } from '@core/settings/model'
import { songToSlides, textToSlides } from '@core/slides/generate'
import type { Slide } from '@core/slides/model'
import { findTheme } from '@core/theme/defaults'
import type { Theme, ThemeBackground } from '@core/theme/model'
import { cs } from '@/i18n/cs'

export interface LiveItem {
  id: string
  item: PlanItem
  title: string
  subtitle?: string
  slides: Slide[]
  themeId?: string
  /** Referenced song/media no longer exists, or the Bible translation is still loading. */
  problem?: 'missing' | 'loading' | 'invalid'
}

export interface LiveDeps {
  songs: Record<string, Song>
  bibles: Record<string, BibleData>
  media: MediaItem[]
  settings: AppSettings
}

export function buildLiveItem(item: PlanItem, deps: LiveDeps): LiveItem {
  const { settings } = deps
  switch (item.type) {
    case 'song': {
      const song = deps.songs[item.songId]
      if (!song) return { id: item.id, item, title: cs.live.songMissing, slides: [], problem: 'missing' }
      return {
        id: item.id,
        item,
        title: song.meta.title || cs.common.untitled,
        subtitle: song.meta.artist,
        themeId: song.themeId,
        slides: songToSlides(song, { linesPerSlide: settings.linesPerSlide, arrangement: item.arrangement })
      }
    }
    case 'bible': {
      const ref = parseReference(item.reference)
      if (!ref) return { id: item.id, item, title: item.reference, slides: [], problem: 'invalid' }
      const data = deps.bibles[item.translationId]
      const title = formatReference(ref)
      if (!data) return { id: item.id, item, title, slides: [], problem: 'loading' }
      const slides = passageToSlides(getVerses(data, ref), ref, {
        maxChars: settings.bibleMaxChars,
        verseNumbers: settings.bibleVerseNumbers,
        label: data.abbreviation,
        lang: data.language === 'cs' ? 'cs' : 'en'
      })
      return { id: item.id, item, title, subtitle: data.abbreviation, slides }
    }
    case 'media': {
      const m = deps.media.find((x) => x.id === item.mediaId)
      if (!m) return { id: item.id, item, title: cs.live.mediaMissing, slides: [], problem: 'missing' }
      return {
        id: item.id,
        item,
        title: m.name,
        subtitle: m.kind === 'video' ? cs.media.video : cs.media.image,
        slides: [{ id: 'media', kind: 'media', lines: [], mediaId: m.id }]
      }
    }
    case 'text':
      return {
        id: item.id,
        item,
        title: item.title || cs.plan.itemKinds.text,
        slides: textToSlides(item.title, item.body, settings.linesPerSlide)
      }
    case 'blank':
      return {
        id: item.id,
        item,
        title: cs.live.blankSlide,
        slides: [{ id: 'blank', kind: 'blank', lines: [] }]
      }
  }
}

/** Cache so unchanged plan items keep their identity between renders. */
const cache = new WeakMap<PlanItem, { deps: LiveDeps; value: LiveItem }>()

export function buildLiveItems(plan: ServicePlan | null | undefined, deps: LiveDeps): LiveItem[] {
  if (!plan) return []
  return plan.items.map((item) => {
    const hit = cache.get(item)
    if (
      hit &&
      hit.deps.songs === deps.songs &&
      hit.deps.bibles === deps.bibles &&
      hit.deps.media === deps.media &&
      hit.deps.settings === deps.settings
    ) {
      return hit.value
    }
    const value = buildLiveItem(item, deps)
    cache.set(item, { deps, value })
    return value
  })
}

export interface FrameInputs {
  live: LiveState
  items: LiveItem[]
  themes: Theme[]
  settings: AppSettings
  alert: string | null
  timer: { endsAt: number; label: string } | null
  backgroundOverride: ThemeBackground | null
  identify?: { label: string } | null
  seq: number
  mediaItems: MediaItem[]
  mediaUrl: (m: MediaItem) => string
}

export function buildFrame(i: FrameInputs): OutputFrame {
  const item = i.items.find((x) => x.id === i.live.itemId)
  const slide = item?.slides[i.live.slideIndex] ?? null
  const theme = findTheme(i.themes, item?.themeId ?? i.settings.defaultThemeId)
  const media: OutputFrame['media'] = {}
  const want = (id: string | undefined): void => {
    if (!id || media[id]) return
    const m = i.mediaItems.find((x) => x.id === id)
    if (m) media[id] = { url: i.mediaUrl(m), kind: m.kind }
  }
  want(slide?.mediaId)
  want(i.settings.logoMediaId)
  for (const bg of [theme.background, i.backgroundOverride]) {
    if (bg && (bg.kind === 'image' || bg.kind === 'video')) want(bg.mediaId)
  }
  return {
    media,
    seq: i.seq,
    slide,
    theme,
    overlay: i.live.overlay,
    logoMediaId: i.settings.logoMediaId,
    backgroundOverride: i.backgroundOverride ?? undefined,
    alert: i.alert ? { text: i.alert } : null,
    timer: i.timer,
    identify: i.identify ?? null
  }
}
