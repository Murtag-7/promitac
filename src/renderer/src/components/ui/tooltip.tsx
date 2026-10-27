import { Tooltip as T } from 'radix-ui'

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <T.Provider delayDuration={500} skipDelayDuration={300}>
    {children}
  </T.Provider>
)

export function Tip({
  label,
  children,
  side = 'bottom'
}: {
  label: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="overlay-enter z-50 flex items-center gap-2 rounded-[6px] bg-raised-2 px-2 py-1 text-small text-ink shadow-overlay ring-1 ring-line"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
