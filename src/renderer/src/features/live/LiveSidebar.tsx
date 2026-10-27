import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Circle } from 'lucide-react'
import {
  Eraser,
  Image as ImageIcon,
  Keyboard,
  Megaphone,
  MonitorOff,
  MonitorSmartphone,
  Timer,
  Wallpaper
} from 'lucide-react'
import type { OutputFrame } from '@core/live/frame'
import type { LiveState } from '@core/live/state'
import type { OutputStatus } from '@shared/api'
import { api } from '@/api/client'
import { ProjectionView } from '@/components/projection/ProjectionView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { latestFrame, onLocalFrame } from '@/live/engine'
import { buildFrame, type LiveItem } from '@/live/items'
import { useLive } from '@/store/live'
import { mediaUrl, useMedia } from '@/store/media'
import { useSettings } from '@/store/settings'
import { useThemes } from '@/store/themes'
import { useUi } from '@/store/ui'

function useLiveFrame(): OutputFrame | null {
  const [frame, setFrame] = useState<OutputFrame | null>(() => latestFrame())
  useEffect(() => onLocalFrame(setFrame), [])
  return frame
}

export function LiveSidebar({ items, nextState }: { items: LiveItem[]; nextState: LiveState | null }) {
  const frame = useLiveFrame()
  const themes = useThemes((s) => s.themes)
  const settings = useSettings((s) => s.settings)
  const mediaItems = useMedia((s) => s.items)
  const live = useLive((s) => s.live)
  const liveTitle = items.find((i) => i.id === live.itemId)?.title

  const nextFrame = useMemo(() => {
    if (!nextState) return null
    return buildFrame({
      live: { ...nextState, overlay: 'none' },
      items,
      themes,
      settings,
      alert: null,
      timer: null,
      backgroundOverride: useLive.getState().backgroundOverride,
      seq: 0,
      mediaItems,
      mediaUrl: (m) => mediaUrl(m)
    })
  }, [nextState, items, themes, settings, mediaItems])
  const nextTitle = nextState ? items.find((i) => i.id === nextState.itemId)?.title : undefined

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto bg-panel" aria-label={cs.live.onAir}>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-small font-[650] text-live">
            <span className="size-2 rounded-full bg-live" aria-hidden />
            {cs.live.onAir}
          </span>
          <span className="truncate text-small text-ink-2">{liveTitle ?? cs.live.nothingLive}</span>
          <ShortcutsHelp />
        </div>
        <div className="overflow-hidden rounded-card ring-2 ring-live/80">
          <ProjectionView
            frame={frame}
            mode="preview"
            className="aspect-video w-full"
            label={cs.live.onAir}
          />
        </div>
        <OverlayStatus />
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-small font-[650] text-next">{cs.live.next}</span>
          <span className="truncate text-small text-ink-2">{nextTitle ?? cs.live.nextNone}</span>
        </div>
        <div className="w-[62%] overflow-hidden rounded-card ring-1 ring-next/60">
          <ProjectionView
            frame={nextFrame}
            mode="preview"
            className="aspect-video w-full"
            label={cs.live.next}
          />
        </div>
      </div>

      <QuickControls />
      <AlertControl />
      <TimerControl />
      <OutputsStatus />
    </aside>
  )
}

function OverlayStatus() {
  const overlay = useLive((s) => s.live.overlay)
  const dispatch = useLive((s) => s.dispatch)
  if (overlay === 'none') return null
  return (
    <div className="flex items-center justify-between gap-2 rounded-control bg-warn-soft px-3 py-2 text-small text-ink">
      <span>{cs.live.overlayActive[overlay]}</span>
      <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'cancel' })}>
        {cs.live.returnToSlide}
        <Kbd>Esc</Kbd>
      </Button>
    </div>
  )
}

