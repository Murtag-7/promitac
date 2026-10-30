import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { cs } from '@/i18n/cs'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({
  title,
  description,
  children,
  className,
  wide
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <D.Portal>
      <D.Overlay className="fade-enter fixed inset-0 z-40 bg-black/55" />
      <D.Content
        className={cn(
          'dialog-enter fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-panel bg-panel shadow-overlay ring-1 ring-line focus:outline-none',
          wide && 'w-[min(94vw,980px)]',
          className
        )}
        aria-describedby={description ? undefined : undefined}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <div className="flex flex-col gap-1">
            <D.Title className="text-title font-[650] text-ink">{title}</D.Title>
            {description ? (
              <D.Description className="text-small text-ink-2">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="press -mr-2 -mt-1 grid size-8 place-items-center rounded-control text-ink-2 hover:bg-raised hover:text-ink"
            aria-label={cs.common.close}
          >
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 overflow-auto px-5 pb-5 pt-2">{children}</div>
      </D.Content>
    </D.Portal>
  )
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>
}
