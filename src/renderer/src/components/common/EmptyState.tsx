import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Empty states teach the next action instead of saying "nothing here". */
export function EmptyState({
  icon: Icon,
  title,
  text,
  children,
  className
}: {
  icon?: LucideIcon
  title: string
  text?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex h-full flex-col items-center justify-center px-8 text-center', className)}>
      {Icon ? (
        <div className="mb-4 grid size-12 place-items-center rounded-panel bg-raised text-ink-2 ring-1 ring-inset ring-line">
          <Icon className="size-6" strokeWidth={1.5} aria-hidden />
        </div>
      ) : null}
      <h2 className="text-title font-[650] text-ink">{title}</h2>
      {text ? <p className="mt-1.5 max-w-[46ch] text-body text-ink-2 [text-wrap:pretty]">{text}</p> : null}
      {children ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}
