import { Cloud, CloudOff, HardDrive, Loader2, TriangleAlert } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { useSync } from '@/store/sync'
import { useUi } from '@/store/ui'

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
}

/** Quiet sync state in the top bar; click opens the account settings. */
export function SyncIndicator() {
  const status = useSync((s) => s.status)
  const openSettings = useUi((s) => s.openSettings)
  const map = {
    local: { icon: HardDrive, label: cs.sync.local, tone: 'text-ink-3' },
    'signed-out': { icon: CloudOff, label: cs.sync.signedOut, tone: 'text-ink-3' },
    syncing: { icon: Loader2, label: cs.sync.syncing, tone: 'text-ink-2' },
    synced: { icon: Cloud, label: cs.sync.synced, tone: 'text-ink-2' },
    offline: { icon: CloudOff, label: cs.sync.offline, tone: 'text-ink-2' },
    error: { icon: TriangleAlert, label: cs.sync.error, tone: 'text-warn' }
  } as const
  const entry = map[status.state]
  const Icon = entry.icon
  // Offline is normal (projection never needs the network) – it is named, but calmly; only a real
  // sync error asks for attention.
  const worded = status.state === 'offline' || status.state === 'error'
  const detail =
    status.state === 'error' && status.error
      ? status.error
      : status.lastSyncedAt
        ? cs.sync.lastSynced(timeAgo(status.lastSyncedAt))
        : null

  return (
    <Tip
      label={
        <span className="flex flex-col">
          <span>{entry.label}</span>
          {detail ? <span className="text-meta text-ink-2">{detail}</span> : null}
        </span>
      }
    >
      <button
        type="button"
        onClick={() => openSettings('account')}
        aria-label={entry.label}
        data-testid="sync-indicator"
        className={cn(
          'press flex h-8 items-center gap-1.5 rounded-control hover:bg-raised',
          worded ? 'px-2.5 text-small font-[550]' : 'w-8 justify-center',
          status.state === 'error' && 'bg-warn-soft',
          entry.tone
        )}
      >
        <Icon
          className={cn('size-[17px] shrink-0', status.state === 'syncing' && 'animate-spin')}
          strokeWidth={1.75}
          aria-hidden
        />
        {worded ? <span>{status.state === 'offline' ? cs.sync.offline : cs.sync.errorShort}</span> : null}
      </button>
    </Tip>
  )
}
