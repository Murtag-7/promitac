import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileUp, LoaderCircle } from 'lucide-react'
import type { BibleTranslationInfo } from '@core/bible/model'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { cs } from '@/i18n/cs'
import { useBible } from '@/store/bible'
import { bibleImportErrorMessage } from './importErrors'

const ACCEPT = '.xml,.usfx,.osis,.zef,text/xml,application/xml'

/** Footer of the book column: import a translation the church has a licence for. */
export function TranslationImport({ onImported }: { onImported: (t: BibleTranslationInfo) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const importFile = async (file: File): Promise<void> => {
    setBusy(true)
    try {
      const info = await useBible.getState().importFile(file)
      onImported(info)
      toast.success(cs.bible.imported(info.name))
    } catch (err) {
      console.error('Bible import failed', err)
      toast.error(cs.bible.importFailed, { description: bibleImportErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-line p-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
        {busy ? cs.bible.importing : cs.bible.importTranslation}
      </Button>
      <p className="px-3 pb-1 pt-1 text-meta text-ink-2 [text-wrap:pretty]">{cs.bible.importHint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="bible-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void importFile(file)
        }}
      />
    </div>
  )
}

/** Confirmation before an imported translation is deleted from this computer. */
export function RemoveTranslationDialog({
  translation,
  onClose,
  onRemoved
}: {
  translation: BibleTranslationInfo | null
  onClose: () => void
  onRemoved: (t: BibleTranslationInfo) => void
}) {
  const [busy, setBusy] = useState(false)
  const remove = async (): Promise<void> => {
    if (!translation) return
    setBusy(true)
    try {
      await useBible.getState().remove(translation.id)
      onRemoved(translation)
      toast.success(cs.bible.removed(translation.name))
      onClose()
    } catch (err) {
      console.error('Bible remove failed', err)
      toast.error(cs.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={translation !== null} onOpenChange={(open) => !open && onClose()}>
      {translation ? (
        <DialogContent title={cs.bible.removeTitle} description={cs.bible.removeText(translation.name)}>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{cs.common.cancel}</Button>
            </DialogClose>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              {cs.bible.remove}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
