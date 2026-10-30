import { useState } from 'react'
import { DropdownMenu } from 'radix-ui'
import { toast } from 'sonner'
import {
  BadgeCheck,
  BadgeX,
  Check,
  HardDrive,
  ImageOff,
  ListPlus,
  MonitorPlay,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  Undo2,
  Wallpaper
} from 'lucide-react'
import { MAX_SYNC_MEDIA_BYTES, type MediaItem } from '@core/media/model'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Tip } from '@/components/ui/tooltip'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { mediaUrl } from '@/store/media'
import { addMediaToPlan, projectMediaNow, setLocalOnly, toggleBackground, toggleLogo } from './actions'
import { formatDuration, formatFileSize } from './format'

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-chip bg-bg/85 px-2 text-meta font-[600] text-ink ring-1 ring-inset ring-line-strong backdrop-blur-sm [&_svg]:size-3.5">
      {children}
    </span>
  )
}

/** One media file: thumbnail (video = first frame + duration), name, size and an action menu. */
export function MediaCard({
  item,
  isLogo,
  isBackground,
  onRename,
  onDelete
}: {
  item: MediaItem
  isLogo: boolean
  isBackground: boolean
  onRename: (m: MediaItem) => void
  onDelete: (m: MediaItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [broken, setBroken] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)
  const url = mediaUrl(item)
  const tooLarge = item.size > MAX_SYNC_MEDIA_BYTES
  const kindLabel = item.kind === 'video' ? cs.media.video : cs.media.image
  const durationText = duration !== null ? formatDuration(duration) : ''

  const guarded = (fn: () => Promise<void>) => () => {
    fn().catch((err: unknown) => {
      console.error(err)
      toast.error(cs.common.error)
    })
  }

  return (
    <li className="flex min-w-0 flex-col gap-2.5" data-media-id={item.id}>
      {/* Mouse convenience: clicking the picture opens the same menu as the ⋯ button. */}
      <div
        className="relative aspect-video overflow-hidden rounded-card bg-black"
        onClick={() => setOpen(true)}
      >
        {broken || !url ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-raised text-small text-ink-2">
            <ImageOff className="size-5" aria-hidden />
            {cs.media.brokenFile}
          </div>
        ) : item.kind === 'image' ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setBroken(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <video
            src={`${url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            disablePictureInPicture
            tabIndex={-1}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setBroken(true)}
            className="h-full w-full object-contain"
          />
        )}
        <div className="pointer-events-none absolute inset-0 rounded-card ring-1 ring-inset ring-white/[0.06]" />
        {isLogo || isBackground ? (
          <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
            {isLogo ? (
              <Chip>
                <BadgeCheck aria-hidden />
                {cs.media.isLogo}
              </Chip>
            ) : null}
            {isBackground ? (
              <Chip>
                <Wallpaper aria-hidden />
                {cs.media.isBackground}
              </Chip>
            ) : null}
          </div>
        ) : null}
        {item.kind === 'video' && !broken ? (
          <>
            <span
              aria-hidden
              className="absolute bottom-2 left-2 grid size-7 place-items-center rounded-full bg-black/65 text-white"
            >
              <Play className="ml-px size-3.5 fill-current" />
            </span>
            {durationText ? (
              <span className="absolute bottom-2 right-2 rounded-chip bg-black/65 px-1.5 py-0.5 text-meta font-[600] tabular text-white">
                {durationText}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pl-0.5">
          <div className="truncate text-body font-[550] text-ink" title={item.name}>
            {item.name}
          </div>
          <div className="flex items-center gap-1.5 text-small text-ink-2">
            <span>{kindLabel}</span>
            <span aria-hidden>·</span>
            <span className="tabular">{formatFileSize(item.size)}</span>
            {item.localOnly ? (
              <Tip label={cs.media.localOnly}>
                <span className="flex items-center">
                  <HardDrive className="size-3.5" aria-hidden />
                  <span className="sr-only">{cs.media.localOnly}</span>
                </span>
              </Tip>
            ) : null}
          </div>
        </div>
        <Menu open={open} onOpenChange={setOpen}>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={cs.media.actionsFor(item.name)}>
              <MoreHorizontal aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent className="w-64">
            <MenuItem onSelect={guarded(() => addMediaToPlan(item))}>
              <ListPlus aria-hidden />
              {cs.common.addToPlan}
            </MenuItem>
            <MenuItem onSelect={guarded(() => projectMediaNow(item))}>
              <MonitorPlay aria-hidden />
              {cs.common.projectNow}
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => toggleLogo(item)}>
              {isLogo ? <BadgeX aria-hidden /> : <BadgeCheck aria-hidden />}
              {isLogo ? cs.media.removeLogo : cs.media.useAsLogo}
            </MenuItem>
            <MenuItem onSelect={() => toggleBackground(item)}>
              {isBackground ? <Undo2 aria-hidden /> : <Wallpaper aria-hidden />}
              {isBackground ? cs.media.resetBackground : cs.media.useAsBackground}
            </MenuItem>
            <MenuSeparator />
            <DropdownMenu.CheckboxItem
              checked={item.localOnly}
              disabled={tooLarge}
              onCheckedChange={(checked) => setLocalOnly(item, checked === true)}
              onSelect={(e) => e.preventDefault()}
              className={cn(
                'flex cursor-default select-none items-start gap-2 rounded-[6px] px-2.5 py-1.5 text-body text-ink outline-none data-[highlighted]:bg-raised',
                tooLarge && 'opacity-60'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] ring-1 ring-inset',
                  item.localOnly ? 'bg-light text-light-ink ring-light' : 'ring-line-strong'
                )}
              >
                {item.localOnly ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block">{cs.media.localOnly}</span>
                <span className="block text-meta text-ink-2">
                  {tooLarge ? cs.media.localOnlyForced : cs.media.localOnlyHint}
                </span>
              </span>
            </DropdownMenu.CheckboxItem>
            <MenuItem onSelect={() => onRename(item)}>
              <Pencil aria-hidden />
              {cs.common.rename}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => onDelete(item)}>
              <Trash2 aria-hidden />
              {cs.common.delete}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  )
}
