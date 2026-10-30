import { useMemo, useState } from 'react'
import { BookOpen, FileText, Image as ImageIcon, Music4, Search, Square } from 'lucide-react'
import { formatReference, parseReference } from '@core/bible/reference'
import type { PlanItem } from '@core/plan/model'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { cs } from '@/i18n/cs'
import { useBible } from '@/store/bible'
import { songIndex, useLibrary } from '@/store/library'
import { mediaUrl, useMedia } from '@/store/media'
import { useSettings } from '@/store/settings'

type NewItem = PlanItem extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never

export function AddItemBar({ onAdd }: { onAdd: (item: NewItem) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={cs.common.add}>
      <span className="mr-1 text-small font-[600] text-ink-2" aria-hidden>
        {cs.plan.addLabel}
      </span>
      <SongPicker onPick={(songId) => onAdd({ type: 'song', songId })} />
      <BiblePicker
        onPick={(reference, translationId) => onAdd({ type: 'bible', reference, translationId })}
      />
      <MediaPicker onPick={(mediaId) => onAdd({ type: 'media', mediaId })} />
      <Button onClick={() => onAdd({ type: 'text', title: cs.plan.itemKinds.text, body: '' })}>
        <FileText aria-hidden />
        {cs.plan.addText}
      </Button>
      <Button onClick={() => onAdd({ type: 'blank' })}>
        <Square aria-hidden />
        {cs.plan.addBlank}
      </Button>
    </div>
  )
}

function SongPicker({ onPick }: { onPick: (songId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const songs = useLibrary((s) => s.songs)
  const order = useLibrary((s) => s.order)
  const ids = useMemo(
    () => (q.trim() ? songIndex.search(q, 40).map((r) => r.id) : order.slice(0, 40)),
    [q, order]
  )
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ('')
      }}
    >
      <PopoverTrigger asChild>
        <Button>
          <Music4 aria-hidden />
          {cs.plan.addSong}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-2">
        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={cs.songs.searchPlaceholder}
            aria-label={cs.plan.pickSong}
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ids[0]) {
                onPick(ids[0])
                setOpen(false)
              }
            }}
          />
        </div>
        <ul className="max-h-[320px] overflow-y-auto" aria-label={cs.plan.pickSong}>
          {ids.map((id) => {
            const s = songs[id]
            if (!s) return null
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(id)
                    setOpen(false)
                  }}
                  className="flex w-full flex-col rounded-control px-2.5 py-1.5 text-left hover:bg-raised"
                >
                  <span className="truncate text-body font-[550] text-ink">
                    {s.meta.title || cs.common.untitled}
                  </span>
                  {s.meta.artist ? (
                    <span className="truncate text-meta text-ink-3">{s.meta.artist}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
          {ids.length === 0 ? (
            <li className="px-2.5 py-3 text-small text-ink-2">{cs.songs.noResults(q)}</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function BiblePicker({ onPick }: { onPick: (reference: string, translationId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [ref, setRef] = useState('')
  const translations = useBible((s) => s.translations)
  const defaultTranslation = useSettings((s) => s.settings.bibleTranslationId)
  const [translationId, setTranslationId] = useState(defaultTranslation)
  const parsed = ref.trim() ? parseReference(ref) : null
  const submit = (): void => {
    if (!parsed) return
    onPick(formatReference(parsed), translationId)
    setRef('')
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <BookOpen aria-hidden />
          {cs.plan.addBible}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px]">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field
            label={cs.bible.title}
            hint={
              ref.trim() && !parsed ? cs.plan.invalidReference : parsed ? formatReference(parsed) : undefined
            }
          >
            <Input
              autoFocus
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder={cs.plan.biblePlaceholder}
            />
          </Field>
          <Field label={cs.bible.translation}>
            <Select
              aria-label={cs.bible.translation}
              value={translationId}
              onValueChange={setTranslationId}
              options={translations.map((t) => ({ value: t.id, label: `${t.abbreviation} – ${t.name}` }))}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={!parsed}>
            {cs.common.add}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function MediaPicker({ onPick }: { onPick: (mediaId: string) => void }) {
  const [open, setOpen] = useState(false)
  const media = useMedia((s) => s.items)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <ImageIcon aria-hidden />
          {cs.plan.addMedia}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px]">
        {media.length === 0 ? (
          <p className="text-small text-ink-2">{cs.plan.noMedia}</p>
        ) : (
          <div className="grid max-h-[320px] grid-cols-3 gap-2 overflow-y-auto">
            {media.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.name}
                onClick={() => {
                  onPick(m.id)
                  setOpen(false)
                }}
                className="press aspect-video overflow-hidden rounded-control bg-black ring-1 ring-inset ring-line hover:ring-light"
              >
                {m.kind === 'image' ? (
                  <img src={mediaUrl(m)} alt={m.name} className="h-full w-full object-cover" />
                ) : (
                  <video src={mediaUrl(m)} muted preload="metadata" className="h-full w-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
