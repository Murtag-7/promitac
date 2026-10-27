import { Select as S } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { FONTS, type FontId } from '@core/theme/model'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { isFullHex, normalizeHex } from './themeUtils'

/** One titled block of theme settings (rows separated by hairlines). */
export function ThemeGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mb-6 break-inside-avoid">
      <h3 id={id} className="mb-2 px-0.5 text-title font-[650] tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <div className="flex flex-col divide-y divide-line rounded-card bg-panel ring-1 ring-inset ring-line">
        {children}
      </div>
    </section>
  )
}

const rowLabel = 'text-body font-[550] text-ink-2'

/** Label on the left, compact control on the right. */
export function InlineRow({
  label,
  htmlFor,
  labelId,
  children,
  className
}: {
  label: string
  htmlFor?: string
  labelId?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 px-3.5 py-2', className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} id={labelId} className={cn(rowLabel, 'min-w-0')}>
          {label}
        </label>
      ) : (
        <span id={labelId} className={cn(rowLabel, 'min-w-0')}>
          {label}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Label above, full-width control below (wide segmented controls, media grid). */
export function StackRow({
  label,
  labelId,
  children
}: {
  label?: string
  labelId?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3">
      {label ? (
        <span id={labelId} className={rowLabel}>
          {label}
        </span>
      ) : null}
      {children}
    </div>
  )
}

/** Segmented control that fills its row, with 32 px tall options. */
export function WideSegmented<T extends string>(props: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: React.ReactNode; title?: string }>
  'aria-label': string
}) {
  return <Segmented {...props} className="flex w-full [&>button]:h-8 [&>button]:flex-1 [&>button]:px-2" />
}

/** Segmented control sized for an inline row. */
export function RowSegmented<T extends string>(props: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: React.ReactNode; title?: string }>
  'aria-label': string
}) {
  return <Segmented {...props} className="[&>button]:h-8" />
}

/** Label · slider · value, in one line. The slider updates the preview on every step. */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const id = useId()
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="grid min-h-12 grid-cols-[minmax(0,1.15fr)_minmax(104px,1fr)_3.5rem] items-center gap-3 px-3.5 py-1.5"
    >
      <span id={id} className={rowLabel}>
        {label}
      </span>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onChange}
        aria-label={label}
        className="h-8 cursor-default"
      />
      <span className="tabular text-right text-small text-ink" aria-hidden>
        {format(value)}
      </span>
    </div>
  )
}

/** Switch row – the whole label toggles the switch. */
export function SwitchRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <InlineRow label={label} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </InlineRow>
  )
}

/** System colour picker + editable hex code. Typing applies once the code is complete. */
export function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const safe = normalizeHex(value) ?? '#000000'
  const [text, setText] = useState(safe)

  useEffect(() => {
    // Follow outside changes (picker, switching themes) but never fight the user while typing.
    if (document.activeElement !== inputRef.current) setText(safe)
  }, [safe])

  const commit = (): void => {
    const n = normalizeHex(text)
    if (n && n !== safe) onChange(n)
    setText(n ?? safe)
  }

  return (
    <InlineRow label={label} htmlFor={id}>
      <input
        type="color"
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        aria-label={cs.settings.themes.pickColor(label)}
        className="press size-9 shrink-0 cursor-default appearance-none rounded-control border-0 bg-raised p-1 ring-1 ring-inset ring-line hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light [&::-webkit-color-swatch]:rounded-[4px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <Input
        ref={inputRef}
        id={id}
        value={text}
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        aria-invalid={normalizeHex(text) ? undefined : true}
        onChange={(e) => {
          setText(e.target.value)
          if (isFullHex(e.target.value)) {
            const n = normalizeHex(e.target.value)
            if (n) onChange(n)
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setText(safe)
        }}
        className="tabular w-[92px] font-[500] aria-[invalid]:ring-danger/70"
      />
    </InlineRow>
  )
}

/** Font picker whose options are shown in their own typeface. */
export function FontSelect({ value, onChange }: { value: FontId; onChange: (v: FontId) => void }) {
  const id = useId()
  const ids = Object.keys(FONTS) as FontId[]
  return (
    <InlineRow label={cs.settings.themes.font} labelId={id}>
      <S.Root value={value} onValueChange={(v) => onChange(v as FontId)}>
        <S.Trigger
          aria-labelledby={id}
          className="press inline-flex h-9 w-[184px] items-center justify-between gap-2 rounded-control bg-raised px-3 text-left text-body text-ink ring-1 ring-inset ring-line hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light"
        >
          <S.Value />
          <S.Icon>
            <ChevronDown className="size-4 text-ink-2" aria-hidden />
          </S.Icon>
        </S.Trigger>
        <S.Portal>
          <S.Content
            position="popper"
            sideOffset={6}
            className="overlay-enter z-50 max-h-[min(var(--radix-select-content-available-height),360px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card bg-panel p-1 shadow-overlay ring-1 ring-line"
          >
            <S.Viewport>
              {ids.map((f) => (
                <S.Item
                  key={f}
                  value={f}
                  className="relative flex h-9 cursor-default select-none items-center rounded-[6px] pl-8 pr-3 text-[15px] text-ink outline-none data-[highlighted]:bg-raised"
                >
                  <S.ItemIndicator className="absolute left-2.5">
                    <Check className="size-4" aria-hidden />
                  </S.ItemIndicator>
                  <S.ItemText>
                    <span style={{ fontFamily: FONTS[f].css }}>{FONTS[f].label}</span>
                  </S.ItemText>
                </S.Item>
              ))}
            </S.Viewport>
          </S.Content>
        </S.Portal>
      </S.Root>
    </InlineRow>
  )
}
