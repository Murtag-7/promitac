import { useCallback, useEffect, useState } from 'react'
import type { BibleData, BibleTranslationInfo } from '@core/bible/model'
import { DEFAULT_SETTINGS } from '@core/settings/model'
import { useBible } from '@/store/bible'
import { useSettings } from '@/store/settings'

export type TranslationStatus = 'loading' | 'ready' | 'error'

export interface CurrentTranslation {
  translations: BibleTranslationInfo[]
  info: BibleTranslationInfo | undefined
  data: BibleData | undefined
  status: TranslationStatus
  select(id: string): void
  retry(): void
}

/** The translation chosen in settings (falls back to BKR), loaded lazily the first time it is needed. */
export function useCurrentTranslation(): CurrentTranslation {
  const translations = useBible((s) => s.translations)
  const preferred = useSettings((s) => s.settings.bibleTranslationId)
  const info =
    translations.find((t) => t.id === preferred) ??
    translations.find((t) => t.id === DEFAULT_SETTINGS.bibleTranslationId) ??
    translations[0]
  const id = info?.id
  const data = useBible((s) => (id ? s.data[id] : undefined))
  const [failedId, setFailedId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!id) return
    let alive = true
    void useBible
      .getState()
      .ensure(id)
      .then(() => {
        const state = useBible.getState()
        if (alive && !state.data[id] && !state.loading[id]) setFailedId(id)
      })
    return () => {
      alive = false
    }
  }, [id, attempt])

  const select = useCallback((next: string) => {
    void useSettings.getState().update({ bibleTranslationId: next })
  }, [])

  const retry = useCallback(() => {
    setFailedId(null)
    setAttempt((n) => n + 1)
  }, [])

  const status: TranslationStatus = data
    ? 'ready'
    : (failedId !== null && failedId === id) || translations.length === 0
      ? 'error'
      : 'loading'
  return { translations, info, data, status, select, retry }
}