function QuickButton({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
  kbd
}: {
  active: boolean
  onClick: () => void
  icon: typeof Circle
  label: string
  hint: string
  kbd?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={cn(
        'press flex h-12 items-center gap-2.5 rounded-control bg-raised px-3 text-left text-body font-[600] text-ink ring-1 ring-inset ring-line hover:bg-raised-2 hover:ring-line-strong',
        active && 'bg-light text-light-ink ring-light hover:bg-light/90 hover:ring-light'
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{label}</span>
      {kbd ? (
        <Kbd className={cn(active && 'bg-light-ink/15 text-light-ink ring-light-ink/20')}>{kbd}</Kbd>
      ) : null}
    </button>
  )
}

function QuickControls() {
  const overlay = useLive((s) => s.live.overlay)
  const dispatch = useLive((s) => s.dispatch)
  const logoMediaId = useSettings((s) => s.settings.logoMediaId)
  const setView = useUi((s) => s.setView)
  const toggleLogo = (): void => {
    if (!logoMediaId) {
      toast(cs.live.noLogo, { action: { label: cs.live.setLogo, onClick: () => setView('media') } })
      return
    }
    dispatch({ type: 'toggleOverlay', overlay: 'logo' })
  }
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
      <QuickButton
        active={overlay === 'black'}
        onClick={() => dispatch({ type: 'toggleOverlay', overlay: 'black' })}
        icon={MonitorOff}
        label={cs.live.black}
        hint={cs.live.blackHint}
        kbd="B"
      />
      <QuickButton
        active={overlay === 'clear'}
        onClick={() => dispatch({ type: 'toggleOverlay', overlay: 'clear' })}
        icon={Eraser}
        label={cs.live.clear}
        hint={cs.live.clearHint}
        kbd="C"
      />
      <QuickButton
        active={overlay === 'logo'}
        onClick={toggleLogo}
        icon={ImageIcon}
        label={cs.live.logo}
        hint={cs.live.logoHint}
        kbd="L"
      />
      <BackgroundPicker />
    </div>
  )
}

function BackgroundPicker() {
  const override = useLive((s) => s.backgroundOverride)
  const setOverride = useLive((s) => s.setBackgroundOverride)
  const media = useMedia((s) => s.items)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={cs.live.backgroundHint}
          className={cn(
            'press flex h-12 items-center gap-2.5 rounded-control bg-raised px-3 text-left text-body font-[600] text-ink ring-1 ring-inset ring-line hover:bg-raised-2 hover:ring-line-strong',
            override && 'ring-light/60'
          )}
        >
          <Wallpaper className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">{cs.live.background}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px]">
        <div className="mb-2 text-small font-[600] text-ink-2">{cs.live.backgroundHint}</div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setOverride(null)}
            className={cn(
              'press grid aspect-video place-items-center rounded-control bg-raised text-meta font-[550] text-ink-2 ring-1 ring-inset ring-line hover:text-ink',
              !override && 'ring-2 ring-light text-ink'
            )}
          >
            {cs.live.backgroundTheme}
          </button>
          {media.map((m) => {
            const active = override && 'mediaId' in override && override.mediaId === m.id
            return (
              <button
                key={m.id}
                type="button"
                title={m.name}
                onClick={() => setOverride({ kind: m.kind, mediaId: m.id, fallbackColor: '#000000' })}
                className={cn(
                  'press relative aspect-video overflow-hidden rounded-control bg-black ring-1 ring-inset ring-line',
                  active && 'ring-2 ring-light'
                )}
              >
                {m.kind === 'image' ? (
                  <img src={mediaUrl(m)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={mediaUrl(m)} muted className="h-full w-full object-cover" preload="metadata" />
                )}
              </button>
            )
          })}
        </div>
        {media.length === 0 ? <p className="mt-2 text-small text-ink-3">{cs.plan.noMedia}</p> : null}
      </PopoverContent>
    </Popover>
  )
}

