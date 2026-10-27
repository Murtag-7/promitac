import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { api } from './api/client'
import { AppShell } from './components/shell/AppShell'
import { TooltipProvider } from './components/ui/tooltip'
import { cs } from './i18n/cs'
import { startOutputEngine } from './live/engine'
import { useBible } from './store/bible'
import { useLibrary } from './store/library'
import { useMedia } from './store/media'
import { usePlans } from './store/plans'
import { useSettings } from './store/settings'
import { useSync } from './store/sync'
import { useThemes } from './store/themes'
import { useLive } from './store/live'
import { sortPlans } from './store/plans'

async function loadAll(): Promise<void> {
  await Promise.all([
    useSettings.getState().load(),
    useLibrary.getState().load(),
    usePlans.getState().load(),
    useThemes.getState().load(),
    useMedia.getState().load(),
    useBible.getState().loadList()
  ])
}

/** Reload data after a background sync brought changes (never touches the live state). */
async function reloadFromSync(): Promise<void> {
  await Promise.all([
    useLibrary.getState().load(),
    usePlans.getState().load(),
    useThemes.getState().load(),
    useMedia.getState().load()
  ])
}

function pickInitialPlan(): void {
  const { upcoming, past } = sortPlans(Object.values(usePlans.getState().plans))
  const plan = upcoming[0] ?? past[0]
  if (plan) useLive.getState().setPlan(plan.id)
}

export function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const uiTheme = useSettings((s) => s.settings.uiTheme)

  useEffect(() => {
    let stop: (() => void) | undefined
    loadAll()
      .then(() => {
        pickInitialPlan()
        stop = startOutputEngine()
        void useSync.getState().init(() => void reloadFromSync())
        api().songs.onExternalChange(() => void useLibrary.getState().load())
        setState('ready')
      })
      .catch((err) => {
        console.error(err)
        setState('error')
      })
    return () => stop?.()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light', uiTheme === 'light')
    document.documentElement.classList.toggle('dark', uiTheme !== 'light')
  }, [uiTheme])

  return (
    <TooltipProvider>
      {state === 'ready' ? (
        <AppShell />
      ) : (
        <div className="grid h-full place-items-center text-ink-2" role="status">
          {state === 'loading' ? cs.app.loading : cs.app.loadFailed}
        </div>
      )}
      <Toaster
        theme={uiTheme === 'light' ? 'light' : 'dark'}
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              '!bg-panel !text-ink !ring-1 !ring-line !border-0 !rounded-card !shadow-overlay !font-sans',
            description: '!text-ink-2'
          }
        }}
      />
    </TooltipProvider>
  )
}
