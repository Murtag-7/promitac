import {
  Check,
  Cloud,
  CloudOff,
  Copy,
  HardDrive,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  TriangleAlert,
  UserMinus,
  UserRoundCog,
  UsersRound
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrgMember, SyncState, SyncStatus } from '@shared/api'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import {
  BusyButton,
  ConfirmDialog,
  InlineError,
  TextField,
  errorText,
  formatDateTime,
  useAction
} from './accountUi'
import { SettingsGroup, SettingsPage } from './layout'

const s = cs.sync

export interface AccountViewProps {
  status: SyncStatus
  /** Re-read the sync status after an action (the store also follows broadcasts). */
  refresh: () => Promise<void>
}

/** Signed-in header row: who is signed in + sign out. */
function SignedInRow({ email, refresh }: { email: string; refresh: () => Promise<void> }) {
  const signOut = useAction()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-panel px-4 py-3 ring-1 ring-inset ring-line">
        <span className="min-w-0 text-body text-ink [overflow-wrap:anywhere]">{s.signedInAs(email)}</span>
        <BusyButton
          variant="secondary"
          icon={LogOut}
          busy={signOut.busy}
          onClick={() =>
            void signOut.run(async () => {
              const res = await api().sync.signOut()
              if (!res.ok) return res.error ?? s.actionFailed
              await refresh()
              return null
            })
          }
        >
          {s.signOut}
        </BusyButton>
      </div>
      {signOut.error ? <InlineError>{signOut.error}</InlineError> : null}
    </div>
  )
}

/** Signed in, not a member of any church yet: create one or join with an invite code. */
export function NoOrgView({ status, refresh }: AccountViewProps) {
  return (
    <SettingsPage title={s.title} hint={s.noOrgHint}>
      <SignedInRow email={status.user?.email ?? ''} refresh={refresh} />
      <p className="-mb-2 text-body font-[550] text-ink">{s.noOrg}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <OrgForm
          title={s.createOrg}
          label={s.orgName}
          placeholder={s.orgNamePlaceholder}
          missing={s.orgNameMissing}
          submitLabel={s.createOrg}
          normalize={(v) => v.trim()}
          action={(v) => api().sync.createOrg(v)}
          refresh={refresh}
        />
        <OrgForm
          title={s.joinOrg}
          label={s.inviteCode}
          placeholder={s.codePlaceholder}
          missing={s.codeMissing}
          submitLabel={s.joinOrg}
          normalize={(v) => v.trim().toUpperCase()}
          action={(v) => api().sync.joinOrg(v)}
          refresh={refresh}
          code
        />
      </div>
    </SettingsPage>
  )
}

function OrgForm({
  title,
  label,
  placeholder,
  missing,
  submitLabel,
  normalize,
  action,
  refresh,
  code
}: {
  title: string
  label: string
  placeholder: string
  missing: string
  submitLabel: string
  normalize: (v: string) => string
  action: (v: string) => Promise<{ ok: boolean; error?: string }>
  refresh: () => Promise<void>
  code?: boolean
}) {
  const [value, setValue] = useState('')
  const [tried, setTried] = useState(false)
  const act = useAction()
  const clean = normalize(value)
  const fieldError = tried && !clean ? missing : null

  return (
    <SettingsGroup title={title}>
      <form
        noValidate
        className="flex h-full flex-col gap-4 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (!clean) return
          void act.run(async () => {
            const res = await action(clean)
            if (!res.ok) return res.error ?? s.actionFailed
            await refresh()
            return null
          })
        }}
      >
        <TextField
          label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={fieldError}
          autoComplete="off"
          spellCheck={false}
          maxLength={code ? 32 : 120}
          className={code ? '[&_input]:tabular [&_input]:uppercase [&_input]:tracking-[0.06em]' : undefined}
        />
        {act.error ? <InlineError>{act.error}</InlineError> : null}
        <div className="mt-auto flex justify-end">
          <BusyButton type="submit" variant={code ? 'secondary' : 'primary'} busy={act.busy}>
            {submitLabel}
          </BusyButton>
        </div>
      </form>
    </SettingsGroup>
  )
}

/** Member of a church: org details, invite code, sync state, members, leave / sign out. */
export function OrgView({ status, refresh }: AccountViewProps) {
  const org = status.org
  const isAdmin = org?.role === 'admin'
  const leave = useAction()
  const [confirmLeave, setConfirmLeave] = useState(false)
  if (!org) return null

  return (
    <SettingsPage title={s.title}>
      <SettingsGroup title={s.orgTitle}>
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <span className="text-title font-[650] tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
            {org.name}
          </span>
          <span className="text-small text-ink-2">
            {s.yourRole(isAdmin ? s.roleAdmin : s.roleMember)}
            <span className="text-ink-3"> · </span>
            <span className="[overflow-wrap:anywhere]">{s.signedInAs(status.user?.email ?? '')}</span>
          </span>
        </div>
        <InviteCodeRow code={org.inviteCode} isAdmin={isAdmin} refresh={refresh} />
      </SettingsGroup>

      <SyncGroup status={status} />

      <MembersGroup orgId={org.id} selfId={status.user?.id ?? ''} isAdmin={isAdmin} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BusyButton variant="danger" icon={LogOut} busy={leave.busy} onClick={() => setConfirmLeave(true)}>
            {s.leaveOrg}
          </BusyButton>
          <SignOutButton refresh={refresh} />
        </div>
        {leave.error ? <InlineError>{leave.error}</InlineError> : null}
      </div>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={s.leaveTitle}
        text={s.leaveText}
        confirmLabel={s.leaveOrg}
        danger
        onConfirm={() =>
          void leave.run(async () => {
            const res = await api().sync.leaveOrg()
            if (!res.ok) return res.error ?? s.actionFailed
            await refresh()
            return null
          })
        }
      />
    </SettingsPage>
  )
}

