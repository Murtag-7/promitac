import { useEffect, useRef, useState } from 'react'
import { Search, Trash2, TriangleAlert } from 'lucide-react'
import type { BibleTranslationInfo } from '@core/bible/model'
import { parseReference } from '@core/bible/reference'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tip } from '@/components/ui/tooltip'
import { cs } from '@/i18n/cs'
import { useBibleView } from './viewStore'

const ERROR_DELAY_MS = 700

/** Reference field (parsed live) + translation picker. */
export function ReferenceBar({
  translations,
  current,
  onTranslation,
  onRemoveTranslation
}: {
  translations: BibleTranslationInfo[]
  current: BibleTranslationInfo | undefined
  onTranslation: (id: string) => void
  onRemoveTranslation: (t: BibleTranslationInfo) => void
}) {
  const input = useBibleView((s) => s.input)
  const setInput = useBibleView((s) => s.setInput)
  const invalid = input.trim() !== '' && parseReference(input) === null
  // The hint waits until typing pauses, so half-typed references ("J 3,") do not flash an error.
  const [errorShown, setErrorShown] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const change = (text: string): void => {
    setInput(text)
    window.clearTimeout(timer.current)
    setErrorShown(false)
    if (text.trim() !== '' && parseReference(text) === null) {
      timer.current = window.setTimeout(() => setErrorShown(true), ERROR_DELAY_MS)
    }
  }
  const commit = (): void => {
    window.clearTimeout(timer.current)
    setErrorShown(invalid)
  }
  const showError = invalid && errorShown

  return (
    <div className="border-b border-line px-5 py-3">
      <div className="flex items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="bible-reference">{cs.bible.reference}</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <Input
              id="bible-reference"
              value={input}
              onChange={(e) => change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
              }}
              onBlur={commit}
              placeholder={cs.bible.referencePlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={showError || undefined}
              aria-describedby={showError ? 'bible-reference-error' : undefined}
              className="h-10 pl-9 text-[15px]"
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-small font-[550] text-ink-2">{cs.bible.translation}</span>
          <div className="flex items-center gap-1.5">
            <Select
              aria-label={cs.bible.translation}
              value={current?.id}
              onValueChange={onTranslation}
              options={translations.map((t) => ({ value: t.id, label: `${t.abbreviation} · ${t.name}` }))}
              className="h-10 w-[232px] 2xl:w-[300px] [&>span]:min-w-0 [&>span]:truncate"
            />
            {current && !current.builtIn ? (
              <Tip label={cs.bible.removeTranslation}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={cs.bible.removeTranslation}
                  onClick={() => onRemoveTranslation(current)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </Tip>
            ) : null}
          </div>
        </div>
      </div>
      <div aria-live="polite">
        {showError ? (
          <p id="bible-reference-error" className="mt-2 flex items-start gap-1.5 text-small text-warn">
            <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
            {cs.bible.notFound}
          </p>
        ) : null}
      </div>
    </div>
  )
}
