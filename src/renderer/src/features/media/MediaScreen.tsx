import { useRef, useState } from 'react'
import { ImagePlus, Images, Upload } from 'lucide-react'
import { IMAGE_EXTENSIONS, type MediaItem, VIDEO_EXTENSIONS } from '@core/media/model'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { useLive } from '@/store/live'
import { useMedia } from '@/store/media'
import { useSettings } from '@/store/settings'
import { importMediaFiles } from './actions'
import { formatFileSize } from './format'
import { MediaCard } from './MediaCard'
import { DeleteMediaDialog, RenameMediaDialog } from './MediaDialogs'

const ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  ...[...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].map((ext) => `.${ext}`)
].join(',')

function hasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

/** Media library: grid of images and videos, drag & drop anywhere on the screen. */
export function MediaScreen() {
  const items = useMedia((s) => s.items)
  const logoId = useSettings((s) => s.settings.logoMediaId)
  const background = useLive((s) => s.backgroundOverride)
  const [pending, setPending] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [renaming, setRenaming] = useState<MediaItem | null>(null)
  const [deleting, setDeleting] = useState<MediaItem | null>(null)
  const depth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const backgroundId = background && 'mediaId' in background ? background.mediaId : null
  const newestFirst = [...items].reverse()
  const totalSize = items.reduce((sum, m) => sum + m.size, 0)
  const pick = (): void => inputRef.current?.click()
  const importFiles = (files: File[]): void => {
    if (files.length > 0) void importMediaFiles(files, setPending)
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        importFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <header className="flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-3">
        <div className="min-w-0">
          <h1 className="text-screen font-[650] tracking-[-0.01em] text-ink">{cs.media.title}</h1>
          {items.length > 0 ? (
            <p className="text-small tabular text-ink-2">
              {cs.media.count(items.length)} · {formatFileSize(totalSize)}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {items.length > 0 ? (
            <p className="hidden text-small text-ink-2 xl:block">{cs.media.dropAnywhere}</p>
          ) : null}
          <Button variant="primary" onClick={pick} disabled={pending > 0}>
            <ImagePlus aria-hidden />
            {pending > 0 ? cs.media.importing : cs.media.import}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="media-file-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            importFiles(files)
          }}
        />
      </header>

      {items.length === 0 && pending === 0 ? (
        <div className="min-h-0 flex-1 p-6">
          <div className="h-full rounded-panel border border-dashed border-line-strong">
            <EmptyState
              icon={Images}
              title={cs.media.empty}
              text={`${cs.media.emptyHint} ${cs.media.dropHint}`}
            >
              <Button variant="primary" size="lg" onClick={pick}>
                <ImagePlus aria-hidden />
                {cs.media.import}
              </Button>
            </EmptyState>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul
            aria-label={cs.media.gridLabel}
            aria-busy={pending > 0 || undefined}
            className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-x-4 gap-y-6 p-6"
          >
            {Array.from({ length: pending }, (_, i) => (
              <li key={`pending-${i}`} aria-hidden className="flex flex-col gap-2.5">
                <div className="aspect-video animate-pulse rounded-card bg-raised" />
                <div className="h-3.5 w-2/3 animate-pulse rounded-chip bg-raised" />
                <div className="h-3 w-1/3 animate-pulse rounded-chip bg-raised" />
              </li>
            ))}
            {newestFirst.map((m) => (
              <MediaCard
                key={m.id}
                item={m}
                isLogo={m.id === logoId}
                isBackground={m.id === backgroundId}
                onRename={setRenaming}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        </div>
      )}

      {dragging ? (
        <div className="fade-enter pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-panel border-2 border-dashed border-light/70 bg-bg/90">
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="size-7 text-light" strokeWidth={1.5} aria-hidden />
            <p className="text-title font-[650] text-ink">{cs.media.dropNow}</p>
            <p className="max-w-[46ch] text-small text-ink-2">{cs.media.dropHint}</p>
          </div>
        </div>
      ) : null}

      <RenameMediaDialog item={renaming} onClose={() => setRenaming(null)} />
      <DeleteMediaDialog item={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
