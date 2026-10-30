import { cn } from '@/lib/cn'

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-chip bg-raised-2 px-1.5 font-sans text-meta font-[550] text-ink-2 ring-1 ring-inset ring-line',
        className
      )}
    >
      {children}
    </kbd>
  )
}
