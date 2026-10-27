import { Check, Copy, Play, Plus, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaItem } from '@core/media/model'
import { findTheme } from '@core/theme/defaults'
import type { Theme } from '@core/theme/model'
import { ProjectionView } from '@/components/projection/ProjectionView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { useMedia } from '@/store/media'
import { useSettings } from '@/store/settings'
import { useThemes } from '@/store/themes'
import { ThemeEditor } from './themeEditor'
import { orderThemes, themePreviewFrame, uniqueName, withoutTransition } from './themeUtils'

const t = cs.settings.themes
const SAVE_DELAY_MS = 300

type SaveState = 'idle' | 'pending' | 'saved' | 'error'

/** Theme list + live preview + editor. Built-in themes are read-only; user themes save automatically. */
export function ThemesPanel() {
  const themes = useThemes((s) => s.themes)
  const defaultThemeId = useSettings((s) => s.settings.defaultThemeId)
  const mediaItems = useMedia((s) => s.items)

  const [selectedId, setSelectedId] = useState(() => findTheme(themes, defaultThemeId).id)
  const stored = useMemo(
    () => themes.find((x) => x.id === selectedId) ?? findTheme(themes, defaultThemeId),
    [themes, selectedId, defaultThemeId]
  )
  const [draft, setDraft] = useState<Theme>(stored)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const pending = useRef<{ timer: number; theme: Theme } | null>(null)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const nameRef = useRef<HTMLInputElement>(null)
  const [focusName, setFocusName] = useState(false)

  // The theme on screen: the draft while editing it, otherwise what is stored.
  const current = draft.id === stored.id ? draft : stored

  const flush = useCallback(() => {
    const p = pending.current
    if (!p) return
    window.clearTimeout(p.timer)
    pending.current = null
    const report = (state: SaveState): void => {
      // Only report for the theme that is still open and has no newer edits waiting.
      if (selectedRef.current === p.theme.id && !pending.current) setSaveState(state)
    }
    useThemes
      .getState()
      .save(p.theme)
      .then(
        () => report('saved'),
        () => report('error')
      )
  }, [])

  useEffect(() => () => flush(), [flush])

  // Follow the store (selection changes, own saves, background sync) unless edits are pending.
  useEffect(() => {
    if (!pending.current) setDraft(stored)
    if (stored.id !== selectedId) setSelectedId(stored.id)
  }, [stored, selectedId])

  useEffect(() => {
    if (focusName && nameRef.current && current.id === selectedId && !current.builtIn) {
      nameRef.current.focus()
      nameRef.current.select()
      setFocusName(false)
    }
  }, [focusName, current, selectedId])

  const change = (next: Theme): void => {
    if (next.builtIn) return
    setDraft(next)
    setSaveState('pending')
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = { theme: next, timer: window.setTimeout(flush, SAVE_DELAY_MS) }
  }

  const select = (id: string): void => {
    if (id === selectedId) return
    flush()
    setSaveState('idle')
    setSelectedId(id)
  }

  const allNames = themes.map((x) => x.name)

  const duplicateFrom = async (source: Theme, name: string): Promise<void> => {
    flush()
    const copy = await useThemes.getState().duplicate(source.id, uniqueName(name, allNames, t.numbered))
    if (copy) {
      setSaveState('idle')
      setSelectedId(copy.id)
      setFocusName(true)
    }
  }

  const createNew = (): Promise<void> => duplicateFrom(findTheme(themes, defaultThemeId), t.newName)
  const duplicate = (): Promise<void> =>
    duplicateFrom(current, t.copyName(current.name || cs.common.untitled))

  const setAsDefault = (): void => {
    flush()
    void useSettings.getState().update({ defaultThemeId: current.id })
  }

  const remove = async (): Promise<void> => {
    if (pending.current) {
      window.clearTimeout(pending.current.timer)
      pending.current = null
    }
    const id = current.id
    setSelectedId(findTheme(themes, defaultThemeId).id)
    setSaveState('idle')
    await useThemes.getState().remove(id)
  }

  // Order by the stored names (stable while typing); show the draft of the open theme.
  const ordered = orderThemes(themes)
  const live = (list: Theme[]): Theme[] => list.map((x) => (x.id === current.id ? current : x))
  const builtIn = ordered.builtIn
  const user = live(ordered.user)

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(232px,272px)_minmax(0,1fr)]">
      <aside aria-label={t.list} className="flex min-h-0 flex-col border-r border-line">
        <div className="flex flex-col gap-1.5 px-4 pb-3 pt-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-screen font-[650] tracking-[-0.01em] text-ink">{t.title}</h2>
            <Button size="sm" variant="secondary" onClick={() => void createNew()}>
              <Plus aria-hidden />
              {t.new}
            </Button>
          </div>
          <p className="text-small text-ink-2 [text-wrap:pretty]">{t.hint}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <ThemeListSection
            title={t.builtInGroup}
            themes={builtIn}
            selectedId={current.id}
            defaultThemeId={defaultThemeId}
            mediaItems={mediaItems}
            onSelect={select}
          />
          <ThemeListSection
            title={t.userGroup}
            themes={user}
            selectedId={current.id}
            defaultThemeId={defaultThemeId}
            mediaItems={mediaItems}
            onSelect={select}
            empty={t.noUserThemes}
          />
        </div>
      </aside>

      <section aria-label={current.name || cs.common.untitled} className="flex min-h-0 min-w-0 flex-col">
        <ThemeHero
          theme={current}
          isDefault={current.id === defaultThemeId}
          mediaItems={mediaItems}
          saveState={saveState}
          nameRef={nameRef}
          onRename={(name) => change({ ...current, name })}
          onRenameDone={() => {
            const name = current.name.trim()
            if (name !== current.name || !name) change({ ...current, name: name || cs.common.untitled })
          }}
          onDuplicate={() => void duplicate()}
          onSetDefault={setAsDefault}
          onDelete={remove}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-5" data-testid="theme-editor">
          {current.builtIn ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card bg-raised px-4 py-3 ring-1 ring-inset ring-line">
              <p className="text-body text-ink" role="note">
                {t.builtIn}
              </p>
              <Button variant="primary" onClick={() => void duplicate()}>
                <Copy aria-hidden />
                {cs.common.duplicate}
              </Button>
            </div>
          ) : null}
          <div inert={current.builtIn} className={cn(current.builtIn && 'opacity-55')}>
            <ThemeEditor theme={current} mediaItems={mediaItems} onChange={change} />
          </div>
        </div>
      </section>
    </div>
  )
}

