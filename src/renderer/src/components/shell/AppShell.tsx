import { BookOpen, Images, ListMusic, MonitorPlay, Music4, Settings2, Sparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { currentLiveItems, useLive } from '@/store/live'
import { useUi, type View } from '@/store/ui'
import { SyncIndicator } from './SyncIndicator'
import { LiveScreen } from '@/features/live/LiveScreen'

const PlanScreen = lazy(() => import('@/features/plan/PlanScreen').then((m) => ({ default: m.PlanScreen })))
const SongsScreen = lazy(() =>
  import('@/features/songs/SongsScreen').then((m) => ({ default: m.SongsScreen }))
)
const BibleScreen = lazy(() =>
  import('@/features/bible/BibleScreen').then((m) => ({ default: m.BibleScreen }))
)
const MediaScreen = lazy(() =>
  import('@/features/media/MediaScreen').then((m) => ({ default: m.MediaScreen }))
)
const SettingsScreen = lazy(() =>
  import('@/features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
)
const ImportPanel = lazy(() =>
  import('@/features/import/ImportPanel').then((m) => ({ default: m.ImportPanel }))
)

const NAV: Array<{ view: View; label: string; icon: typeof MonitorPlay }> = [
  { view: 'live', label: cs.nav.live, icon: MonitorPlay },
  { view: 'plan', label: cs.nav.plan, icon: ListMusic },
  { view: 'songs', label: cs.nav.songs, icon: Music4 },
  { view: 'bible', label: cs.nav.bible, icon: BookOpen },
  { view: 'media', label: cs.nav.media, icon: Images },
  { view: 'settings', label: cs.nav.settings, icon: Settings2 }
]

export function AppShell() {
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const importOpen = useUi((s) => s.importOpen)
  const setImportOpen = useUi((s) => s.setImportOpen)
  const isMac = api().platform === 'darwin'

  return (
    <div className="flex h-full flex-col bg-bg">
      <header
        className={cn(
          'drag flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-panel pr-3',
          isMac ? 'pl-[84px]' : 'pl-3'
        )}
      >
        <nav aria-label={cs.nav.label} className="no-drag flex items-center gap-0.5">
          {NAV.map(({ view: v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-current={view === v ? 'page' : undefined}
              className={cn(
                'press relative flex h-9 items-center gap-2 rounded-control px-3 text-body font-[550] text-ink-2 hover:bg-raised hover:text-ink',
                view === v && 'bg-raised text-ink ring-1 ring-inset ring-line'
              )}
            >
              <Icon className="size-[17px]" strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="no-drag flex items-center gap-2">
          <LivePill onOpen={() => setView('live')} />
          <SyncIndicator />
          <Button variant="primary" size="md" onClick={() => setImportOpen(true)}>
            <Sparkles aria-hidden />
            {cs.nav.import}
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Suspense fallback={null}>
          {view === 'live' ? <LiveScreen /> : null}
          {view === 'plan' ? <PlanScreen /> : null}
          {view === 'songs' ? <SongsScreen /> : null}
          {view === 'bible' ? <BibleScreen /> : null}
          {view === 'media' ? <MediaScreen /> : null}
          {view === 'settings' ? <SettingsScreen /> : null}
        </Suspense>
      </main>
      <Suspense fallback={null}>
        {importOpen ? <ImportPanel onClose={() => setImportOpen(false)} /> : null}
      </Suspense>
    </div>
  )
}

/** Always-visible indicator of what is on the screen right now (red tally = on air). */
function LivePill({ onOpen }: { onOpen: () => void }) {
  const live = useLive((s) => s.live)
  const timer = useLive((s) => s.timer)
  useLive((s) => s.planId)
  const item = live.itemId ? currentLiveItems().find((i) => i.id === live.itemId) : undefined
  const onAir = Boolean(item) || Boolean(timer)
  const text =
    live.overlay !== 'none'
      ? cs.live.overlayActive[live.overlay]
      : timer
        ? cs.live.timer
        : item
          ? item.title
          : cs.live.nothingLive

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="live-pill"
      className={cn(
        'press flex h-8 max-w-[280px] items-center gap-2 rounded-full px-3 text-small font-[550] ring-1 ring-inset',
        onAir ? 'bg-live-soft text-ink ring-live/40' : 'text-ink-3 ring-line hover:text-ink-2'
      )}
      title={cs.live.onAir}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', onAir ? 'bg-live' : 'bg-ink-3/60')} />
      <span className="truncate">
        {onAir ? <span className="text-live">{cs.live.onAir}</span> : null}
        {onAir ? <span className="text-ink-3"> · </span> : null}
        {text}
      </span>
    </button>
  )
}
