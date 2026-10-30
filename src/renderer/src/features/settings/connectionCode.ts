import { isValidSupabaseUrl } from './accountUi'

/**
 * A single copy-paste code that carries the church's Supabase address and public (anon) key, so
 * the administrator can send one line to the other projection computers instead of two technical
 * values. Both values are public by design – the code is not a secret and grants nothing by itself.
 */
export interface ConnectionConfig {
  url: string
  anonKey: string
  /** Church invite code, so a new computer can join right after signing in. */
  invite?: string
}

const PREFIX = 'PROMITAC-'

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}

export function encodeConnectionCode(config: ConnectionConfig): string {
  const data: Record<string, string> = { u: config.url, k: config.anonKey }
  if (config.invite) data.i = config.invite
  return PREFIX + toBase64Url(JSON.stringify(data))
}

export function decodeConnectionCode(input: string): ConnectionConfig | null {
  const code = input.replace(/\s+/gu, '')
  if (!code.startsWith(PREFIX)) return null
  try {
    const data = JSON.parse(fromBase64Url(code.slice(PREFIX.length))) as unknown
    if (!data || typeof data !== 'object') return null
    const { u, k, i } = data as { u?: unknown; k?: unknown; i?: unknown }
    if (typeof u !== 'string' || typeof k !== 'string') return null
    const url = u.trim().replace(/\/+$/u, '')
    const anonKey = k.trim()
    if (!isValidSupabaseUrl(url) || !anonKey) return null
    const invite = typeof i === 'string' ? i.trim().toUpperCase() : ''
    return invite ? { url, anonKey, invite } : { url, anonKey }
  } catch {
    return null
  }
}

const PENDING_INVITE = 'promitac.pendingInvite'

/** Invite carried by a connection code, waiting for the user to sign in (per window session). */
export function setPendingInvite(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(PENDING_INVITE, code)
    else sessionStorage.removeItem(PENDING_INVITE)
  } catch {
    // storage unavailable – the user can still type the invite code
  }
}

export function getPendingInvite(): string {
  try {
    return sessionStorage.getItem(PENDING_INVITE) ?? ''
  } catch {
    return ''
  }
}