function AlertControl() {
  const alert = useLive((s) => s.alert)
  const showAlert = useLive((s) => s.showAlert)
  const [text, setText] = useState('')
  return (
    <div className="flex flex-col gap-2 border-t border-line p-4">
      <label htmlFor="live-alert" className="flex items-center gap-2 text-small font-[600] text-ink-2">
        <Megaphone className="size-4" aria-hidden />
        {cs.live.alert}
      </label>
      <div className="flex gap-2">
        <Input
          id="live-alert"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={cs.live.alertPlaceholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) showAlert(text)
          }}
        />
        {alert ? (
          <Button variant="live" onClick={() => showAlert(null)}>
            {cs.live.alertHide}
          </Button>
        ) : (
          <Button disabled={!text.trim()} onClick={() => showAlert(text)}>
            {cs.live.alertShow}
          </Button>
        )}
      </div>
    </div>
  )
}

function TimerControl() {
  const timer = useLive((s) => s.timer)
  const startTimer = useLive((s) => s.startTimer)
  const stopTimer = useLive((s) => s.stopTimer)
  const [minutes, setMinutes] = useState('5')
  const [label, setLabel] = useState<string>(cs.live.timerLabelDefault)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [timer])
  const remaining = timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0
  return (
    <div className="flex flex-col gap-2 border-t border-line p-4">
      <div className="flex items-center gap-2 text-small font-[600] text-ink-2">
        <Timer className="size-4" aria-hidden />
        {cs.live.timer}
        {timer ? (
          <span className="ml-auto tabular text-ink">
            {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
          </span>
        ) : null}
      </div>
      {timer ? (
        <Button variant="live" onClick={stopTimer}>
          {cs.live.timerStop}
        </Button>
      ) : (
        <div className="flex gap-2">
          <Input
            aria-label={cs.live.timerMinutes}
            type="number"
            min={1}
            max={180}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-20 tabular"
          />
          <Input aria-label={cs.live.timerLabel} value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button
            disabled={!(Number(minutes) > 0)}
            onClick={() => startTimer(Math.min(180, Number(minutes)), label.trim())}
          >
            {cs.live.timerStart}
          </Button>
        </div>
      )}
    </div>
  )
}

function OutputsStatus() {
  const [status, setStatus] = useState<OutputStatus[]>([])
  const outputs = useSettings((s) => s.settings.outputs)
  const openSettings = useUi((s) => s.openSettings)
  useEffect(() => {
    void api().output.status().then(setStatus)
    return api().output.onStatus(setStatus)
  }, [])
  return (
    <div className="mt-auto flex flex-col gap-1.5 border-t border-line p-4">
      <button
        type="button"
        onClick={() => openSettings('outputs')}
        className="flex items-center gap-2 text-small font-[600] text-ink-2 hover:text-ink"
      >
        <MonitorSmartphone className="size-4" aria-hidden />
        {cs.live.outputs}
      </button>
      {outputs.map((o) => {
        const st = status.find((s) => s.outputId === o.id)
        const state = st?.state ?? (o.enabled ? 'no-display' : 'disabled')
        return (
          <div
            key={o.id}
            className="flex items-center gap-2 text-small"
            data-testid={`output-status-${o.id}`}
          >
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                state === 'open' ? 'bg-light' : state === 'disabled' ? 'bg-ink-3/60' : 'bg-warn'
              )}
            />
            <span className="font-[550] text-ink">{o.name}</span>
            <span className="truncate text-ink-2">
              {state === 'open'
                ? cs.live.outputOpen(st?.displayLabel ?? '')
                : state === 'disabled'
                  ? cs.live.outputDisabled
                  : state === 'error'
                    ? cs.live.outputError
                    : cs.live.outputNoDisplay}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ShortcutsHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={cs.live.shortcuts}
          title={cs.live.shortcuts}
          className="press ml-auto grid size-7 place-items-center rounded-control text-ink-3 hover:bg-raised hover:text-ink"
        >
          <Keyboard className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px]">
        <div className="mb-2 text-small font-[650] text-ink">{cs.live.shortcuts}</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
          {cs.live.shortcutList.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-[550] text-ink">{k}</dt>
              <dd className="text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
