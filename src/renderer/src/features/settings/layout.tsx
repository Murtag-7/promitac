import { cn } from '@/lib/cn'

/** Common page frame for settings panels. */
export function SettingsPage({
  title,
  hint,
  children,
  actions,
  wide
}: {
  title: string
  hint?: string
  children: React.ReactNode
  actions?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn('mx-auto flex flex-col gap-6 px-8 py-7', wide ? 'max-w-[1200px]' : 'max-w-[760px]')}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-screen font-[650] tracking-[-0.01em] text-ink">{title}</h2>
          {hint ? <p className="mt-1 max-w-[68ch] text-body text-ink-2 [text-wrap:pretty]">{hint}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

/** A titled group of settings rows. */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {title ? <h3 className="text-title font-[650] text-ink">{title}</h3> : null}
      <div className="flex flex-col divide-y divide-line rounded-card bg-panel ring-1 ring-inset ring-line">
        {children}
      </div>
    </section>
  )
}

/** One row: label (+hint) on the left, control on the right. */
export function SettingsRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <div className="text-body font-[550] text-ink">{label}</div>
        {hint ? <div className="mt-0.5 text-small text-ink-2">{hint}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
