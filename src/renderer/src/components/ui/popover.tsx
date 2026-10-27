import { Popover as P } from 'radix-ui'
import { cn } from '@/lib/cn'

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverClose = P.Close

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: P.PopoverContentProps) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'overlay-enter z-50 rounded-card bg-panel p-3 shadow-overlay ring-1 ring-line focus:outline-none',
          className
        )}
        {...props}
      />
    </P.Portal>
  )
}
