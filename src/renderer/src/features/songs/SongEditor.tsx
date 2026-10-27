import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Download, FileText, ListPlus, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import type { Song } from '@core/chordpro/model'
import { readDirective, removeDirective, setDirective } from '@core/chordpro/directives'
import { parseChordPro } from '@core/chordpro/parse'
import { serializeChordPro } from '@core/chordpro/serialize'
import { transposeSong } from '@core/chordpro/transpose'
import { songToPlainText } from '@core/import/plaintext'
import { songToSlides } from '@core/slides/generate'
import { findTheme } from '@core/theme/defaults'
import { SlideTile } from '@/components/common/SlideTile'
import { ProjectionView } from '@/components/projection/ProjectionView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Select } from '@/components/ui/select'
import { cs } from '@/i18n/cs'
import { downloadText } from '@/lib/download'
import { useDebouncedEffect } from '@/lib/useDebounced'
import { useLibrary } from '@/store/library'
import { addToLivePlan, projectNow } from '@/store/live'
import { useSettings } from '@/store/settings'
import { useThemes } from '@/store/themes'
import { useUi } from '@/store/ui'
import { ArrangementEditor } from './ArrangementEditor'
import { ChordProEditor } from './ChordProEditor'

function safeParse(text: string, id: string, updatedAt: string): Song | null {
  try {
    return { ...parseChordPro(text), id, updatedAt }
  } catch {
    return null
  }
}

function setOrRemove(text: string, name: string, value: string): string {
  return value.trim() ? setDirective(text, name, value.trim()) : removeDirective(text, name)
}

