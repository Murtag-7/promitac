import { useEffect, useRef, useState } from 'react'
import { Dialog as D } from 'radix-ui'
import { FileUp, Image as ImageIcon, Loader2, Paperclip, ScanText, X } from 'lucide-react'
import type { Song } from '@core/chordpro/model'
import { newId } from '@core/util/id'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { Switch } from '@/components/ui/switch'
import { useSettings } from '@/store/settings'
import { ImportCard } from './ImportCard'
import { classifyFile, importFromFiles, importFromText, type ImportedSong } from './pipeline'
import { ReviewDialog } from './ReviewDialog'

type Message =
  | { id: string; role: 'user'; text?: string; files?: Array<{ name: string; image?: string }> }
  | { id: string; role: 'progress'; label: string; fraction: number | null }
  | { id: string; role: 'result'; imported: ImportedSong; savedId: string | null }
  | { id: string; role: 'error'; text: string }

const ACCEPT = 'image/*,.pdf,.docx,.txt,.chordpro,.cho,.crd,.chopro,.pro,.xml'

/** Chat-style import assistant: paste text or drop photos/PDF/DOCX → a song card ready to save. */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const aiApiKey = useSettings((s) => s.settings.aiApiKey)
  const [useAi, setUseAi] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const busy = messages.some((m) => m.role === 'progress')

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const push = (m: Message): void => setMessages((ms) => [...ms, m])
  const replace = (id: string, m: Message | null): void =>
    setMessages((ms) => (m ? ms.map((x) => (x.id === id ? m : x)) : ms.filter((x) => x.id !== id)))

  const submitText = (): void => {
    const value = text.trim()
    if (!value || busy) return
    push({ id: newId(), role: 'user', text: value })
    setText('')
    try {
      push({ id: newId(), role: 'result', imported: importFromText(value), savedId: null })
    } catch (err) {
      console.error(err)
      push({ id: newId(), role: 'error', text: cs.import.failed })
    }
  }

  const submitFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0 || busy) return
    push({
      id: newId(),
      role: 'user',
      files: files.map((f) => ({
        name: f.name,
        image: classifyFile(f) === 'image' ? URL.createObjectURL(f) : undefined
      }))
    })
    const progressId = newId()
    push({ id: progressId, role: 'progress', label: cs.import.processing, fraction: null })
    try {
      const { songs, unsupported } = await importFromFiles(
        files,
        (label, fraction) => replace(progressId, { id: progressId, role: 'progress', label, fraction }),
        { aiApiKey: useAi && aiApiKey ? aiApiKey : undefined }
      )
      replace(progressId, null)
      for (const imported of songs) push({ id: newId(), role: 'result', imported, savedId: null })
      for (const name of unsupported) push({ id: newId(), role: 'error', text: cs.import.unsupported(name) })
    } catch (err) {
      console.error(err)
      const text = err instanceof Error && useAi ? err.message : cs.import.failed
      replace(progressId, { id: progressId, role: 'error', text })
    }
  }

  const updateSong = (id: string, song: Song): void =>
    setMessages((ms) =>
      ms.map((m) =>
        m.id === id && m.role === 'result'
          ? { ...m, imported: { ...m.imported, result: { ...m.imported.result, song } } }
          : m
      )
    )
  const markSaved = (id: string, savedId: string): void =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'result' ? { ...m, savedId } : m)))

  const review = messages.find(
    (m): m is Extract<Message, { role: 'result' }> => m.id === reviewId && m.role === 'result'
  )

  return (
    <D.Root open onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fade-enter fixed inset-0 z-40 bg-black/45" />
        <D.Content
          className="sheet-enter fixed inset-y-0 right-0 z-50 flex w-[min(720px,100vw)] flex-col bg-panel shadow-overlay ring-1 ring-line focus:outline-none"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void submitFiles([...e.dataTransfer.files])
          }}
          aria-describedby="import-intro"
        >
          <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <ScanText className="size-[18px] text-ink-2" aria-hidden />
            <D.Title className="flex-1 text-title font-[650] text-ink">{cs.import.title}</D.Title>
            <D.Close
              aria-label={cs.common.close}
              className="press grid size-9 place-items-center rounded-control text-ink-2 hover:bg-raised hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </D.Close>
          </header>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5" aria-live="polite">
            <div className="flex flex-col gap-4">
              <AssistantBubble>
                <p id="import-intro" className="text-body text-ink [text-wrap:pretty]">
                  {cs.import.intro}
                </p>
              </AssistantBubble>
              {messages.map((m) => {
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-card bg-raised-2 px-3.5 py-2.5 ring-1 ring-inset ring-line">
                        {m.text ? (
                          <pre className="selectable max-h-48 overflow-hidden whitespace-pre-wrap font-sans text-small text-ink">
                            {m.text.length > 600 ? `${m.text.slice(0, 600)}…` : m.text}
                          </pre>
                        ) : null}
                        {m.files ? (
                          <ul className="flex flex-wrap gap-2">
                            {m.files.map((f) => (
                              <li key={f.name} className="flex items-center gap-2 text-small text-ink">
                                {f.image ? (
                                  <img
                                    src={f.image}
                                    alt=""
                                    className="size-12 rounded-[6px] object-cover ring-1 ring-line"
                                  />
                                ) : (
                                  <FileUp className="size-4 text-ink-2" aria-hidden />
                                )}
                                <span className="max-w-[220px] truncate">{f.name}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  )
                }
                if (m.role === 'progress') {
                  return (
                    <AssistantBubble key={m.id}>
                      <div className="flex items-center gap-2.5 text-body text-ink" role="status">
                        <Loader2 className="size-4 animate-spin text-ink-2" aria-hidden />
                        {m.label}
                      </div>
                      {m.fraction !== null ? (
                        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-raised-2">
                          <div
                            className="h-full rounded-full bg-light transition-[width] duration-300"
                            style={{ width: `${Math.round(m.fraction * 100)}%` }}
                          />
                        </div>
                      ) : null}
                    </AssistantBubble>
                  )
                }
                if (m.role === 'error') {
                  return (
                    <AssistantBubble key={m.id}>
                      <p className="text-body text-danger" role="alert">
                        {m.text}
                      </p>
                    </AssistantBubble>
                  )
                }
                return (
                  <ImportCard
                    key={m.id}
                    imported={m.imported}
                    savedId={m.savedId}
                    onChange={(song) => updateSong(m.id, song)}
                    onSaved={(id) => markSaved(m.id, id)}
                    onReview={() => setReviewId(m.id)}
                  />
                )
              })}
            </div>
          </div>

          <form
            className="border-t border-line p-4"
            onSubmit={(e) => {
              e.preventDefault()
              submitText()
            }}
          >
            <div className="flex flex-col gap-2 rounded-card bg-raised p-2 ring-1 ring-inset ring-line focus-within:ring-2 focus-within:ring-light">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    submitText()
                  }
                }}
                onPaste={(e) => {
                  const files = [...e.clipboardData.files]
                  if (files.length > 0) {
                    e.preventDefault()
                    void submitFiles(files)
                  }
                }}
                rows={5}
                placeholder={cs.import.inputPlaceholder}
                aria-label={cs.import.inputPlaceholder}
                className="selectable max-h-[40vh] min-h-24 resize-y bg-transparent px-2 py-1.5 text-body text-ink placeholder:text-ink-3 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  data-testid="import-file-input"
                  onChange={(e) => {
                    void submitFiles([...(e.target.files ?? [])])
                    e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Paperclip aria-hidden />
                  {cs.import.attach}
                </Button>
                {aiApiKey ? (
                  <label
                    className="flex items-center gap-2 text-small text-ink-2"
                    title={cs.import.aiOptionHint}
                  >
                    <Switch checked={useAi} onCheckedChange={setUseAi} aria-label={cs.import.aiOption} />
                    {cs.import.aiOption}
                  </label>
                ) : (
                  <span className="hidden text-meta text-ink-3 sm:inline">⌘/Ctrl + Enter</span>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  disabled={!text.trim() || busy}
                >
                  {cs.import.send}
                </Button>
              </div>
            </div>
          </form>

          {dragging ? (
            <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-panel bg-panel/92 ring-2 ring-dashed ring-light">
              <div className="flex flex-col items-center gap-2 text-ink">
                <ImageIcon className="size-8" aria-hidden />
                <span className="text-title font-[650]">{cs.import.dropHere}</span>
              </div>
            </div>
          ) : null}

          {review ? (
            <ReviewDialog
              imported={review.imported}
              open
              onOpenChange={(o) => !o && setReviewId(null)}
              onApply={(song) => updateSong(review.id, song)}
            />
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

function AssistantBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('max-w-[92%] rounded-card bg-raised px-4 py-3 ring-1 ring-inset ring-line', className)}
    >
      {children}
    </div>
  )
}
