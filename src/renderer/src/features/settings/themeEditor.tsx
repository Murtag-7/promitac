import { Images } from 'lucide-react'
import { useId } from 'react'
import type { MediaItem } from '@core/media/model'
import type { Theme, ThemeBackground, ThemeText } from '@core/theme/model'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { mediaUrl } from '@/store/media'
import { useUi } from '@/store/ui'
import {
  ColorField,
  FontSelect,
  InlineRow,
  RowSegmented,
  SliderRow,
  StackRow,
  SwitchRow,
  ThemeGroup,
  WideSegmented
} from './themeControls'
import { switchBackground } from './themeUtils'

const t = cs.settings.themes

const round2 = (v: number): number => Math.round(v * 100) / 100
const decimal = (v: number): string =>
  v.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** All theme settings, grouped. Every change is applied immediately to the draft (live preview). */
export function ThemeEditor({
  theme,
  mediaItems,
  onChange
}: {
  theme: Theme
  mediaItems: MediaItem[]
  onChange: (next: Theme) => void
}) {
  const text = theme.text
  const setText = (patch: Partial<ThemeText>): void => onChange({ ...theme, text: { ...text, ...patch } })
  const setBg = (background: ThemeBackground): void => onChange({ ...theme, background })
  const bg = theme.background

  return (
    <div className="[column-gap:1.25rem] [columns:3_300px]">
      <ThemeGroup title={t.background}>
        <StackRow>
          <WideSegmented
            aria-label={t.bgKind}
            value={bg.kind}
            onChange={(kind) => setBg(switchBackground(bg, kind, mediaItems))}
            options={[
              { value: 'color', label: t.bgColor },
              { value: 'gradient', label: t.bgGradient },
              { value: 'image', label: t.bgImage },
              { value: 'video', label: t.bgVideo }
            ]}
          />
        </StackRow>
        {bg.kind === 'color' ? (
          <ColorField label={t.color} value={bg.color} onChange={(color) => setBg({ ...bg, color })} />
        ) : null}
        {bg.kind === 'gradient' ? (
          <>
            <ColorField label={t.colorFrom} value={bg.from} onChange={(from) => setBg({ ...bg, from })} />
            <ColorField label={t.colorTo} value={bg.to} onChange={(to) => setBg({ ...bg, to })} />
            <SliderRow
              label={t.angle}
              value={bg.angle}
              min={0}
              max={360}
              step={5}
              format={t.deg}
              onChange={(angle) => setBg({ ...bg, angle })}
            />
          </>
        ) : null}
        {bg.kind === 'image' || bg.kind === 'video' ? (
          <>
            <MediaPicker
              kind={bg.kind}
              selectedId={bg.mediaId}
              items={mediaItems}
              onPick={(mediaId) => setBg({ ...bg, mediaId })}
            />
            <SliderRow
              label={t.dim}
              value={Math.round(theme.dim * 100)}
              min={0}
              max={90}
              step={5}
              format={t.percent}
              onChange={(v) => onChange({ ...theme, dim: v / 100 })}
            />
            <ColorField
              label={t.fallbackColor}
              value={bg.fallbackColor}
              onChange={(fallbackColor) => setBg({ ...bg, fallbackColor })}
            />
          </>
        ) : null}
      </ThemeGroup>

      <ThemeGroup title={t.font}>
        <FontSelect value={text.font} onChange={(font) => setText({ font })} />
        <WeightRow theme={theme} onChange={(weight) => setText({ weight })} />
        <ColorField label={t.textColor} value={text.color} onChange={(color) => setText({ color })} />
        <SliderRow
          label={t.maxSize}
          value={text.maxSize}
          min={48}
          max={140}
          step={2}
          format={t.px}
          onChange={(maxSize) => setText({ maxSize, minSize: Math.min(text.minSize, maxSize) })}
        />
        <SwitchRow label={t.autoFit} checked={text.autoFit} onChange={(autoFit) => setText({ autoFit })} />
        {text.autoFit ? (
          <SliderRow
            label={t.minSize}
            value={Math.min(text.minSize, text.maxSize)}
            min={28}
            max={text.maxSize}
            step={2}
            format={t.px}
            onChange={(minSize) => setText({ minSize })}
          />
        ) : null}
        <SliderRow
          label={t.lineHeight}
          value={text.lineHeight}
          min={1}
          max={1.6}
          step={0.05}
          format={decimal}
          onChange={(v) => setText({ lineHeight: round2(v) })}
        />
        <SwitchRow
          label={t.uppercase}
          checked={text.uppercase}
          onChange={(uppercase) => setText({ uppercase })}
        />
      </ThemeGroup>

      <ThemeGroup title={t.align}>
        <InlineRow label={t.alignHorizontal}>
          <RowSegmented
            aria-label={t.alignHorizontal}
            value={text.align}
            onChange={(align) => setText({ align })}
            options={[
              { value: 'left', label: t.alignLeft },
              { value: 'center', label: t.alignCenter },
              { value: 'right', label: t.alignRight }
            ]}
          />
        </InlineRow>
        <InlineRow label={t.alignVertical}>
          <RowSegmented
            aria-label={t.alignVertical}
            value={text.vAlign}
            onChange={(vAlign) => setText({ vAlign })}
            options={[
              { value: 'top', label: t.vTop },
              { value: 'center', label: t.vCenter },
              { value: 'bottom', label: t.vBottom }
            ]}
          />
        </InlineRow>
        <SliderRow
          label={t.safeMargin}
          value={theme.safeMargin}
          min={2}
          max={15}
          step={0.5}
          format={(v) => t.percent(Number(v.toFixed(1)))}
          onChange={(safeMargin) => onChange({ ...theme, safeMargin })}
        />
      </ThemeGroup>

      <ThemeGroup title={t.effects}>
        <SliderRow
          label={t.shadow}
          value={Math.round(text.shadow * 100)}
          min={0}
          max={100}
          step={5}
          format={t.percent}
          onChange={(v) => setText({ shadow: v / 100 })}
        />
        <SliderRow
          label={t.outline}
          value={text.outline}
          min={0}
          max={6}
          step={0.5}
          format={(v) => t.px(Number(v.toFixed(1)))}
          onChange={(outline) => setText({ outline })}
        />
        {text.outline > 0 ? (
          <ColorField
            label={t.outlineColor}
            value={text.outlineColor}
            onChange={(outlineColor) => setText({ outlineColor })}
          />
        ) : null}
      </ThemeGroup>

      <ThemeGroup title={t.footerGroup}>
        <SwitchRow
          label={t.footerShowLabel}
          checked={theme.footer.show}
          onChange={(show) => onChange({ ...theme, footer: { ...theme.footer, show } })}
        />
        {theme.footer.show ? (
          <>
            <InlineRow label={t.footerPosition}>
              <RowSegmented
                aria-label={t.footerPosition}
                value={theme.footer.position}
                onChange={(position) => onChange({ ...theme, footer: { ...theme.footer, position } })}
                options={[
                  { value: 'top', label: t.footerTop },
                  { value: 'bottom', label: t.footerBottom }
                ]}
              />
            </InlineRow>
            <SliderRow
              label={t.footerSize}
              value={theme.footer.size}
              min={20}
              max={48}
              step={1}
              format={t.px}
              onChange={(size) => onChange({ ...theme, footer: { ...theme.footer, size } })}
            />
          </>
        ) : null}
      </ThemeGroup>

      <ThemeGroup title={t.transition}>
        <InlineRow label={t.transitionKind}>
          <RowSegmented
            aria-label={t.transitionKind}
            value={theme.transition.kind}
            onChange={(kind) =>
              onChange({
                ...theme,
                transition: {
                  kind,
                  durationMs:
                    kind === 'fade' && theme.transition.durationMs === 0 ? 280 : theme.transition.durationMs
                }
              })
            }
            options={[
              { value: 'fade', label: t.fade },
              { value: 'none', label: t.noTransition }
            ]}
          />
        </InlineRow>
        {theme.transition.kind === 'fade' ? (
          <SliderRow
            label={t.duration}
            value={theme.transition.durationMs}
            min={0}
            max={1000}
            step={20}
            format={t.ms}
            onChange={(durationMs) => onChange({ ...theme, transition: { ...theme.transition, durationMs } })}
          />
        ) : null}
      </ThemeGroup>
    </div>
  )
}

