import { Select as S } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  className,
  placeholder,
  disabled,
  'aria-label': ariaLabel
}: {
  value: T | undefined
  onValueChange: (v: T) => void
  options: SelectOption<T>[]
  className?: string
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
      <S.Trigger
        aria-label={ariaLabel}
        className={cn(
          'press inline-flex h-9 w-full items-center justify-between gap-2 rounded-control bg-raised px-3 text-left text-body text-ink ring-1 ring-inset ring-line hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light disabled:opacity-50',
          className
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-ink-2" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="overlay-enter z-50 max-h-[min(var(--radix-select-content-available-height),360px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card bg-panel p-1 shadow-overlay ring-1 ring-line"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-default select-none items-center rounded-[6px] pl-8 pr-3 text-body text-ink outline-none data-[highlighted]:bg-raised"
              >
                <S.ItemIndicator className="absolute left-2.5">
                  <Check className="size-4" />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
