import { DropdownMenu as M } from 'radix-ui'
import { cn } from '@/lib/cn'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'overlay-enter z-50 min-w-48 rounded-card bg-panel p-1 shadow-overlay ring-1 ring-line focus:outline-none',
          className
        )}
        {...props}
      />
    </M.Portal>
  )
}

export function MenuItem({ className, danger, ...props }: M.DropdownMenuItemProps & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex h-8 cursor-default select-none items-center gap-2 rounded-[6px] px-2.5 text-body outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-raised [&_svg]:size-4 [&_svg]:text-ink-2',
        danger ? 'text-danger data-[highlighted]:bg-danger/10 [&_svg]:text-danger' : 'text-ink',
        className
      )}
      {...props}
    />
  )
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <M.Label className="px-2.5 pb-1 pt-1.5 text-meta text-ink-3">{children}</M.Label>
}