const WEIGHTS: Array<{ value: number; label: string }> = [
  { value: 400, label: t.weightRegular },
  { value: 500, label: t.weightMedium },
  { value: 600, label: t.weightSemibold },
  { value: 700, label: t.weightBold }
]

function WeightRow({ theme, onChange }: { theme: Theme; onChange: (w: number) => void }) {
  const id = useId()
  // Themes may carry an in-between weight (e.g. 560) – highlight the nearest option.
  const nearest = WEIGHTS.reduce((best, w) =>
    Math.abs(w.value - theme.text.weight) < Math.abs(best.value - theme.text.weight) ? w : best
  )
  return (
    <StackRow label={t.weight} labelId={id}>
      <WideSegmented
        aria-label={t.weight}
        value={String(nearest.value)}
        onChange={(v) => onChange(Number(v))}
        options={WEIGHTS.map((w) => ({
          value: String(w.value),
          label: <span style={{ fontWeight: w.value }}>{w.label}</span>
        }))}
      />
    </StackRow>
  )
}

function MediaPicker({
  kind,
  selectedId,
  items,
  onPick
}: {
  kind: 'image' | 'video'
  selectedId: string
  items: MediaItem[]
  onPick: (id: string) => void
}) {
  const setView = useUi((s) => s.setView)
  const list = items.filter((m) => m.kind === kind)
  const label = kind === 'image' ? t.mediaImages : t.mediaVideos

  if (list.length === 0) {
    return (
      <StackRow>
        <div className="flex items-start gap-3 py-1">
          <div className="grid size-9 shrink-0 place-items-center rounded-control bg-raised text-ink-2 ring-1 ring-inset ring-line">
            <Images className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="flex min-w-0 flex-col items-start gap-2">
            <p className="text-small text-ink-2 [text-wrap:pretty]">
              <span className="text-ink">{kind === 'image' ? t.noImages : t.noVideos}</span> {t.addMediaHint}
            </p>
            <Button size="sm" variant="secondary" onClick={() => setView('media')}>
              {t.openMedia}
            </Button>
          </div>
        </div>
      </StackRow>
    )
  }

  const hasSelection = list.some((m) => m.id === selectedId)
  return (
    <StackRow>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {list.map((m) => {
          const selected = m.id === selectedId
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={m.name}
              title={m.name}
              onClick={() => onPick(m.id)}
              className={cn(
                'press relative aspect-video overflow-hidden rounded-[6px] bg-raised ring-1 ring-line hover:ring-line-strong',
                selected && 'ring-2 ring-light hover:ring-light'
              )}
            >
              {m.kind === 'image' ? (
                <img src={mediaUrl(m)} alt="" draggable={false} className="size-full object-cover" />
              ) : (
                <video
                  src={mediaUrl(m)}
                  muted
                  preload="metadata"
                  playsInline
                  className="pointer-events-none size-full object-cover"
                />
              )}
            </button>
          )
        })}
      </div>
      {!hasSelection ? <p className="text-small text-ink-2">{t.pickMedia}</p> : null}
    </StackRow>
  )
}
