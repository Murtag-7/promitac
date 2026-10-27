import { LogIn, Plug, Unplug, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SyncStatus } from '@shared/api'
import { api } from '@/api/client'
import { Segmented } from '@/components/ui/segmented'
import { cs } from '@/i18n/cs'
import { useSettings } from '@/store/settings'
import { useSync } from '@/store/sync'
import { NoOrgView, OrgView } from './accountOrg'
import {
  BusyButton,
  InlineError,
  InlineSuccess,
  TextField,
  isValidEmail,
  isValidSupabaseUrl,
  useAction
} from './accountUi'
import { SettingsGroup, SettingsPage } from './layout'

const s = cs.sync

/**
 * Supabase account and shared library. The view follows the sync status: not connected →
 * signed out → signed in without a church → member of a church.
 */
export function AccountPanel() {
  const storeStatus = useSync((st) => st.status)
  // Status returned directly by an action – shown until the next broadcast arrives.
  const [fresh, setFresh] = useState<SyncStatus | null>(null)
  useEffect(() => setFresh(null), [storeStatus])
  const status = fresh ?? storeStatus

  const refresh = useCallback(async () => {
    try {
      setFresh(await api().sync.status())
    } catch {
      // keep what we have – the store still follows broadcasts
    }
  }, [])

  if (!status.configured && !status.builtInConfig) return <ConnectView onStatus={setFresh} />
  if (!status.user) return <AuthView status={status} onStatus={setFresh} refresh={refresh} />
  if (!status.org) return <NoOrgView status={status} refresh={refresh} />
  return <OrgView status={status} refresh={refresh} />
}

function ConnectView({ onStatus }: { onStatus: (s: SyncStatus) => void }) {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [tried, setTried] = useState(false)
  const act = useAction()
  const urlError = tried && !isValidSupabaseUrl(url) ? s.urlInvalid : null
  const keyError = tried && !key.trim() ? s.keyMissing : null

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    setTried(true)
    if (!isValidSupabaseUrl(url) || !key.trim()) return
    void act.run(async () => {
      const next = await api().sync.configure({
        url: url.trim().replace(/\/+$/, ''),
        anonKey: key.trim()
      })
      onStatus(next)
      if (next.configured || next.builtInConfig) return null
      return next.error ?? (api().platform === 'web' ? s.webUnavailable : s.configureFailed)
    })
  }

  return (
    <SettingsPage title={s.title} hint={s.localHint}>
      <SettingsGroup title={s.connectTitle}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4 px-4 py-4" aria-label={s.connect}>
          <TextField
            label={s.url}
            type="url"
            inputMode="url"
            placeholder={s.urlPlaceholder}
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={urlError}
          />
          <TextField
            label={s.anonKey}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            error={keyError}
            hint={s.connectHint}
            className="[&_input]:font-mono [&_input]:text-small"
          />
          {act.error ? <InlineError>{act.error}</InlineError> : null}
          <div className="flex justify-end">
            <BusyButton type="submit" variant="primary" icon={Plug} busy={act.busy}>
              {s.connectAction}
            </BusyButton>
          </div>
        </form>
      </SettingsGroup>
    </SettingsPage>
  )
}

type AuthMode = 'signIn' | 'signUp'

function AuthView({
  status,
  onStatus,
  refresh
}: {
  status: SyncStatus
  onStatus: (s: SyncStatus) => void
  refresh: () => Promise<void>
}) {
  const [mode, setMode] = useState<AuthMode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  const [signedUp, setSignedUp] = useState(false)
  const act = useAction()

  const emailError = tried && !isValidEmail(email) ? s.emailInvalid : null
  const passwordError = !tried
    ? null
    : !password
      ? s.passwordMissing
      : mode === 'signUp' && password.length < 6
        ? s.passwordShort
        : null

  const switchMode = (m: AuthMode): void => {
    setMode(m)
    setTried(false)
    act.setError(null)
    if (m === 'signUp') setSignedUp(false)
  }

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    setTried(true)
    if (!isValidEmail(email) || !password || (mode === 'signUp' && password.length < 6)) return
    void act.run(async () => {
      const res =
        mode === 'signIn'
          ? await api().sync.signIn(email.trim(), password)
          : await api().sync.signUp(email.trim(), password)
      if (!res.ok) return res.error ?? s.actionFailed
      if (mode === 'signUp') {
        setSignedUp(true)
        setMode('signIn')
        setTried(false)
      }
      setPassword('')
      await refresh()
      return null
    })
  }

  return (
    <SettingsPage title={s.title} hint={s.localHint}>
      <SettingsGroup title={s.authTitle}>
        <div className="flex flex-col gap-4 px-4 py-4">
          <Segmented
            aria-label={s.authMode}
            value={mode}
            onChange={switchMode}
            className="self-start [&>button]:h-8 [&>button]:px-3"
            options={[
              { value: 'signIn', label: s.signIn },
              { value: 'signUp', label: s.signUp }
            ]}
          />
          {signedUp ? <InlineSuccess>{s.signUpDone}</InlineSuccess> : null}
          <form
            noValidate
            onSubmit={submit}
            className="flex flex-col gap-4"
            aria-label={mode === 'signIn' ? s.signIn : s.signUp}
          >
            <TextField
              label={s.email}
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
            />
            <TextField
              label={s.password}
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError}
              hint={mode === 'signUp' ? s.passwordHint : undefined}
            />
            {act.error ? <InlineError>{act.error}</InlineError> : null}
            <div className="flex justify-end">
              <BusyButton
                type="submit"
                variant="primary"
                icon={mode === 'signIn' ? LogIn : UserPlus}
                busy={act.busy}
              >
                {mode === 'signIn' ? s.signIn : s.signUp}
              </BusyButton>
            </div>
          </form>
        </div>
      </SettingsGroup>
      <ConnectionGroup builtIn={status.builtInConfig} onStatus={onStatus} />
    </SettingsPage>
  )
}

/** Which Supabase project the app talks to, with "Odpojit" unless it is baked into the build. */
function ConnectionGroup({ builtIn, onStatus }: { builtIn: boolean; onStatus: (s: SyncStatus) => void }) {
  const url = useSettings((st) => st.settings.supabase?.url)
  const act = useAction()
  let host = 'Supabase'
  try {
    if (url) host = new URL(url).host
  } catch {
    // keep the generic name
  }

  return (
    <SettingsGroup>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-body font-[550] text-ink [overflow-wrap:anywhere]">
            {builtIn ? s.builtInConnected : s.connectedTo(host)}
          </div>
        </div>
        {!builtIn ? (
          <BusyButton
            variant="secondary"
            icon={Unplug}
            busy={act.busy}
            onClick={() =>
              void act.run(async () => {
                onStatus(await api().sync.configure(null))
                return null
              })
            }
          >
            {s.disconnect}
          </BusyButton>
        ) : null}
      </div>
      {act.error ? (
        <div className="px-4 pb-3.5">
          <InlineError>{act.error}</InlineError>
        </div>
      ) : null}
    </SettingsGroup>
  )
}
