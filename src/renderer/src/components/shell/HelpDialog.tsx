import { CircleHelp } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { ShortcutList } from '@/components/common/ShortcutList'
import { cs } from '@/i18n/cs'

const Guide = lazy(() => import('./Guide'))

type HelpTab = 'quick' | 'guide'

/** Quick guide and the live shortcuts, one click (or F1) away from anywhere in the app. */
export function HelpButton() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<HelpTab>('quick')
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F1') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={cs.nav.help}
          title={`${cs.nav.help} (F1)`}
          className="press grid size-9 place-items-center rounded-control text-ink-2 hover:bg-raised hover:text-ink"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent title={cs.help.title} description={cs.help.description} wide>
        <Segmented
          aria-label={cs.help.title}
          value={tab}
          onChange={setTab}
          className="mb-5 [&>button]:h-8 [&>button]:px-3"
          options={[
            { value: 'quick', label: cs.help.quickTab },
            { value: 'guide', label: cs.help.guideTab }
          ]}
        />
        {tab === 'guide' ? (
          <Suspense fallback={null}>
            <Guide />
          </Suspense>
        ) : (
          <div className="grid gap-x-10 gap-y-8 md:grid-cols-[1fr_minmax(0,1.1fr)]">
            <section className="flex flex-col gap-4" aria-labelledby="help-steps">
              <h3 id="help-steps" className="text-body font-[650] text-ink">
                {cs.help.stepsTitle}
              </h3>
              <ol className="flex flex-col gap-3.5">
                {cs.help.steps.map(([title, text], i) => (
                  <li key={title} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
                    <span
                      aria-hidden
                      className="tabular grid size-7 place-items-center rounded-full bg-raised text-small font-[650] text-ink ring-1 ring-inset ring-line"
                    >
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <span className="text-body font-[600] text-ink">{title}</span>
                      <span className="text-small text-ink-2 [text-wrap:pretty]">{text}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex flex-col gap-1 border-t border-line pt-4">
                <span className="text-body font-[600] text-ink">{cs.help.importTitle}</span>
                <span className="text-small text-ink-2 [text-wrap:pretty]">{cs.help.importText}</span>
              </div>
              <button
                type="button"
                onClick={() => setTab('guide')}
                className="press self-start rounded-control text-small font-[550] text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
              >
                {cs.help.more}
              </button>
            </section>
            <section className="flex flex-col gap-4" aria-labelledby="help-keys">
              <h3 id="help-keys" className="text-body font-[650] text-ink">
                {cs.help.shortcutsTitle}
              </h3>
              <ShortcutList large />
              <p className="text-small text-ink-2">{cs.live.clickerNote}</p>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
