import { toast } from 'sonner'
import { type MediaItem, mediaKindFromName } from '@core/media/model'
import { nowIso } from '@core/util/id'
import { cs } from '@/i18n/cs'
import { addToLivePlan, projectNow, useLive } from '@/store/live'
import { useMedia } from '@/store/media'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'

/** Import picked/dropped files; unsupported ones are reported and skipped. */
export async function importMediaFiles(files: File[], onPending: (count: number) => void): Promise<void> {
  const supported = files.filter((f) => mediaKindFromName(f.name))
  const unsupported = files.filter((f) => !mediaKindFromName(f.name))
  if (unsupported.length === 1) toast.error(cs.media.unsupported(unsupported[0]!.name))
  else if (unsupported.length > 1)
    toast.error(cs.media.unsupportedMany(unsupported.length), {
      description: unsupported.map((f) => f.name).join(', ')
    })
  if (supported.length === 0) return
  onPending(supported.length)
  try {
    const added = await useMedia.getState().importFiles(supported)
    if (added.length > 0) toast.success(cs.media.imported(added.length))
    else toast.error(cs.media.importFailed)
  } catch (err) {
    console.error('Media import failed', err)
    toast.error(cs.media.importFailed)
  } finally {
    onPending(0)
  }
}

const goLive = { label: cs.media.showInLive, onClick: () => useUi.getState().setView('live') }

export async function addMediaToPlan(m: MediaItem): Promise<void> {
  await addToLivePlan({ type: 'media', mediaId: m.id })
  toast.success(cs.media.addedToPlan(m.name), { action: goLive })
}

export async function projectMediaNow(m: MediaItem): Promise<void> {
  await projectNow({ type: 'media', mediaId: m.id })
  useUi.getState().setView('live')
}

export function toggleLogo(m: MediaItem): void {
  const isLogo = useSettings.getState().settings.logoMediaId === m.id
  void useSettings.getState().update({ logoMediaId: isLogo ? undefined : m.id })
  toast.success(isLogo ? cs.media.logoRemoved : cs.media.logoSet)
}

export function toggleBackground(m: MediaItem): void {
  const live = useLive.getState()
  const previous = live.backgroundOverride
  const active = previous !== null && 'mediaId' in previous && previous.mediaId === m.id
  live.setBackgroundOverride(active ? null : { kind: m.kind, mediaId: m.id, fallbackColor: '#000000' })
  toast.success(active ? cs.media.backgroundReset : cs.media.backgroundSet, {
    action: { label: cs.media.undo, onClick: () => useLive.getState().setBackgroundOverride(previous) }
  })
}

export function setLocalOnly(m: MediaItem, localOnly: boolean): void {
  void useMedia.getState().update({ ...m, localOnly, updatedAt: nowIso() })
}

export async function renameMedia(m: MediaItem, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed || trimmed === m.name) return
  await useMedia.getState().update({ ...m, name: trimmed, updatedAt: nowIso() })
}

/** Delete a media item; it stops being the logo or the live background first. */
export async function deleteMedia(m: MediaItem): Promise<void> {
  if (useSettings.getState().settings.logoMediaId === m.id) {
    await useSettings.getState().update({ logoMediaId: undefined })
  }
  const bg = useLive.getState().backgroundOverride
  if (bg && 'mediaId' in bg && bg.mediaId === m.id) useLive.getState().setBackgroundOverride(null)
  await useMedia.getState().remove(m.id)
  toast.success(cs.media.deleted(m.name))
}
