import { useState } from 'react'
import { toast } from 'sonner'
import type { MediaItem } from '@core/media/model'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { cs } from '@/i18n/cs'
import { useSettings } from '@/store/settings'
import { deleteMedia, renameMedia } from './actions'

export function RenameMediaDialog({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      {item ? <RenameForm key={item.id} item={item} onClose={onClose} /> : null}
    </Dialog>
  )
}

function RenameForm({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [name, setName] = useState(item.name)
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length > 0

  const submit = async (): Promise<void> => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await renameMedia(item, name)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(cs.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent title={cs.media.renameTitle}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="media-rename">{cs.media.name}</Label>
          <Input
            id="media-rename"
            value={name}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{cs.common.cancel}</Button>
          </DialogClose>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            {cs.common.save}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

export function DeleteMediaDialog({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  const logoId = useSettings((s) => s.settings.logoMediaId)
  const [busy, setBusy] = useState(false)

  const remove = async (): Promise<void> => {
    if (!item) return
    setBusy(true)
    try {
      await deleteMedia(item)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(cs.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      {item ? (
        <DialogContent title={cs.media.deleteTitle} description={cs.media.deleteText(item.name)}>
          {logoId === item.id ? <p className="text-small text-warn">{cs.media.deleteLogoNote}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{cs.common.cancel}</Button>
            </DialogClose>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              {cs.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
