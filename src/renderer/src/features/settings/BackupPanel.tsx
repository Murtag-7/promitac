import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArchiveRestore, Download, FileUp, Loader2, X } from 'lucide-react'
import { importText } from '@core/import/importText'
import { parseOpenLyrics } from '@core/import/openlyrics'
import { newId, nowIso } from '@core/util/id'
import type { BackupResult } from '@shared/api'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { useLibrary } from '@/store/library'
import { useMedia } from '@/store/media'
import { usePlans } from '@/store/plans'
import { useSettings } from '@/store/settings'
import { useThemes } from '@/store/themes'
import { useUi } from '@/store/ui'
import { type ImportFailureReason, planSongImport, SONG_FILE_ACCEPT } from './backupImportFiles'
import { SettingsGroup, SettingsPage, SettingsRow } from './layout'
import { SWITCH_HIT, TOAST_ACTION } from './generalControls'

const t = cs.settings.backup

/** Known error codes from main are translated; other messages (e.g. from the browser demo) shown as they are. */
function errorText(error: string | undefined): string {
  if (!error) return cs.common.error
  return t.errors[error] ?? error
}

function countsText(counts: NonNullable<BackupResult['counts']>): string {
  return `${cs.common.songsCount(counts.songs)}, ${t.restoredDetail(counts)}`
}

/** Reload everything that comes from the data folder after a restore. */
async function reloadStores(): Promise<void> {
  await Promise.all([
    useSettings.getState().load(),
    useLibrary.getState().load(),
    usePlans.getState().load(),
    useThemes.getState().load(),
    useMedia.getState().load()
  ])
}

interface ImportReport {
  saved: number
  failed: Array<{ fileName: string; reason: ImportFailureReason }>
  duplicates: string[]
}

export function BackupPanel() {
  return (
    <SettingsPage title={t.title}>
      <BackupGroup />
      <ImportFilesGroup />
    </SettingsPage>
  )
}

