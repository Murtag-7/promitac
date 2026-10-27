/**
 * Turning whatever a failed sync throws (fetch TypeErrors, Node network errors, PostgREST / auth
 * errors, plain strings) into a status for the UI. User-facing messages are Czech.
 */

export const OFFLINE_MESSAGE = 'Nelze se spojit se serverem – změny se odešlou, až bude připojení.'
export const AUTH_EXPIRED_MESSAGE = 'Přihlášení vypršelo – přihlaste se znovu.'
export const NO_ACCESS_MESSAGE =
  'Nemáte přístup ke knihovně sboru – možná vás správce ze sboru odebral. Zkuste se přihlásit znovu.'
export const UNKNOWN_ERROR_MESSAGE = 'Synchronizace selhala z neznámého důvodu.'

/** Error thrown by remote implementations; keeps the HTTP status so the cause can be classified. */
export class SyncRemoteError extends Error {
  readonly status: number | null
  readonly code: string | null
  readonly details: string | null
  readonly hint: string | null

  constructor(
    message: string,
    info: {
      status?: number | null
      code?: string | null
      details?: string | null
      hint?: string | null
    } = {},
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'SyncRemoteError'
    this.status = info.status ?? null
    this.code = info.code ?? null
    this.details = info.details ?? null
    this.hint = info.hint ?? null
  }
}

export interface ClassifiedSyncError {
  status: 'offline' | 'error'
  message: string
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
  'ABORT_ERR'
])

const NETWORK_NAMES = new Set(['AbortError', 'TimeoutError', 'AuthRetryableFetchError'])

const NETWORK_MESSAGE =
  /fetch failed|failed to fetch|networkerror|network request failed|load failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|socket hang up/i

const AUTH_MESSAGE =
  /jwt expired|invalid jwt|jwt.*(malformed|invalid)|invalid claim|auth session missing|refresh token/i
const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303', 'invalid_jwt', 'session_expired', 'bad_jwt'])
const AUTH_NAMES = new Set(['AuthSessionMissingError', 'AuthInvalidJwtError'])

interface ErrorLike {
  name?: unknown
  message?: unknown
  code?: unknown
  status?: unknown
  details?: unknown
  cause?: unknown
  /** storage-js StorageUnknownError */
  originalError?: unknown
}

/** The error and its `cause` / `originalError` chain (bounded, cycle safe). */
function chain(e: unknown): ErrorLike[] {
  const out: ErrorLike[] = []
  const seen = new Set<unknown>()
  let cur: unknown = e
  while (cur !== null && typeof cur === 'object' && !seen.has(cur) && out.length < 8) {
    seen.add(cur)
    out.push(cur as ErrorLike)
    const next: ErrorLike = cur as ErrorLike
    cur = next.cause ?? next.originalError
  }
  return out
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isNetworkError(errors: ErrorLike[], e: unknown): boolean {
  if (typeof e === 'string') return NETWORK_MESSAGE.test(e)
  return errors.some(
    (x) =>
      NETWORK_NAMES.has(str(x.name)) ||
      NETWORK_CODES.has(str(x.code)) ||
      NETWORK_MESSAGE.test(str(x.message)) ||
      // supabase-js wraps fetch failures into { status: 0, message: 'TypeError: fetch failed' }
      (x.status === 0 && NETWORK_MESSAGE.test(str(x.details)))
  )
}

function messageOf(e: unknown): string {
  if (typeof e === 'string') return e.trim()
  if (e && typeof e === 'object') {
    const m = (e as ErrorLike).message
    if (typeof m === 'string') return m.trim()
  }
  return ''
}

export function classifySyncError(e: unknown): ClassifiedSyncError {
  const errors = chain(e)
  if (isNetworkError(errors, e)) return { status: 'offline', message: OFFLINE_MESSAGE }

  const top = errors[0]
  const status = typeof top?.status === 'number' ? top.status : null
  const code = str(top?.code)
  // 401 = no valid session (requests then run as anon); 42501 with a valid session = RLS denial.
  if (status !== 401 && code === '42501') return { status: 'error', message: NO_ACCESS_MESSAGE }
  if (
    status === 401 ||
    status === 403 ||
    AUTH_CODES.has(code) ||
    errors.some((x) => AUTH_NAMES.has(str(x.name))) ||
    AUTH_MESSAGE.test(messageOf(e))
  ) {
    return { status: 'error', message: AUTH_EXPIRED_MESSAGE }
  }

  const message = messageOf(e)
  return { status: 'error', message: message || UNKNOWN_ERROR_MESSAGE }
}

/** Error codes raised by the organisation RPCs in supabase/migrations. */
export type OrgErrorCode =
  | 'already_member'
  | 'invalid_code'
  | 'not_admin'
  | 'last_admin'
  | 'not_member'
  | 'invalid_name'
  | 'invalid_role'
  | 'not_authenticated'

const ORG_ERROR_RE =
  /\b(already_member|invalid_code|not_admin|last_admin|not_member|invalid_name|invalid_role|not_authenticated)\b/

const ORG_MESSAGES: Record<OrgErrorCode, string> = {
  already_member: 'Už jste členem sboru. Pro připojení k jinému sboru nejdřív ten současný opusťte.',
  invalid_code: 'Pozvánkový kód neplatí. Zkontrolujte ho, nebo požádejte správce sboru o nový.',
  not_admin: 'Tuto akci může provést jen správce sboru.',
  last_admin: 'Jste poslední správce sboru – nejdřív jmenujte správcem někoho dalšího.',
  not_member: 'Uživatel není členem sboru.',
  invalid_name: 'Zadejte název sboru (1–120 znaků).',
  invalid_role: 'Neplatná role.',
  not_authenticated: AUTH_EXPIRED_MESSAGE
}

export function orgErrorCode(e: unknown): OrgErrorCode | null {
  const m = ORG_ERROR_RE.exec(messageOf(e))
  return m ? (m[1] as OrgErrorCode) : null
}

/** Czech message for a failed organisation action (create / join / leave / members). */
export function describeOrgError(e: unknown): string {
  const code = orgErrorCode(e)
  if (code) return ORG_MESSAGES[code]
  return classifySyncError(e).message
}
