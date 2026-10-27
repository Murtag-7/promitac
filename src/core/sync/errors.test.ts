import {
  AUTH_EXPIRED_MESSAGE,
  NO_ACCESS_MESSAGE,
  OFFLINE_MESSAGE,
  SyncRemoteError,
  classifySyncError,
  describeOrgError,
  orgErrorCode
} from './errors'

describe('classifySyncError', () => {
  it.each([
    ['undici fetch failure', new TypeError('fetch failed')],
    ['browser fetch failure', new TypeError('Failed to fetch')],
    ['Firefox network error', new TypeError('NetworkError when attempting to fetch resource.')],
    ['aborted request', Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })],
    ['connection refused code', Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })],
    ['DNS failure code', Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' })],
    ['timeout code', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })],
    ['temporary DNS failure', Object.assign(new Error('x'), { code: 'EAI_AGAIN' })],
    [
      'cause chain',
      new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) })
    ],
    [
      'message mentioning a network code',
      new Error('request to https://x failed, reason: getaddrinfo ENOTFOUND x')
    ],
    ['postgrest wrapped fetch failure', new SyncRemoteError('TypeError: fetch failed', { status: 0 })],
    ['auth retryable fetch error', Object.assign(new Error('Failed'), { name: 'AuthRetryableFetchError' })],
    [
      'storage unknown error wrapping a fetch failure',
      Object.assign(new Error('x'), {
        name: 'StorageUnknownError',
        originalError: new TypeError('fetch failed')
      })
    ]
  ])('%s → offline', (_label, err) => {
    const r = classifySyncError(err)
    expect(r.status).toBe('offline')
    expect(r.message).toBe(OFFLINE_MESSAGE)
  })

  it.each([
    ['HTTP 401', new SyncRemoteError('Unauthorized', { status: 401 })],
    ['HTTP 403', new SyncRemoteError('Forbidden', { status: 403 })],
    ['JWT expired message', new SyncRemoteError('JWT expired', { status: 400, code: 'PGRST303' })],
    ['plain object with status', { status: 401, message: 'Invalid JWT' }],
    [
      'missing session',
      Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' })
    ],
    [
      'anon fallback after a lost session',
      new SyncRemoteError('permission denied for table songs', { status: 401, code: '42501' })
    ]
  ])('%s → error with a Czech sign-in message', (_label, err) => {
    expect(classifySyncError(err)).toEqual({ status: 'error', message: AUTH_EXPIRED_MESSAGE })
  })

  it('reports row level security denial as missing access, not as an expired login', () => {
    const err = new SyncRemoteError('new row violates row-level security policy for table "songs"', {
      status: 403,
      code: '42501'
    })
    expect(classifySyncError(err)).toEqual({ status: 'error', message: NO_ACCESS_MESSAGE })
  })

  it('passes other messages through', () => {
    expect(classifySyncError(new Error('disk full'))).toEqual({ status: 'error', message: 'disk full' })
    expect(classifySyncError('boom')).toEqual({ status: 'error', message: 'boom' })
    expect(classifySyncError({ message: 'bad request', status: 400 })).toEqual({
      status: 'error',
      message: 'bad request'
    })
  })

  it('falls back to a generic message for empty or odd values', () => {
    for (const v of [undefined, null, 42, {}, new Error('')]) {
      const r = classifySyncError(v)
      expect(r.status).toBe('error')
      expect(r.message.length).toBeGreaterThan(5)
    }
  })

  it('does not loop forever on cyclic causes', () => {
    const a = new Error('a') as Error & { cause?: unknown }
    const b = new Error('b', { cause: a })
    a.cause = b
    expect(classifySyncError(a).status).toBe('error')
  })
})

describe('SyncRemoteError', () => {
  it('keeps status, code and details', () => {
    const e = new SyncRemoteError('x', { status: 401, code: 'PGRST303', details: 'd', hint: 'h' })
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('SyncRemoteError')
    expect([e.status, e.code, e.details, e.hint]).toEqual([401, 'PGRST303', 'd', 'h'])
  })
})

describe('org errors', () => {
  it('extracts the RPC error code from the message', () => {
    expect(orgErrorCode(new SyncRemoteError('invalid_code', { status: 400, code: 'P0001' }))).toBe(
      'invalid_code'
    )
    expect(orgErrorCode(new Error('last_admin'))).toBe('last_admin')
    expect(orgErrorCode(new Error('something else'))).toBeNull()
  })

  it('describes org errors in Czech', () => {
    expect(describeOrgError(new Error('invalid_code'))).toMatch(/kód/i)
    expect(describeOrgError(new Error('already_member'))).toMatch(/člen/i)
    expect(describeOrgError(new Error('not_admin'))).toMatch(/správce/i)
    expect(describeOrgError(new Error('last_admin'))).toMatch(/správce/i)
    expect(describeOrgError(new TypeError('fetch failed'))).toBe(OFFLINE_MESSAGE)
    expect(describeOrgError(new SyncRemoteError('JWT expired', { status: 401 }))).toBe(AUTH_EXPIRED_MESSAGE)
    expect(describeOrgError(new Error('weird'))).toBe('weird')
  })
})
