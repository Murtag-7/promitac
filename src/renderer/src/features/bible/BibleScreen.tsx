import { useMemo, useState } from 'react'
import type { BibleTranslationInfo } from '@core/bible/model'
import { parseReference } from '@core/bible/reference'
import { DEFAULT_SETTINGS } from '@core/settings/model'
import { cs } from '@/i18n/cs'
import { useSettings } from '@/store/settings'
import { BookBrowser } from './BookBrowser'
import { PassagePreview } from './PassagePreview'
import { PassageText } from './PassageText'
import { ReferenceBar } from './ReferenceBar'
import { RemoveTranslationDialog, TranslationImport } from './TranslationLibrary'
import { useCurrentTranslation } from './useCurrentTranslation'
import { useBibleView } from './viewStore'

/**
 * Bible: books on the left, the chapter text in the middle (click / shift-click selects verses),
 * the projected look of the selection on the right with "Přidat do plánu" / "Promítnout hned".
 */
export function BibleScreen() {
  const translation = useCurrentTranslation()
  const input = useBibleView((s) => s.input)
  const passage = useMemo(() => parseReference(input), [input])
  const [removing, setRemoving] = useState<BibleTranslationInfo | null>(null)

  return (
    <div className="grid h-full min-h-0 grid-cols-[236px_minmax(0,1fr)_332px] 2xl:grid-cols-[272px_minmax(0,1fr)_392px]">
      <BookBrowser
        data={translation.data}
        footer={<TranslationImport onImported={(t) => translation.select(t.id)} />}
      />
      <section aria-label={cs.bible.title} className="flex min-h-0 flex-col border-x border-line bg-bg">
        <ReferenceBar
          translations={translation.translations}
          current={translation.info}
          onTranslation={translation.select}
          onRemoveTranslation={setRemoving}
        />
        <PassageText
          data={translation.data}
          info={translation.info}
          status={translation.status}
          passage={passage}
          onRetry={translation.retry}
        />
      </section>
      <PassagePreview
        data={translation.data}
        info={translation.info}
        status={translation.status}
        passage={passage}
      />
      <RemoveTranslationDialog
        translation={removing}
        onClose={() => setRemoving(null)}
        onRemoved={(t) => {
          if (useSettings.getState().settings.bibleTranslationId === t.id) {
            void useSettings.getState().update({ bibleTranslationId: DEFAULT_SETTINGS.bibleTranslationId })
          }
        }}
      />
    </div>
  )
}