function BackupGroup() {
  const [includeMedia, setIncludeMedia] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const doExport = async (): Promise<void> => {
    setExporting(true)
    try {
      const res = await api().backup.exportZip({ includeMedia })
      if (res.ok) {
        toast.success(t.exported(res.path ?? ''), {
          description: res.counts ? countsText(res.counts) : undefined
        })
      } else if (!res.canceled) {
        toast.error(t.exportFailed, { description: errorText(res.error) })
      }
    } catch (err) {
      toast.error(t.exportFailed, { description: err instanceof Error ? err.message : cs.common.error })
    } finally {
      setExporting(false)
    }
  }

  const doRestore = async (): Promise<void> => {
    setRestoring(true)
    try {
      const res = await api().backup.importZip()
      if (res.ok) {
        await reloadStores()
        const counts = res.counts ?? { songs: 0, plans: 0, themes: 0, media: 0 }
        toast.success(t.restored(counts.songs), {
          description: [t.restoredDetail(counts), res.path ? t.savedBefore(res.path) : null]
            .filter(Boolean)
            .join('. ')
        })
      } else if (!res.canceled) {
        toast.error(t.restoreFailed, { description: errorText(res.error) })
      }
    } catch (err) {
      toast.error(t.restoreFailed, { description: err instanceof Error ? err.message : cs.common.error })
    } finally {
      setRestoring(false)
      setConfirmOpen(false)
    }
  }

  return (
    <SettingsGroup title={t.groupBackup}>
      <SettingsRow label={t.exportZip} hint={t.exportHint}>
        <Button variant="primary" onClick={() => void doExport()} disabled={exporting || restoring}>
          {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {exporting ? t.exporting : t.exportButton}
        </Button>
      </SettingsRow>
      <SettingsRow label={t.exportWithMedia} hint={t.exportWithMediaHint}>
        <Switch
          className={SWITCH_HIT}
          aria-label={t.exportWithMedia} checked={includeMedia} onCheckedChange={setIncludeMedia} />
      </SettingsRow>
      <SettingsRow label={t.importZip} hint={t.importZipHint}>
        <Dialog open={confirmOpen} onOpenChange={(open) => !restoring && setConfirmOpen(open)}>
          <Button onClick={() => setConfirmOpen(true)} disabled={exporting || restoring}>
            <ArchiveRestore aria-hidden />
            {t.importButton}
          </Button>
          <DialogContent title={t.restoreTitle}>
            <div className="flex flex-col gap-2.5 text-body text-ink-2 [text-wrap:pretty]">
              <p className="text-ink">{t.restoreText}</p>
              <p>{t.restoreKeeps}</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={restoring}>
                  {cs.common.cancel}
                </Button>
              </DialogClose>
              <Button variant="primary" onClick={() => void doRestore()} disabled={restoring}>
                {restoring ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <ArchiveRestore aria-hidden />
                )}
                {restoring ? t.restoring : t.restoreConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsRow>
    </SettingsGroup>
  )
}

function hasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

function ImportFilesGroup() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const run = async (list: File[]): Promise<void> => {
    if (list.length === 0 || progress) return
    setReport(null)
    setProgress({ done: 0, total: list.length })
    try {
      const files = await Promise.all(
        list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
      )
      const plan = planSongImport(files, Object.values(useLibrary.getState().songs), {
        importText,
        parseOpenLyrics
      })
      const failed = [...plan.failed]
      let saved = 0
      let done = plan.failed.length + plan.duplicates.length
      setProgress({ done, total: list.length })
      for (const { fileName, song } of plan.songs) {
        try {
          await useLibrary.getState().save({ ...song, id: newId(), updatedAt: nowIso() })
          saved++
        } catch (err) {
          console.error(err)
          failed.push({ fileName, reason: 'unreadable' })
        }
        setProgress({ done: ++done, total: list.length })
      }
      const result = { saved, failed, duplicates: plan.duplicates }
      setReport(result.failed.length || result.duplicates.length ? result : null)
      const description = [
        result.duplicates.length ? t.duplicates(result.duplicates.length) : null,
        result.failed.length ? t.failedTitle(result.failed.length) : null
      ]
        .filter(Boolean)
        .join(' ')
      if (saved > 0) {
        toast.success(t.importedFiles(saved), {
          description: description || undefined,
          action: { label: t.showSongs, onClick: () => useUi.getState().setView('songs') },
          classNames: { actionButton: TOAST_ACTION }
        })
      } else {
        toast.error(t.importNothing, { description: description || undefined })
      }
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t.groupImport}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.stopPropagation()
        dragDepth.current = 0
        setDragging(false)
        void run(Array.from(e.dataTransfer.files))
      }}
    >
      <h3 className="text-title font-[650] text-ink">{t.groupImport}</h3>
      <div
        className={cn(
          'relative flex flex-col divide-y divide-line rounded-card bg-panel ring-1 ring-inset ring-line transition-[box-shadow,background-color] duration-150',
          dragging && 'bg-raised ring-2 ring-light'
        )}
        data-dragging={dragging || undefined}
      >
        <SettingsRow label={t.importFiles} hint={`${t.importFilesHint} ${t.dropHint}`}>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={SONG_FILE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="import-song-files"
            onChange={(e) => void run(Array.from(e.target.files ?? []))}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={progress !== null}>
            {progress ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
            {progress ? t.importing(progress.done, progress.total) : t.chooseFiles}
          </Button>
        </SettingsRow>
        {report ? <ImportReportRow report={report} onDismiss={() => setReport(null)} /> : null}
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-card bg-raised/90 text-title font-[650] text-ink">
            {t.dropHere}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ImportReportRow({ report, onDismiss }: { report: ImportReport; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3" role="status" data-testid="import-report">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 flex-1 text-small">
        {report.duplicates.length ? (
          <p className="text-ink-2">{t.duplicates(report.duplicates.length)}</p>
        ) : null}
        {report.failed.length ? (
          <>
            <p className={cn('font-[550] text-ink', report.duplicates.length && 'mt-1.5')}>
              {t.failedTitle(report.failed.length)}
            </p>
            <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {report.failed.map((f, i) => (
                <li key={`${f.fileName}-${i}`} className="flex min-w-0 gap-2">
                  <span className="truncate font-[550] text-ink">{f.fileName}</span>
                  <span className="shrink-0 text-ink-2">{t.reasons[f.reason]}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={t.dismiss} onClick={onDismiss}>
        <X aria-hidden />
      </Button>
    </div>
  )
}
