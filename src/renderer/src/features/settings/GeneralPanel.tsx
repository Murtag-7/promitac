import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FolderOpen, Moon, Sun } from 'lucide-react'
import type { AppSettings } from '@core/settings/model'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cs } from '@/i18n/cs'
import { useSettings } from '@/store/settings'
import { SettingsGroup, SettingsPage, SettingsRow } from './layout'
import { SEGMENTED_TALL, SLIDER_TALL, SWITCH_HIT } from './generalControls'

const t = cs.settings.general
const LINE_OPTIONS = ['2', '3', '4', '5', '6'] as const
const BIBLE_MIN = 120
const BIBLE_MAX = 500
const BIBLE_STEP = 20
/** Slider changes are saved once the hand stops moving. */
const SAVE_DELAY_MS = 350

function save(patch: Partial<AppSettings>): void {
  useSettings
    .getState()
    .update(patch)
    .catch((err: unknown) => {
      console.error(err)
      toast.error(cs.common.error)
    })
}

export function GeneralPanel() {
  const settings = useSettings((s) => s.settings)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api()
      .app.version()
      .then((v) => alive && setVersion(v))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const lines = String(Math.min(6, Math.max(2, settings.linesPerSlide)))

  return (
    <SettingsPage title={t.title}>
      <SettingsGroup title={t.groupSlides}>
        <SettingsRow label={t.linesPerSlide} hint={t.linesPerSlideHint}>
          <Segmented
            className={SEGMENTED_TALL}
            aria-label={t.linesPerSlide}
            value={lines}
            onChange={(v) => save({ linesPerSlide: Number(v) })}
            options={LINE_OPTIONS.map((n) => ({ value: n, label: n, title: cs.common.lines(Number(n)) }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t.groupBible}>
        <SettingsRow label={t.bibleChars} hint={t.bibleCharsHint}>
          <BibleCharsSlider value={settings.bibleMaxChars} />
        </SettingsRow>
        <SettingsRow label={t.bibleVerseNumbers} hint={t.bibleVerseNumbersHint}>
          <Switch
            className={SWITCH_HIT}
            aria-label={t.bibleVerseNumbers}
            checked={settings.bibleVerseNumbers}
            onCheckedChange={(bibleVerseNumbers) => save({ bibleVerseNumbers })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t.groupApp}>
        <SettingsRow label={t.uiTheme} hint={t.uiThemeHint}>
          <Segmented
            className={SEGMENTED_TALL}
            aria-label={t.uiTheme}
            value={settings.uiTheme}
            onChange={(uiTheme) => save({ uiTheme })}
            options={[
              {
                value: 'dark',
                label: (
                  <span className="flex items-center gap-1.5">
                    <Moon className="size-3.5" aria-hidden />
                    {t.dark}
                  </span>
                )
              },
              {
                value: 'light',
                label: (
                  <span className="flex items-center gap-1.5">
                    <Sun className="size-3.5" aria-hidden />
                    {t.light}
                  </span>
                )
              }
            ]}
          />
        </SettingsRow>
        <SettingsRow label={t.deviceName} hint={t.deviceNameHint}>
          <DeviceNameInput value={settings.deviceName} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t.groupData}>
        <SettingsRow label={t.dataFolder} hint={t.dataFolderHint}>
          <Button
            onClick={() => {
              api()
                .app.openDataFolder()
                .catch(() => toast.error(cs.common.error))
            }}
          >
            <FolderOpen aria-hidden />
            {t.openDataFolder}
          </Button>
        </SettingsRow>
        <SettingsRow label={t.about}>
          <span className="text-body tabular text-ink-2" data-testid="app-version">
            {version ? t.version(version) : '…'}
          </span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  )
}

function BibleCharsSlider({ value }: { value: number }) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | null>(null)
  const pending = useRef<number | null>(null)

  useEffect(() => {
    if (pending.current === null) setDraft(value)
  }, [value])

  // Flush a pending change when the panel closes mid-drag.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (pending.current !== null) save({ bibleMaxChars: pending.current })
    },
    []
  )

  const change = (v: number): void => {
    setDraft(v)
    pending.current = v
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      const next = pending.current
      pending.current = null
      if (next !== null) save({ bibleMaxChars: next })
    }, SAVE_DELAY_MS)
  }

  const clamped = Math.min(BIBLE_MAX, Math.max(BIBLE_MIN, draft))
  return (
    <div className="flex w-[300px] items-center gap-3">
      <Slider
        className={SLIDER_TALL}
        aria-label={t.bibleChars}
        min={BIBLE_MIN}
        max={BIBLE_MAX}
        step={BIBLE_STEP}
        value={clamped}
        onValueChange={change}
      />
      <output className="w-[76px] shrink-0 text-right text-small tabular text-ink-2" aria-live="polite">
        {t.bibleCharsValue(clamped)}
      </output>
    </div>
  )
}

function DeviceNameInput({ value }: { value: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    const v = draft.trim()
    if (!v) setDraft(value)
    else if (v !== value) {
      save({ deviceName: v })
      toast.success(cs.common.saved)
    }
  }
  return (
    <Input
      aria-label={t.deviceName}
      className="w-[300px]"
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
