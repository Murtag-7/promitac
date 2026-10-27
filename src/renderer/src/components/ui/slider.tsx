import { Slider as S } from 'radix-ui'
import { cn } from '@/lib/cn'

export function Slider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  className,
  'aria-label': ariaLabel
}: {
  value: number
  onValueChange: (v: number) => void
  min: number
  max: number
  step?: number
  className?: string
  'aria-label'?: string
}) {
  return (
    <S.Root
      value={[value]}
      onValueChange={(v) => onValueChange(v[0] ?? value)}
      min={min}
      max={max}
      step={step}
      className={cn('relative flex h-5 w-full touch-none select-none items-center', className)}
    >
      <S.Track className="relative h-1 grow overflow-hidden rounded-full bg-raised-2">
        <S.Range className="absolute h-full bg-light" />
      </S.Track>
      <S.Thumb
        aria-label={ariaLabel}
        className="block size-4 rounded-full bg-light shadow ring-4 ring-transparent transition-shadow hover:ring-light/15 focus-visible:outline-none focus-visible:ring-light/30"
      />
    </S.Root>
  )
}
