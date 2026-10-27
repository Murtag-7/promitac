import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, FileSearch, Library, TriangleAlert } from 'lucide-react'
import type { Song } from '@core/chordpro/model'
import { allChords } from '@core/chordpro/text'
import { findDuplicates } from '@core/import/duplicates'
import { songToSlides } from '@core/slides/generate'
import { newId } from '@core/util/id'
import { SlideTile } from '@/components/common/SlideTile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { useLibrary } from '@/store/library'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import type { ImportedSong } from './pipeline'

export function ImportCard({
  imported,
  savedId,
  onChange,
  onSaved,
  onReview
}: {
  imported: ImportedSong
  savedId: string | null
  onChange: (song: Song) => void
  onSaved: (id: string) => void
  onReview: () => void
}) {
  const song = imported.result.song
  const library = useLibrary((s) => s.songs)
  const saveSong = useLibrary((s) => s.save)
  const linesPerSlide = useSettings((s) => s.settings.linesPerSlide)
  const openSong = useUi((s) => s.openSong)
  const setImportOpen = useUi((s) => s.setImportOpen)
  const [duplicates, setDuplicates] = useState<Song[] | null>(null)
  const [busy, setBusy] = useState(false)

  const slides = useMemo(() => songToSlides(song, { linesPerSlide }), [song, linesPerSlide])
  const chordCount = useMemo(() => allChords(song).length, [song])
  const titleMissing = imported.result.warnings.some((w) => w.code === 'missingTitle' || w.code === 'titleFromFirstLine')
  const uncertain = imported.result.uncertain

  const save = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      const saved = await saveSong({ ...song, id })
      setDuplicates(null)
      onSaved(saved.id)
      toast(cs.import.added)
    } finally {
      setBusy(false)
    }
  }

  const add = (): void => {
    const dups = findDuplicates({ ...song, id: '' }, Object.values(library))
    if (dups.length > 0) setDuplicates(dups)
    else void save(newId())
  }

  return (
    <article
      className="flex flex-col gap-3 rounded-card bg-raised p-4 ring-1 ring-inset ring-line"
      data-testid="import-card"
      aria-label={cs.import.resultTitle}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-meta font-[600] text-ink-3" htmlFor={`import-title-${imported.fileNames.join('-')}`}>
          {cs.songs.meta.title}
        </label>
        <Input
          id={`import-title-${imported.fileNames.join('-')}`}
          value={song.meta.title}
          disabled={Boolean(savedId)}
          onChange={(e) => onChange({ ...song, meta: { ...song.meta, title: e.target.value } })}
          className={cn('h-10 text-title font-[650]', titleMissing && !savedId && 'ring-warn/60')}
        />
        {titleMissing && !savedId ? <p className="text-small text-warn">{cs.import.missingTitle}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
        <span>{cs.import.formats[imported.source === 'text' || imported.source === 'chordpro' ? imported.result.format : imported.source] ?? imported.result.format}</span>
        <span aria-hidden className="text-ink-3">·</span>
        <span>{cs.import.sectionsFound(song.sections.length)}</span>
        <span aria-hidden className="text-ink-3">·</span>
        <span>{chordCount > 0 ? cs.import.withChords : cs.import.withoutChords}</span>
        <span aria-hidden className="text-ink-3">·</span>
        <span>{cs.common.slides(slides.length)}</span>
        {imported.viaAi ? (
          <>
            <span aria-hidden className="text-ink-3">·</span>
            <span>{cs.import.viaAi}</span>
          </>
        ) : null}
        {imported.images.length > 1 ? (
          <>
            <span aria-hidden className="text-ink-3">·</span>
            <span>{cs.import.pagesNote(imported.images.length)}</span>
          </>
        ) : null}
      </div>

      {uncertain.length > 0 && !savedId ? (
        <button
          type="button"
          onClick={onReview}
          className="press flex items-center gap-2 self-start rounded-control bg-warn-soft px-2.5 py-1.5 text-small font-[550] text-warn"
        >
          <TriangleAlert className="size-4" aria-hidden />
          {cs.import.uncertain(uncertain.length)}
        </button>
      ) : null}

      {slides.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {slides.slice(0, 6).map((s, i) => {
            const prev = slides[i - 1]
            return (
              <SlideTile
                key={`${s.id}-${i}`}
                slide={s}
                index={i}
                state="idle"
                showSection={!prev || prev.id.split('.')[0] !== s.id.split('.')[0]}
              />
            )
          })}
        </div>
      ) : (
        <p className="text-small text-ink-2">{cs.songs.noSlides}</p>
      )}

      {duplicates && !savedId ? (
        <div className="flex flex-col gap-2 rounded-control bg-warn-soft p-3" role="alert">
          <p className="text-small text-ink">{cs.import.duplicate(duplicates[0]?.meta.title ?? '')}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save(duplicates[0]?.id ?? newId())}>
              {cs.import.replace}
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void save(newId())}>
              {cs.import.saveAsNew}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {savedId ? (
          <>
            <span className="flex items-center gap-1.5 text-small font-[550] text-ink">
              <Check className="size-4" aria-hidden />
              {cs.import.added}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                openSong(savedId)
                setImportOpen(false)
              }}
            >
              <Library aria-hidden />
              {cs.import.openSong}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onReview}>
              <FileSearch aria-hidden />
              {cs.import.review}
            </Button>
            <Button variant="primary" className="ml-auto" disabled={busy || !song.meta.title.trim()} onClick={add}>
              <Library aria-hidden />
              {cs.import.addToLibrary}
            </Button>
          </>
        )}
      </div>
    </article>
  )
}
