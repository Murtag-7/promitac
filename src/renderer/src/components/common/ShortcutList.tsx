import { Fragment } from 'react'
import { Kbd } from '@/components/ui/kbd'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'

/** The live keyboard shortcuts as key caps; shared by the live sidebar popover and the help dialog. */
export function ShortcutList({ large, className }: { large?: boolean; className?: string }) {
  const cap = large ? 'h-6 min-w-6 text-small text-ink' : 'text-ink'
  return (
    <dl
      className={cn(
        'grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-4 text-small',
        large ? 'gap-y-2.5' : 'gap-y-1.5',
        className
      )}
    >
      {cs.live.shortcutList.map(([alternatives, label]) => (
        <div key={label} className="contents">
          <dt className="flex flex-wrap items-center gap-1">
            {alternatives.map((combo, i) => (
              <Fragment key={combo.join('+')}>
                {i > 0 ? <span className="text-meta text-ink-3">/</span> : null}
                {combo.map((key, j) => (
                  <Fragment key={key}>
                    {j > 0 ? <span className="text-meta text-ink-3">+</span> : null}
                    <Kbd className={cap}>{key}</Kbd>
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </dt>
          <dd className="self-center text-ink-2">{label}</dd>
        </div>
      ))}
    </dl>
  )
}
