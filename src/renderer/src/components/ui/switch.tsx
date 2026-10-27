import { Switch as S } from 'radix-ui'
import { cn } from '@/lib/cn'

export function Switch({ className, ...props }: S.SwitchProps) {
  return (
    <S.Root
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-raised-2 ring-1 ring-inset ring-line-strong transition-colors duration-150 data-[state=checked]:bg-light data-[state=checked]:ring-light disabled:opacity-50',
        className
      )}
      {...props}
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-ink shadow transition-transform duration-150 ease-[var(--ease-out)] data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-light-ink" />
    </S.Root>
  )
}
