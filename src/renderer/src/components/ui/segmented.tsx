import { cn } from '@/lib/cn'

/** Small segmented control for 2–5 mutually exclusive options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  'aria-label': ariaLabel
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: React.ReactNode; title?: string }>
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-control bg-raised p-0.5 ring-1 ring-inset ring-line', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'press h-7 rounded-[5px] px-2.5 text-small font-[550] text-ink-2 hover:text-ink',
            value === o.value && 'bg-raised-2 text-ink shadow-sm ring-1 ring-inset ring-line-strong'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
