import { CircleCheck, Loader2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { forwardRef, useId, useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'

/** Button that shows a spinner (only inside itself) while its action runs. */
export const BusyButton = forwardRef<HTMLButtonElement, ButtonProps & { busy?: boolean; icon?: LucideIcon }>(
  ({ busy, icon: Icon, children, disabled, className, ...props }, ref) => (
    <Button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(busy && 'disabled:opacity-100', className)}
      {...props}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
      {children}
    </Button>
  )
)
BusyButton.displayName = 'BusyButton'

/** Result of a server action shown inline where it happened. */
export function InlineError({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-control bg-warn-soft px-3 py-2.5 text-small text-ink',
        className
      )}
    >
      <TriangleAlert className="mt-px size-4 shrink-0 text-warn" strokeWidth={1.9} aria-hidden />
      <span className="[overflow-wrap:anywhere] [text-wrap:pretty]">{children}</span>
    </div>
  )
}

export function InlineSuccess({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-control bg-raised px-3 py-2.5 text-small text-ink ring-1 ring-inset ring-line',
        className
      )}
    >
      <CircleCheck className="mt-px size-4 shrink-0 text-ink-2" strokeWidth={1.9} aria-hidden />
      <span className="[text-wrap:pretty]">{children}</span>
    </div>
  )
}

/** Labelled text input with an optional hint and a field-level validation message. */
export const TextField = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }
>(({ label, hint, error, className, id: idProp, ...props }, ref) => {
  const auto = useId()
  const id = idProp ?? auto
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-small font-[550] text-ink-2">
        {label}
      </label>
      <Input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(error && 'ring-danger/70 hover:ring-danger')}
        {...props}
      />
      {error ? (
        <span id={errorId} className="text-small text-danger">
          {error}
        </span>
      ) : null}
      {hint ? (
        <span id={hintId} className="text-meta text-ink-3 [text-wrap:pretty]">
          {hint}
        </span>
      ) : null}
    </div>
  )
})
TextField.displayName = 'TextField'

/** Confirmation dialog for actions that cannot be undone from here. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  confirmLabel,
  danger,
  onConfirm
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  text: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={text}>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{cs.common.cancel}</Button>
          </DialogClose>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Track one async action: busy flag + inline error text. */
export function useAction(): {
  busy: boolean
  error: string | null
  setError: (e: string | null) => void
  run: (fn: () => Promise<string | null>) => Promise<boolean>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<string | null>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const err = await fn()
      setError(err)
      return err === null
    } catch (e) {
      setError(errorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

/** Human readable error text (strips Electron's IPC wrapper). */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const clean = raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '').trim()
  return clean || cs.sync.actionFailed
}

/** Validates the Supabase project URL (https; plain http only for a local development server). */
export function isValidSupabaseUrl(input: string): boolean {
  try {
    const u = new URL(input.trim())
    if (!u.hostname) return false
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)
  } catch {
    return false
  }
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
}

export function formatDateTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