function SignOutButton({ refresh }: { refresh: () => Promise<void> }) {
  const act = useAction()
  return (
    <div className="flex flex-col items-end gap-2">
      <BusyButton
        variant="secondary"
        icon={LogOut}
        busy={act.busy}
        onClick={() =>
          void act.run(async () => {
            const res = await api().sync.signOut()
            if (!res.ok) return res.error ?? s.actionFailed
            await refresh()
            return null
          })
        }
      >
        {s.signOut}
      </BusyButton>
      {act.error ? <InlineError>{act.error}</InlineError> : null}
    </div>
  )
}

function InviteCodeRow({
  code,
  isAdmin,
  refresh
}: {
  code: string | null
  isAdmin: boolean
  refresh: () => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const rotate = useAction()
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async (): Promise<void> => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopyError(false)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-body font-[550] text-ink">{s.inviteCode}</div>
          <div className="mt-0.5 text-small text-ink-2 [text-wrap:pretty]">{s.inviteHint}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="selectable tabular rounded-control bg-raised px-3 py-1.5 text-title font-[650] tracking-[0.08em] text-ink ring-1 ring-inset ring-line"
            data-testid="invite-code"
          >
            {code ?? '–'}
          </span>
          <Button variant="secondary" disabled={!code} onClick={() => void copy()} aria-live="polite">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? s.copied : s.copyCode}
          </Button>
        </div>
      </div>
      {!code ? <p className="text-small text-ink-2">{s.noCode}</p> : null}
      {copyError ? <InlineError>{s.copyFailed}</InlineError> : null}
      {isAdmin ? (
        <div className="flex flex-col items-start gap-2">
          <BusyButton
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            busy={rotate.busy}
            className="-ml-2"
            onClick={() => setConfirmRotate(true)}
          >
            {s.rotateCode}
          </BusyButton>
          {rotate.error ? <InlineError className="self-stretch">{rotate.error}</InlineError> : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title={s.rotateTitle}
        text={s.rotateText}
        confirmLabel={s.rotateCode}
        onConfirm={() =>
          void rotate.run(async () => {
            const res = await api().sync.rotateInviteCode()
            if (!res.ok) return res.error ?? s.actionFailed
            await refresh()
            return null
          })
        }
      />
    </div>
  )
}

const STATE_META: Record<SyncState, { icon: typeof Cloud; label: string; warn?: boolean; spin?: boolean }> = {
  local: { icon: HardDrive, label: s.local },
  'signed-out': { icon: CloudOff, label: s.signedOut },
  syncing: { icon: RefreshCw, label: s.syncing, spin: true },
  synced: { icon: Cloud, label: s.synced },
  offline: { icon: CloudOff, label: s.offline, warn: true },
  error: { icon: TriangleAlert, label: s.error, warn: true }
}

function SyncGroup({ status }: { status: SyncStatus }) {
  const act = useAction()
  const meta = STATE_META[status.state]
  const Icon = meta.icon
  const last = formatDateTime(status.lastSyncedAt)
  const syncing = status.state === 'syncing'

  return (
    <SettingsGroup title={s.syncTitle}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <Icon
            className={cn(
              'mt-0.5 size-[18px] shrink-0',
              meta.warn ? 'text-warn' : 'text-ink-2',
              meta.spin && 'animate-spin'
            )}
            strokeWidth={1.75}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="text-body font-[550] text-ink" data-testid="sync-state">
              {meta.label}
            </div>
            <div className="mt-0.5 text-small text-ink-2">
              {s.lastSyncedLabel}: <span className="tabular">{last ?? s.never}</span>
            </div>
          </div>
        </div>
        <BusyButton
          variant="secondary"
          icon={RefreshCw}
          busy={act.busy || syncing}
          onClick={() =>
            void act.run(async () => {
              const next = await api().sync.syncNow()
              return next.state === 'error' || next.state === 'offline'
                ? (next.error ?? (next.state === 'offline' ? s.offline : s.error))
                : null
            })
          }
        >
          {s.syncNow}
        </BusyButton>
      </div>
      {status.error || act.error ? (
        <div className="px-4 py-3">
          <InlineError>{act.error ?? status.error}</InlineError>
        </div>
      ) : null}
    </SettingsGroup>
  )
}

type MembersState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; list: OrgMember[] }

function MembersGroup({ orgId, selfId, isAdmin }: { orgId: string; selfId: string; isAdmin: boolean }) {
  const [state, setState] = useState<MembersState>({ kind: 'loading' })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<OrgMember | null>(null)
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
    },
    []
  )

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState({ kind: 'loading' })
    try {
      const list = await api().sync.members()
      if (alive.current) setState({ kind: 'ready', list })
    } catch (e) {
      if (alive.current) setState({ kind: 'error', message: errorText(e) })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, orgId])

  const runFor = async (member: OrgMember, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyId(member.userId)
    setActionError(null)
    try {
      const res = await fn()
      if (!res.ok) setActionError(res.error ?? s.actionFailed)
      else await load(true)
    } catch (e) {
      setActionError(errorText(e))
    } finally {
      if (alive.current) setBusyId(null)
    }
  }

  const count = state.kind === 'ready' ? state.list.length : null
  const sorted =
    state.kind === 'ready'
      ? [...state.list].sort((a, b) => {
          if (a.userId === selfId) return -1
          if (b.userId === selfId) return 1
          if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
          return (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email, 'cs')
        })
      : []

  return (
    <SettingsGroup title={count !== null ? `${s.members} (${count})` : s.members}>
      {state.kind === 'loading' ? (
        <div className="px-4 py-3.5 text-body text-ink-2" role="status">
          {s.membersLoading}
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <div className="flex flex-col items-start gap-3 px-4 py-3.5">
          <InlineError className="self-stretch">
            {s.membersFailed} {state.message}
          </InlineError>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {cs.common.retry}
          </Button>
        </div>
      ) : null}
      {state.kind === 'ready' && state.list.length === 0 ? (
        <div className="flex items-start gap-3 px-4 py-3.5 text-body text-ink-2">
          <UsersRound className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="[text-wrap:pretty]">{s.membersEmpty}</span>
        </div>
      ) : null}
      {state.kind === 'ready' && state.list.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line" aria-label={s.members}>
          {sorted.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              isSelf={m.userId === selfId}
              canManage={isAdmin && m.userId !== selfId}
              reserveSpace={isAdmin}
              busy={busyId === m.userId}
              onRole={(role) => void runFor(m, () => api().sync.setMemberRole(m.userId, role))}
              onRemove={() => setRemoving(m)}
            />
          ))}
          {state.list.length === 1 ? (
            <li className="px-4 py-3 text-small text-ink-2 [text-wrap:pretty]">{s.membersEmpty}</li>
          ) : null}
        </ul>
      ) : null}
      {actionError ? (
        <div className="px-4 py-3">
          <InlineError>{actionError}</InlineError>
        </div>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={s.removeMemberTitle}
        text={s.removeMemberText(removing ? (removing.displayName ?? removing.email) : '')}
        confirmLabel={s.removeMember}
        danger
        onConfirm={() => {
          const m = removing
          if (m) void runFor(m, () => api().sync.removeMember(m.userId))
        }}
      />
    </SettingsGroup>
  )
}

