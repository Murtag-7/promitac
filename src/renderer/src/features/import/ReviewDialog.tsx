import { useMemo, useState } from 'react'
import { Dialog as D } from 'radix-ui'
import { Check, TriangleAlert, X } from 'lucide-react'
import type { Song } from '@core/chordpro/model'
import { parseChordPro } from '@core/chordpro/parse'
import { serializeChordPro } from '@core/chordpro/serialize'
import { songToSlides } from '@core/slides/generate'
import { SlideTile } from '@/components/common/SlideTile'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { useSettings } from '@/store/settings'
import { ChordProEditor } from '@/features/songs/ChordProEditor'
import type { ImportedSong } from './pipeline'

/** Highlight low-confidence OCR words in their source line. */
function SourceText({ text, imported }: { text: string; imported: ImportedSong }) {
  const byLine = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const u of imported.result.uncertain)
      map.set(u.sourceLine, [...(map.get(u.sourceLine) ?? []), u.text])
    return map
  }, [imported.result.uncertain])
  return (
    <pre className="selectable whitespace-pre-wrap break-words font-sans text-small leading-6 text-ink">
      {text.split('\n').map((line, i) => {
        const words = byLine.get(i)
        if (!words) return <div key={i}>{line || '\u00a0'}</div>
        const parts = line.split(/(\s+)/)
        return (
          <div key={i}>
            {parts.map((p, j) =>
              words.includes(p) ? (
                <mark
                  key={j}
                  className="rounded-[3px] bg-warn-soft px-0.5 text-warn ring-1 ring-inset ring-warn/40"
                >
                  {p}
                </mark>
              ) : (
                <span key={j}>{p}</span>
              )
            )}
          </div>
        )
      })}
    </pre>
  )
}

/** Side by side review: source ↔ ChordPro (editable) ↔ slides. */
export function ReviewDialog({
  imported,
  open,
  onOpenChange,
  onApply
}: {
  imported: ImportedSong
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (song: Song) => void
}) {
  const linesPerSlide = useSettings((s) => s.settings.linesPerSlide)
  const [text, setText] = useState(() => serializeChordPro(imported.result.song, { includeAppMeta: false }))
  const song = useMemo(() => {
    try {
      return { ...parseChordPro(text), id: '', updatedAt: '' }
    } catch {
      return imported.result.song
    }
  }, [text, imported.result.song])
  const slides = useMemo(() => songToSlides(song, { linesPerSlide }), [song, linesPerSlide])

  return (
    <D.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onApply(song)
        onOpenChange(o)
      }}
    >
      <D.Portal>
        <D.Overlay className="fade-enter fixed inset-0 z-[60] bg-black/60" />
        <D.Content className="dialog-enter fixed left-1/2 top-1/2 z-[61] flex h-[90vh] w-[min(96vw,1500px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-panel bg-panel shadow-overlay ring-1 ring-line focus:outline-none">
          <header className="flex items-center gap-3 border-b border-line px-5 py-3">
            <D.Title className="flex-1 truncate text-title font-[650] text-ink">
              {song.meta.title || cs.common.untitled}
            </D.Title>
            <D.Description className="sr-only">{cs.import.uncertainHint}</D.Description>
            {imported.result.uncertain.length > 0 ? (
              <span className="flex items-center gap-1.5 text-small text-warn">
                <TriangleAlert className="size-4" aria-hidden />
                {cs.import.uncertain(imported.result.uncertain.length)}
              </span>
            ) : null}
            <Button
              variant="primary"
              onClick={() => {
                onApply(song)
                onOpenChange(false)
              }}
            >
              <Check aria-hidden />
              {cs.common.done}
            </Button>
            <D.Close
              aria-label={cs.common.close}
              className="press grid size-9 place-items-center rounded-control text-ink-2 hover:bg-raised hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </D.Close>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] divide-x divide-line">
            <section className="flex min-h-0 flex-col" aria-label={cs.import.source}>
              <h3 className="px-4 pb-2 pt-3 text-small font-[650] text-ink-2">{cs.import.source}</h3>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                {imported.images.map((url) => (
                  <img key={url} src={url} alt="" className="mb-3 w-full rounded-control ring-1 ring-line" />
                ))}
                {imported.result.uncertain.length > 0 ? (
                  <p className="mb-2 text-small text-warn">{cs.import.uncertainHint}</p>
                ) : null}
                <SourceText text={imported.sourceText} imported={imported} />
              </div>
            </section>
            <section className="flex min-h-0 flex-col" aria-label={cs.import.chordpro}>
              <h3 className="px-4 pb-2 pt-3 text-small font-[650] text-ink-2">{cs.import.chordpro}</h3>
              <div className="min-h-0 flex-1">
                <ChordProEditor value={text} onChange={setText} ariaLabel={cs.import.chordpro} />
              </div>
            </section>
            <section className="flex min-h-0 flex-col" aria-label={cs.import.slides}>
              <h3 className="px-4 pb-2 pt-3 text-small font-[650] text-ink-2">
                {cs.import.slides} · {cs.common.slides(slides.length)}
              </h3>
              <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-4 pb-4">
                {slides.map((s, i) => {
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
            </section>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
