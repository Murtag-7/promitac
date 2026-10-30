import { ChevronRight, LogIn, Plug, Unplug, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SyncStatus } from '@shared/api'
import { api } from '@/api/client'
import { Segmented } from '@/components/ui/segmented'
import { cs } from '@/i18n/cs'
import { useSettings } from '@/store/settings'
import { useSync } from '@/store/sync'
import { NoOrgView, OrgView } from './accountOrg'
import { ShareCodeRow } from './accountConnection'
import {
  BusyButton,
  InlineError,
  InlineSuccess,
  TextField,
  isValidEmail,
  isValidSupabaseUrl,
  useAction
} from './accountUi'
import { decodeConnectionCode, setPendingInvite } from './connectionCode'
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
  return (
    <SettingsPage title={s.title} hint={s.localHint}>
      <CodeConnectGroup onStatus={onStatus} />
      <ManualConnectGroup onStatus={onStatus} />
    </SettingsPage>
  )
}

async function connect(config: { url: string; anonKey: string }): Promise<SyncStatus> {
  return api().sync.configure(config)
}

function connectError(next: SyncStatus): string | null {
  if (next.configured || next.builtInConfig) return null
  return next.error ?? (api().platform === 'web' ? s.webUnavailable : s.configureFailed)
}

/** The usual way in: paste the one code the church administrator sent. */
function CodeConnectGroup({ onStatus }: { onStatus: (s: SyncStatus) => void }) {
  const [code, setCode] = useState('')
  const [tried, setTried] = useState(false)
  const act = useAction()
  const decoded = decodeConnectionCode(code)
  const codeError = !tried
    ? null
    : !code.trim()
      ? s.connectionCodeMissing
      : !decoded
        ? s.connectionCodeInvalid
        : null

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    setTried(true)
    if (!decoded) return
    void act.run(async () => {
      setPendingInvite(decoded.invite ?? null)
      const next = await connect({ url: decoded.url, anonKey: decoded.anonKey })
      onStatus(next)
      return connectError(next)
    })
  }

  return (
    <SettingsGroup title={s.connectTitle}>
      <form
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4 px-4 py-4"
        aria-label={s.connectTitle}
      >
        <TextField
          label={s.connectionCode}
          placeholder={s.connectionCodePlaceholder}
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={codeError}
          hint={s.connectionCodeHint}
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
  )
}

/** For the administrator setting up the shared library for the first time. */
function ManualConnectGroup({ onStatus }: { onStatus: (s: SyncStatus) => void }) {
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
      const next = await connect({ url: url.trim().replace(/\/+$/, ''), anonKey: key.trim() })
      onStatus(next)
      return connectError(next)
    })
  }

  return (
    <details className="group rounded-card bg-panel ring-1 ring-inset ring-line">
      <summary className="press flex min-h-12 cursor-default list-none items-center gap-2 rounded-card px-4 py-3 text-body font-[550] text-ink hover:bg-raised [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 text-ink-2 transition-transform duration-150 group-open:rotate-90"
          aria-hidden
        />
        {s.advancedTitle}
      </summary>
      <form
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4 border-t border-line px-4 py-4"
        aria-label={s.connect}
      >
        <p className="text-small text-ink-2 [text-wrap:pretty]">{s.advancedHint}</p>
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
          <BusyButton type="submit" variant="secondary" icon={Plug} busy={act.busy}>
            {s.connectAction}
          </BusyButton>
        </div>
      </form>
    </details>
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
      <ShareCodeRow builtIn={builtIn} />
    </SettingsGroup>
  )
}