function MemberRow({
  member,
  isSelf,
  canManage,
  reserveSpace,
  busy,
  onRole,
  onRemove
}: {
  member: OrgMember
  isSelf: boolean
  canManage: boolean
  /** Keep the actions column aligned for rows without a menu. */
  reserveSpace: boolean
  busy: boolean
  onRole: (role: 'admin' | 'member') => void
  onRemove: () => void
}) {
  const name = member.displayName ?? member.email
  const initial = name.trim().charAt(0).toLocaleUpperCase('cs') || '?'
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-raised-2 text-small font-[650] text-ink-2 ring-1 ring-inset ring-line"
      >
        {initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-[550] text-ink">
          {name}
          {isSelf ? <span className="font-[450] text-ink-3"> ({s.you})</span> : null}
        </span>
        {member.displayName ? <span className="truncate text-small text-ink-2">{member.email}</span> : null}
      </span>
      <span
        className={cn(
          'shrink-0 rounded-chip px-1.5 py-0.5 text-meta font-[550] ring-1 ring-inset',
          member.role === 'admin' ? 'bg-raised-2 text-ink ring-line-strong' : 'text-ink-2 ring-line'
        )}
      >
        {member.role === 'admin' ? s.roleAdmin : s.roleMember}
      </span>
      {canManage ? (
        <Menu>
          <MenuTrigger asChild>
            <BusyButton
              variant="ghost"
              size="icon-sm"
              busy={busy}
              icon={MoreHorizontal}
              aria-label={s.memberActions(name)}
            />
          </MenuTrigger>
          <MenuContent>
            {member.role === 'admin' ? (
              <MenuItem onSelect={() => onRole('member')}>
                <UserRoundCog aria-hidden />
                {s.makeMember}
              </MenuItem>
            ) : (
              <MenuItem onSelect={() => onRole('admin')}>
                <UserRoundCog aria-hidden />
                {s.makeAdmin}
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem danger onSelect={onRemove}>
              <UserMinus aria-hidden />
              {s.removeMember}
            </MenuItem>
          </MenuContent>
        </Menu>
      ) : reserveSpace ? (
        <span className="size-8 shrink-0" aria-hidden />
      ) : null}
    </li>
  )
}
