import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const field =
  'w-full rounded-control bg-raised text-ink ring-1 ring-inset ring-line placeholder:text-ink-3 hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(field, 'h-9 px-3 text-body', className)} {...props} />
  )
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(field, 'min-h-24 resize-y px-3 py-2 text-body', className)}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-small font-[550] text-ink-2', className)} {...props} />
}

export function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-small font-[550] text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-meta text-ink-3">{hint}</span> : null}
    </div>
  )
}