export function SongEditor({ songId }: { songId: string }) {
  const stored = useLibrary((s) => s.contents[songId])
  const storedSong = useLibrary((s) => s.songs[songId])
  const saveContent = useLibrary((s) => s.saveContent)
  const remove = useLibrary((s) => s.remove)
  const settings = useSettings((s) => s.settings)
  const themes = useThemes((s) => s.themes)
  const setView = useUi((s) => s.setView)
  const openSong = useUi((s) => s.openSong)

  const [text, setText] = useState(() => stored ?? (storedSong ? serializeChordPro(storedSong) : ''))
  const [savedText, setSavedText] = useState(text)
  const [saving, setSaving] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const song = useMemo(() => safeParse(text, songId, storedSong?.updatedAt ?? ''), [text, songId, storedSong?.updatedAt])
  const slides = useMemo(
    () => (song ? songToSlides(song, { linesPerSlide: settings.linesPerSlide }) : []),
    [song, settings.linesPerSlide]
  )
  const theme = findTheme(themes, song?.themeId ?? settings.defaultThemeId)
  const previewSlide = slides[Math.min(previewIndex, slides.length - 1)] ?? null

  const save = async (value: string): Promise<void> => {
    if (value === savedText) return
    setSaving(true)
    try {
      await saveContent(songId, value)
      setSavedText(value)
    } catch (err) {
      console.error(err)
      toast.error(cs.common.error)
    } finally {
      setSaving(false)
    }
  }
  useDebouncedEffect(text, 700, (v) => void save(v))

  const edit = (fn: (t: string) => string): void => setText((t) => fn(t))
  const transpose = (n: number): void => {
    if (!song) return
    setText(serializeChordPro(transposeSong(song, n)))
  }

  const dirty = text !== savedText
  const meta = song?.meta

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-screen font-[650] tracking-[-0.01em] text-ink">
            {meta?.title || cs.common.untitled}
          </h2>
          <p className="text-small text-ink-3" aria-live="polite">
            {saving ? `${cs.common.save}…` : dirty ? cs.songs.unsaved : cs.common.saved}
          </p>
        </div>
        <Button variant="secondary" onClick={() => void addToLivePlan({ type: 'song', songId }).then(() => toast(cs.common.addToPlan))}>
          <ListPlus aria-hidden />
          {cs.common.addToPlan}
        </Button>
        <Button
          variant="primary"
          disabled={slides.length === 0}
          onClick={async () => {
            await save(text)
            await projectNow({ type: 'song', songId })
            setView('live')
          }}
        >
          <Play aria-hidden />
          {cs.common.projectNow}
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={cs.common.more}>
              <MoreHorizontal aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => transpose(1)}>
              <ArrowUp aria-hidden />
              {cs.songs.transposeUp}
            </MenuItem>
            <MenuItem onSelect={() => transpose(-1)}>
              <ArrowDown aria-hidden />
              {cs.songs.transposeDown}
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => downloadText(`${meta?.title || 'pisen'}.chordpro`, text)}>
              <Download aria-hidden />
              {cs.songs.exportChordPro}
            </MenuItem>
            <MenuItem onSelect={() => song && downloadText(`${meta?.title || 'pisen'}.txt`, songToPlainText(song))}>
              <FileText aria-hidden />
              {cs.songs.exportText}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {cs.common.delete}
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-3 border-b border-line px-5 py-3">
        <Field label={cs.songs.meta.title}>
          <Input value={meta?.title ?? ''} onChange={(e) => edit((t) => setOrRemove(t, 'title', e.target.value))} />
        </Field>
        <Field label={cs.songs.meta.artist}>
          <Input value={meta?.artist ?? ''} onChange={(e) => edit((t) => setOrRemove(t, 'artist', e.target.value))} />
        </Field>
        <Field label={cs.songs.meta.key}>
          <Input value={meta?.key ?? ''} onChange={(e) => edit((t) => setOrRemove(t, 'key', e.target.value))} />
        </Field>
        <Field label={cs.songs.meta.tags}>
          <Input
            defaultValue={meta?.tags.join(', ') ?? ''}
            key={`tags-${songId}`}
            placeholder={cs.songs.meta.tagsHint}
            onBlur={(e) => edit((t) => setOrRemove(t, 'tags', e.target.value))}
          />
        </Field>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(320px,1fr)]">
        <section className="flex min-h-0 flex-col border-r border-line" aria-label={cs.songs.editorTab}>
          <div className="min-h-0 flex-1">
            <ChordProEditor
              value={text}
              onChange={setText}
              onSave={() => void save(text)}
              ariaLabel={cs.songs.editorTab}
              placeholderText={cs.songs.parseHint}
            />
          </div>
          <p className="border-t border-line px-4 py-2 text-meta text-ink-3">{cs.songs.parseHint}</p>
        </section>

        <section className="flex min-h-0 flex-col overflow-y-auto" aria-label={cs.songs.previewTab}>
          <div className="flex flex-col gap-4 p-4">
            <div className="overflow-hidden rounded-card ring-1 ring-line">
              <ProjectionView
                mode="preview"
                className="aspect-video w-full"
                label={cs.songs.previewTab}
                frame={{
                  seq: 0,
                  slide: previewSlide,
                  theme,
                  overlay: 'none',
                  alert: null,
                  timer: null,
                  media: {}
                }}
              />
            </div>
            <p className="-mt-2 text-meta text-ink-3">{cs.songs.chordsNote}</p>

            {song ? (
              <ArrangementEditor
                sections={song.sections}
                arrangement={song.arrangement}
                onChange={(arr) => edit((t) => setOrRemove(t, 'arrangement', arr.join(' ')))}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label={cs.songs.linesPerSlide}>
                <Select
                  aria-label={cs.songs.linesPerSlide}
                  value={readDirective(text, 'x_lines_per_slide')?.trim() || 'default'}
                  onValueChange={(v) => edit((t) => setOrRemove(t, 'x_lines_per_slide', v === 'default' ? '' : v))}
                  options={[
                    { value: 'default', label: cs.songs.linesPerSlideDefault(settings.linesPerSlide) },
                    ...[1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: String(n) }))
                  ]}
                />
              </Field>
              <Field label={cs.songs.theme}>
                <Select
                  aria-label={cs.songs.theme}
                  value={song?.themeId ?? 'default'}
                  onValueChange={(v) => edit((t) => setOrRemove(t, 'x_theme', v === 'default' ? '' : v))}
                  options={[
                    { value: 'default', label: cs.songs.themeDefault },
                    ...themes.map((th) => ({ value: th.id, label: th.name }))
                  ]}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-small font-[600] text-ink-2">{cs.songs.previewTab}</span>
              <span className="text-meta text-ink-3">{cs.common.slides(slides.length)}</span>
            </div>
            {slides.length === 0 ? (
              <p className="rounded-card bg-raised p-4 text-small text-ink-2 ring-1 ring-inset ring-line">
                {cs.songs.noSlides}
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2" data-testid="song-slides">
                {slides.map((s, i) => {
                  const prev = slides[i - 1]
                  return (
                    <SlideTile
                      key={`${s.id}-${i}`}
                      slide={s}
                      index={i}
                      state={i === previewIndex ? 'selected' : 'idle'}
                      showSection={!prev || prev.id.split('.')[0] !== s.id.split('.')[0]}
                      onClick={() => setPreviewIndex(i)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={cs.songs.deleteTitle} description={cs.songs.deleteText(meta?.title || cs.common.untitled)}>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{cs.common.cancel}</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={async () => {
                setConfirmDelete(false)
                await remove(songId)
                openSong(null)
                toast(cs.songs.deletedToast)
              }}
            >
              <Trash2 aria-hidden />
              {cs.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