function ThemeListSection({
  title,
  themes,
  selectedId,
  defaultThemeId,
  mediaItems,
  onSelect,
  empty
}: {
  title: string
  themes: Theme[]
  selectedId: string
  defaultThemeId: string
  mediaItems: MediaItem[]
  onSelect: (id: string) => void
  empty?: string
}) {
  return (
    <div className="mt-2">
      <h3 className="px-2 pb-1.5 pt-2 text-small font-[550] text-ink-3">{title}</h3>
      {themes.length === 0 && empty ? (
        <p className="px-2 py-1 text-small text-ink-3 [text-wrap:pretty]">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {themes.map((theme) => (
            <li key={theme.id}>
              <ThemeListItem
                theme={theme}
                selected={theme.id === selectedId}
                isDefault={theme.id === defaultThemeId}
                mediaItems={mediaItems}
                onSelect={() => onSelect(theme.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ThemeListItem({
  theme,
  selected,
  isDefault,
  mediaItems,
  onSelect
}: {
  theme: Theme
  selected: boolean
  isDefault: boolean
  mediaItems: MediaItem[]
  onSelect: () => void
}) {
  const frame = useMemo(
    () =>
      themePreviewFrame(withoutTransition(theme), {
        lines: t.previewText,
        footer: t.previewFooter,
        mediaItems
      }),
    [theme, mediaItems]
  )
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      title={theme.name || cs.common.untitled}
      className={cn(
        'press flex w-full items-center gap-3 rounded-card p-2 text-left hover:bg-raised',
        selected && 'bg-raised ring-1 ring-inset ring-line'
      )}
    >
      <div
        aria-hidden
        className={cn(
          'w-[84px] shrink-0 overflow-hidden rounded-[6px] ring-1 ring-line',
          selected && 'ring-2 ring-light'
        )}
      >
        <ProjectionView frame={frame} mode="preview" className="aspect-video w-full" />
      </div>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-body font-[550] text-ink">{theme.name || cs.common.untitled}</span>
        {isDefault ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-chip bg-raised-2 px-1.5 py-px text-meta font-[550] text-ink ring-1 ring-inset ring-line-strong">
            <Star className="size-3 fill-current" aria-hidden />
            {t.default}
          </span>
        ) : null}
      </span>
    </button>
  )
}

function ThemeHero({
  theme,
  isDefault,
  mediaItems,
  saveState,
  nameRef,
  onRename,
  onRenameDone,
  onDuplicate,
  onSetDefault,
  onDelete
}: {
  theme: Theme
  isDefault: boolean
  mediaItems: MediaItem[]
  saveState: SaveState
  nameRef: React.RefObject<HTMLInputElement | null>
  onRename: (name: string) => void
  onRenameDone: () => void
  onDuplicate: () => void
  onSetDefault: () => void
  onDelete: () => Promise<void>
}) {
  const [alt, setAlt] = useState(false)
  const [demo, setDemo] = useState(false)
  const demoTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(demoTimer.current), [])

  const tryTransition = (): void => {
    window.clearTimeout(demoTimer.current)
    setDemo(true)
    setAlt((a) => !a)
    demoTimer.current = window.setTimeout(() => setDemo(false), theme.transition.durationMs + 400)
  }

  const frame = useMemo(
    () =>
      themePreviewFrame(demo ? theme : withoutTransition(theme), {
        lines: alt ? t.previewTextAlt : t.previewText,
        footer: t.previewFooter,
        mediaItems
      }),
    [theme, demo, alt, mediaItems]
  )

  return (
    <div className="flex shrink-0 gap-5 border-b border-line px-6 py-5">
      <div className="min-w-0 max-w-[calc(50vh*16/9)] flex-1 overflow-hidden rounded-card ring-1 ring-line-strong">
        <ProjectionView frame={frame} mode="preview" className="aspect-video w-full" label={t.preview} />
      </div>

      <div className="flex w-[clamp(220px,22%,340px)] shrink-0 flex-col gap-3">
        {theme.builtIn ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-title font-[650] tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
              {theme.name}
            </h3>
            <span className="text-small text-ink-2">{t.builtInBadge}</span>
          </div>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-[550] text-ink-2">{t.name}</span>
            <Input
              ref={nameRef}
              value={theme.name}
              maxLength={80}
              onChange={(e) => onRename(e.target.value)}
              onBlur={onRenameDone}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </label>
        )}

        {isDefault ? (
          <div className="flex items-start gap-2 text-small">
            <Check className="mt-px size-4 shrink-0 text-ink" aria-hidden />
            <span className="flex flex-col">
              <span className="font-[550] text-ink">{t.isDefault}</span>
              <span className="text-ink-2 [text-wrap:pretty]">{t.isDefaultHint}</span>
            </span>
          </div>
        ) : (
          <Button variant="secondary" className="w-fit" onClick={onSetDefault}>
            <Star aria-hidden />
            {t.setDefault}
          </Button>
        )}

        {!theme.builtIn ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onDuplicate}>
              <Copy aria-hidden />
              {cs.common.duplicate}
            </Button>
            <DeleteThemeButton theme={theme} disabled={isDefault} onConfirm={onDelete} />
          </div>
        ) : null}
        {!theme.builtIn && isDefault ? (
          <p className="text-meta text-ink-3 [text-wrap:pretty]">{t.cannotDeleteDefault}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={tryTransition}>
            <Play aria-hidden />
            {t.tryTransition}
          </Button>
          {!theme.builtIn ? <SaveStatus state={saveState} /> : null}
        </div>
      </div>
    </div>
  )
}

function SaveStatus({ state }: { state: SaveState }) {
  const text =
    state === 'pending'
      ? t.saving
      : state === 'saved'
        ? t.savedNow
        : state === 'error'
          ? t.saveFailed
          : t.autoSave
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('text-meta', state === 'error' ? 'text-warn' : 'text-ink-3')}
    >
      {text}
    </span>
  )
}

function DeleteThemeButton({
  theme,
  disabled,
  onConfirm
}: {
  theme: Theme
  disabled: boolean
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="danger" disabled={disabled} onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
        {cs.common.delete}
      </Button>
      <DialogContent title={t.deleteTitle} description={t.deleteText(theme.name || cs.common.untitled)}>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{cs.common.cancel}</Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              setOpen(false)
              void onConfirm()
            }}
          >
            <Trash2 aria-hidden />
            {cs.common.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
