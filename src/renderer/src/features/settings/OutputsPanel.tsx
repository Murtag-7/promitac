import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, MonitorOff, Plus, ScanEye, Trash2 } from 'lucide-react'
import type { OutputFrame } from '@core/live/frame'
import type { OutputConfig } from '@core/settings/model'
import { newId } from '@core/util/id'
import type { DisplayInfo, OutputStatus } from '@shared/api'
import { api } from '@/api/client'
import { ProjectionView } from '@/components/projection/ProjectionView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tip } from '@/components/ui/tooltip'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { latestFrame, onLocalFrame } from '@/live/engine'
import { useSettings } from '@/store/settings'
import { useThemes } from '@/store/themes'
import { SettingsGroup, SettingsPage, SettingsRow } from './layout'
import {
  activeDisplayId,
  autoDisplay,
  displayMap,
  newOutput,
  outputState,
  resolveDisplay,
  STATE_DOT
} from './outputsModel'
import { useOutputTest } from './outputsTest'
import { SWITCH_HIT } from './generalControls'

const t = cs.settings.outputs
const SAME_THEME = '__same__'

function useDisplays(): { displays: DisplayInfo[]; loaded: boolean } {
  const [state, setState] = useState<{ displays: DisplayInfo[]; loaded: boolean }>({
    displays: [],
    loaded: false
  })
  useEffect(() => {
    let alive = true
    api()
      .displays.list()
      .then((displays) => alive && setState({ displays, loaded: true }))
      .catch(() => alive && setState({ displays: [], loaded: true }))
    const off = api().displays.onChange((displays) => setState({ displays, loaded: true }))
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

function useOutputStatus(): [OutputStatus[], (s: OutputStatus[]) => void] {
  const [status, setStatus] = useState<OutputStatus[]>([])
  useEffect(() => {
    let alive = true
    void api()
      .output.status()
      .then((s) => alive && setStatus(s))
    const off = api().output.onStatus(setStatus)
    return () => {
      alive = false
      off()
    }
  }, [])
  return [status, setStatus]
}

function useLiveFrame(): OutputFrame | null {
  const [frame, setFrame] = useState<OutputFrame | null>(() => latestFrame())
  useEffect(() => onLocalFrame(setFrame), [])
  return frame
}

function displayLabel(d: DisplayInfo): string {
  const tags = [d.primary ? t.primary : null, d.isControl ? t.control : null].filter(Boolean)
  const res = t.resolution(d.bounds.width, d.bounds.height)
  return `${d.label} · ${res}${tags.length ? ` (${tags.join(', ')})` : ''}`
}

function statusText(state: OutputStatus['state'], label: string | null): string {
  if (state === 'open') return cs.live.outputOpen(label ?? '')
  if (state === 'disabled') return cs.live.outputDisabled
  if (state === 'error') return cs.live.outputError
  return cs.live.outputNoDisplay
}

export function OutputsPanel() {
  const outputs = useSettings((s) => s.settings.outputs)
  const { displays, loaded } = useDisplays()
  const [status, setStatus] = useOutputStatus()
  const testing = useOutputTest((s) => s.testingId)
  const { start: startTest, stop: stopTest } = useOutputTest.getState()

  const commit = async (next: OutputConfig[]): Promise<void> => {
    try {
      await useSettings.getState().update({ outputs: next })
      setStatus(await api().output.refresh())
    } catch (err) {
      console.error(err)
      toast.error(cs.common.error)
    }
  }

  const change = (id: string, patch: Partial<OutputConfig>): void => {
    void commit(outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }

  const add = (): void => {
    void commit([...outputs, newOutput(outputs, displays, newId(), t.newName)])
  }

  const remove = (id: string): void => {
    if (outputs.length <= 1) return
    if (testing === id) stopTest()
    void commit(outputs.filter((o) => o.id !== id))
  }

  return (
    <SettingsPage title={t.title} hint={t.hint}>
      <DisplayMapGroup displays={displays} loaded={loaded} outputs={outputs} status={status} />
      <section className="flex flex-col gap-3" aria-label={t.outputsTitle}>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-title font-[650] text-ink">{t.outputsTitle}</h3>
          <Button size="sm" onClick={add}>
            <Plus aria-hidden />
            {t.addOutput}
          </Button>
        </div>
        {outputs.map((o) => (
          <OutputCard
            key={o.id}
            output={o}
            status={status.find((s) => s.outputId === o.id)}
            displays={displays}
            canRemove={outputs.length > 1}
            testing={testing === o.id}
            onChange={(patch) => change(o.id, patch)}
            onRemove={() => remove(o.id)}
            onTest={() => (testing === o.id ? stopTest() : startTest(o.id, t.testLabel(o.name)))}
          />
        ))}
      </section>
    </SettingsPage>
  )
}

function DisplayMapGroup({
  displays,
  loaded,
  outputs,
  status
}: {
  displays: DisplayInfo[]
  loaded: boolean
  outputs: OutputConfig[]
  status: OutputStatus[]
}) {
  const onlyOne = loaded && displays.length === 1
  return (
    <SettingsGroup title={t.displaysTitle}>
      <div className="flex flex-col gap-3 p-4">
        {loaded && displays.length === 0 ? (
          <p className="text-body text-ink-2">{t.noDisplays}</p>
        ) : (
          <DisplayMap displays={displays} outputs={outputs} status={status} />
        )}
        {onlyOne ? (
          <p className="flex items-start gap-2 text-small text-warn" role="note">
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
            <span className="[text-wrap:pretty]">{t.singleDisplay}</span>
          </p>
        ) : (
          <p className="text-small text-ink-2">{t.mapHint}</p>
        )}
      </div>
    </SettingsGroup>
  )
}

const MAP_HEIGHT = 132
const MAP_GAP = 6

function DisplayMap({
  displays,
  outputs,
  status
}: {
  displays: DisplayInfo[]
  outputs: OutputConfig[]
  status: OutputStatus[]
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [hostWidth, setHostWidth] = useState(0)
  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const update = (): void => setHostWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const map = useMemo(() => displayMap(displays), [displays])
  const scale = map.width && hostWidth ? Math.min(hostWidth / map.width, MAP_HEIGHT / map.height) : 0
  const boxW = map.width * scale
  const boxH = map.height * scale

  // Which outputs are on which display right now.
  const onDisplay = new Map<number, string[]>()
  for (const o of outputs) {
    const id = activeDisplayId(
      o,
      status.find((s) => s.outputId === o.id),
      displays
    )
    if (id !== null) onDisplay.set(id, [...(onDisplay.get(id) ?? []), o.name])
  }

  return (
    <div
      ref={hostRef}
      className="flex w-full items-center justify-center"
      style={{ height: MAP_HEIGHT }}
      data-testid="display-map"
    >
      {scale > 0 ? (
        <ul aria-label={t.mapLabel} className="relative" style={{ width: boxW, height: boxH }}>
          {displays.map((d, i) => {
            const r = map.rects[i]
            if (!r) return null
            const names = onDisplay.get(d.id) ?? []
            const active = names.length > 0
            const h = r.height * boxH - MAP_GAP
            return (
              <li
                key={d.id}
                data-active={active || undefined}
                className={cn(
                  'absolute flex flex-col overflow-hidden rounded-[8px] p-2.5 transition-[background-color,box-shadow] duration-150',
                  active
                    ? 'bg-raised-2 ring-2 ring-inset ring-light'
                    : 'bg-raised ring-1 ring-inset ring-line-strong'
                )}
                style={{
                  left: r.left * boxW + MAP_GAP / 2,
                  top: r.top * boxH + MAP_GAP / 2,
                  width: r.width * boxW - MAP_GAP,
                  height: h
                }}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-small font-[550] text-ink">{d.label}</span>
                  <span
                    aria-hidden
                    className="grid size-5 shrink-0 place-items-center rounded-chip bg-bg/60 text-meta font-[650] tabular text-ink-2"
                  >
                    {i + 1}
                  </span>
                </div>
                {h > 64 ? (
                  <div className="mt-0.5 truncate text-meta tabular text-ink-2">
                    {t.resolution(d.bounds.width, d.bounds.height)}
                    {d.isControl ? ` · ${t.control}` : d.primary ? ` · ${t.primary}` : ''}
                  </div>
                ) : null}
                {active ? (
                  <div className="mt-auto flex min-w-0 flex-wrap gap-1">
                    {names.map((n) => (
                      <span
                        key={n}
                        className="max-w-full truncate rounded-chip bg-light px-1.5 py-px text-meta font-[600] text-light-ink"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function OutputCard({
  output,
  status,
  displays,
  canRemove,
  testing,
  onChange,
  onRemove,
  onTest
}: {
  output: OutputConfig
  status: OutputStatus | undefined
  displays: DisplayInfo[]
  canRemove: boolean
  testing: boolean
  onChange: (patch: Partial<OutputConfig>) => void
  onRemove: () => void
  onTest: () => void
}) {
  const themes = useThemes((s) => s.themes)
  const state = outputState(output, status)
  const fieldId = `output-name-${output.id}`

  const displayOptions = useMemo(() => {
    const opts = [
      { value: 'auto', label: t.auto },
      ...displays.map((d) => ({ value: String(d.id), label: displayLabel(d) }))
    ]
    if (output.displayId !== 'auto' && !displays.some((d) => d.id === output.displayId)) {
      opts.push({ value: String(output.displayId), label: t.missingDisplay })
    }
    return opts
  }, [displays, output.displayId])

  const themeOptions = useMemo(
    () => [
      { value: SAME_THEME, label: t.themeSame },
      ...themes.map((th) => ({ value: th.id, label: th.name }))
    ],
    [themes]
  )
  const themeValue =
    output.themeId && themes.some((th) => th.id === output.themeId) ? output.themeId : SAME_THEME

  const resolved = resolveDisplay(output, displays)
  const missing = output.displayId !== 'auto' && !resolved
  const displayHint =
    output.displayId === 'auto'
      ? (() => {
          const a = autoDisplay(displays)
          return a ? t.autoNow(a.label) : t.autoNone
        })()
      : missing
        ? cs.live.outputNoDisplay
        : undefined

  return (
    <SettingsGroup>
      <div className="flex items-center gap-4 px-4 py-3.5" data-testid={`output-card-${output.id}`}>
        <OutputPreview output={output} off={state === 'disabled'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-title font-[650] text-ink">{output.name}</div>
          <div className="mt-1 flex items-center gap-2 text-small" data-testid={`output-state-${output.id}`}>
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATE_DOT[state])} />
            <span className="truncate text-ink-2">{statusText(state, status?.displayLabel ?? null)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tip label={t.testHint}>
            <Button
              size="sm"
              variant={testing ? 'primary' : 'secondary'}
              aria-pressed={testing}
              disabled={!output.enabled}
              onClick={onTest}
            >
              <ScanEye aria-hidden />
              {testing ? t.testStop : t.test}
            </Button>
          </Tip>
          {canRemove ? (
            <Tip label={t.removeOutput}>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`${t.removeOutput} ${output.name}`}
                className="hover:bg-danger/10 hover:text-danger"
                onClick={onRemove}
              >
                <Trash2 aria-hidden />
              </Button>
            </Tip>
          ) : null}
        </div>
      </div>

      <SettingsRow label={t.name}>
        <NameInput id={fieldId} value={output.name} onCommit={(name) => onChange({ name })} />
      </SettingsRow>
      <SettingsRow label={t.enabled} hint={t.enabledHint}>
        <Switch
          className={SWITCH_HIT}
          aria-label={`${t.enabled}: ${output.name}`}
          checked={output.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </SettingsRow>
      <SettingsRow label={t.display} hint={displayHint}>
        <Select
          aria-label={`${t.display}: ${output.name}`}
          className="w-[300px]"
          value={String(output.displayId)}
          options={displayOptions}
          onValueChange={(v) => onChange({ displayId: v === 'auto' ? 'auto' : Number(v) })}
        />
      </SettingsRow>
      <SettingsRow label={t.windowed}>
        <Switch
          className={SWITCH_HIT}
          aria-label={`${t.windowed}: ${output.name}`}
          checked={output.windowed}
          onCheckedChange={(windowed) => onChange({ windowed })}
        />
      </SettingsRow>
      <SettingsRow label={t.theme} hint={t.themeHint}>
        <Select
          aria-label={`${t.theme}: ${output.name}`}
          className="w-[300px]"
          value={themeValue}
          options={themeOptions}
          onValueChange={(v) => onChange({ themeId: v === SAME_THEME ? undefined : v })}
        />
      </SettingsRow>
    </SettingsGroup>
  )
}

/** Name field that saves on blur / Enter and reverts on Escape or when left empty. */
function NameInput({ id, value, onCommit }: { id: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const save = (): void => {
    const v = draft.trim()
    if (!v) setDraft(value)
    else if (v !== value) onCommit(v)
  }
  return (
    <Input
      id={id}
      aria-label={t.name}
      className="w-[300px]"
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
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

/** What this output shows right now (with its own theme when set). */
function OutputPreview({ output, off }: { output: OutputConfig; off: boolean }) {
  const frame = useLiveFrame()
  const themes = useThemes((s) => s.themes)
  const shown = useMemo(() => {
    if (!frame || !output.themeId) return frame
    const theme = themes.find((th) => th.id === output.themeId)
    return theme ? { ...frame, theme } : frame
  }, [frame, output.themeId, themes])
  return (
    <div className="relative w-[152px] shrink-0 overflow-hidden rounded-[7px] ring-1 ring-line">
      <ProjectionView
        frame={shown}
        mode="preview"
        className={cn('aspect-video w-full transition-opacity duration-150', off && 'opacity-30')}
        label={t.preview(output.name)}
      />
      {off ? (
        <div className="absolute inset-0 grid place-items-center text-ink-2">
          <MonitorOff className="size-5" aria-hidden />
        </div>
      ) : null}
    </div>
  )
}
