import {
  AUTH_EXPIRED_MESSAGE,
  OFFLINE_MESSAGE,
  SyncRemoteError,
  classifySyncError,
  describeOrgError
} from '@core/sync/errors'
import type { SyncRecord } from '@core/sync/model'
import { SupabaseOrgApi, SupabaseRemote, createSupabase, mediaStoragePath } from './supabaseRemote'

const URL_BASE = 'https://demo-project.supabase.co'
const ORG = '0a000000-0000-4000-8000-000000000001'
const ID1 = '5a000000-0000-4000-8000-000000000001'

interface Recorded {
  url: URL
  method: string
  headers: Headers
  body: string | null
  rawBody: unknown
}

interface Canned {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

function fakeFetch(handler: (req: Recorded, index: number) => Canned | Promise<Canned>) {
  const calls: Recorded[] = []
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const rec: Recorded = {
      url: new URL(href),
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
      rawBody: init?.body
    }
    calls.push(rec)
    const res = await handler(rec, calls.length - 1)
    const status = res.status ?? 200
    let body: ConstructorParameters<typeof Response>[0] = null
    if (status !== 204 && res.body !== undefined) {
      body = res.body instanceof Uint8Array ? new Blob([res.body]) : JSON.stringify(res.body)
    }
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json', ...(res.headers ?? {}) }
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  }
}

function client(handler: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch(handler)
  const sb = createSupabase({ url: URL_BASE, anonKey: 'anon-key' }, memoryStorage(), f.fetchImpl)
  return { sb, calls: f.calls }
}

function songRow(i: number, ts: string) {
  return {
    org_id: ORG,
    id: `5a000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Píseň ${i}`,
    content: `{title: Píseň ${i}}`,
    updated_at: '2026-10-27T08:00:00+00:00',
    deleted: false,
    updated_by: 'Kancelář',
    server_updated_at: ts
  }
}

function tsAt(i: number): string {
  return `2026-10-27T09:00:00.${String(i).padStart(6, '0')}+00:00`
}

describe('SupabaseRemote.pull', () => {
  it('requests the org rows ordered by server time and maps them to sync records', async () => {
    const { sb, calls } = client(() => ({
      body: [
        {
          ...songRow(1, '2026-10-27T09:00:00.123456+00:00'),
          updated_at: '2026-10-27T10:00:00.5+02:00',
          updated_by: null
        }
      ]
    }))
    const remote = new SupabaseRemote(sb, ORG)

    const res = await remote.pull('songs', null)

    expect(calls).toHaveLength(1)
    const req = calls[0]!
    expect(req.method).toBe('GET')
    expect(req.url.pathname).toBe('/rest/v1/songs')
    expect(req.url.searchParams.get('select')).toBe('*')
    expect(req.url.searchParams.get('org_id')).toBe(`eq.${ORG}`)
    expect(req.url.searchParams.get('order')).toMatch(/^server_updated_at\.asc/)
    expect(req.url.searchParams.get('limit')).toBe('500')
    expect(req.url.searchParams.has('server_updated_at')).toBe(false)
    expect(req.headers.get('apikey')).toBe('anon-key')
    expect(res.cursor).toBe('2026-10-27T09:00:00.123456+00:00')
    expect(res.records).toEqual<SyncRecord[]>([
      {
        table: 'songs',
        id: '5a000000-0000-4000-8000-000000000001',
        updatedAt: '2026-10-27T08:00:00.500Z',
        deleted: false,
        updatedBy: '',
        data: { title: 'Píseň 1', content: '{title: Píseň 1}' }
      }
    ])
  })

  it('pulls only changes after the cursor and keeps the cursor when nothing changed', async () => {
    const cursor = '2026-10-27T09:00:00.123456+00:00'
    const { sb, calls } = client(() => ({ body: [] }))
    const res = await new SupabaseRemote(sb, ORG).pull('plans', cursor)

    expect(calls[0]!.url.pathname).toBe('/rest/v1/plans')
    expect(calls[0]!.url.searchParams.get('server_updated_at')).toBe(`gt.${cursor}`)
    expect(calls[0]!.url.search).toContain('order=server_updated_at.asc')
    expect(calls[0]!.url.search).toContain(`org_id=eq.${ORG}`)
    expect(res).toEqual({ records: [], cursor })
  })

  it('pages through large change sets and stops at the first short page', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => songRow(i + 1, tsAt(i + 1)))
    const page2 = [songRow(501, tsAt(501)), songRow(502, tsAt(502))]
    const { sb, calls } = client((_req, i) => ({ body: i === 0 ? page1 : page2 }))

    const res = await new SupabaseRemote(sb, ORG).pull('songs', null)

    expect(calls).toHaveLength(2)
    expect(res.records).toHaveLength(502)
    expect(res.cursor).toBe(tsAt(502))
    const second = calls[1]!.url.searchParams
    const last = page1[499]!
    expect(second.get('or')).toBe(
      `(server_updated_at.gt."${last.server_updated_at}",and(server_updated_at.eq."${last.server_updated_at}",id.gt."${last.id}"))`
    )
    expect(second.get('org_id')).toBe(`eq.${ORG}`)
  })

  it('makes one extra request when the last page is exactly full', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => songRow(i + 1, tsAt(i + 1)))
    const { sb, calls } = client((_req, i) => ({ body: i === 0 ? page1 : [] }))
    const res = await new SupabaseRemote(sb, ORG).pull('songs', null)
    expect(calls).toHaveLength(2)
    expect(res.records).toHaveLength(500)
    expect(res.cursor).toBe(tsAt(500))
  })

  it('maps plans/themes data and media data + storage path', async () => {
    const media = {
      id: ID1,
      name: 'Logo',
      kind: 'image',
      fileName: 'logo.png',
      mime: 'image/png',
      size: 1234
    }
    const { sb } = client((req) => {
      if (req.url.pathname.endsWith('/media')) {
        return {
          body: [
            {
              org_id: ORG,
              id: ID1,
              data: media,
              storage_path: `${ORG}/${ID1}-logo.png`,
              size: 1234,
              updated_at: '2026-10-27T08:00:00.000Z',
              deleted: false,
              updated_by: 'Sál',
              server_updated_at: tsAt(1)
            }
          ]
        }
      }
      return {
        body: [
          {
            org_id: ORG,
            id: ID1,
            data: { id: ID1, title: 'Neděle' },
            updated_at: '2026-10-27T08:00:00.000Z',
            deleted: true,
            updated_by: 'Sál',
            server_updated_at: tsAt(1)
          }
        ]
      }
    })
    const remote = new SupabaseRemote(sb, ORG)

    const plans = await remote.pull('plans', null)
    const themes = await remote.pull('themes', null)
    const mediaRes = await remote.pull('media', null)

    expect(plans.records[0]).toEqual({
      table: 'plans',
      id: ID1,
      updatedAt: '2026-10-27T08:00:00.000Z',
      deleted: true,
      updatedBy: 'Sál',
      data: { id: ID1, title: 'Neděle' }
    })
    expect(themes.records[0]?.table).toBe('themes')
    expect(mediaRes.records[0]?.data).toEqual({ ...media, storagePath: `${ORG}/${ID1}-logo.png` })
  })

  it('surfaces HTTP 401 as an error that classifySyncError reports as an expired login', async () => {
    const { sb } = client(() => ({ status: 401, body: { code: 'PGRST303', message: 'JWT expired' } }))
    const err = await new SupabaseRemote(sb, ORG).pull('songs', null).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(SyncRemoteError)
    expect((err as SyncRemoteError).status).toBe(401)
    expect((err as SyncRemoteError).code).toBe('PGRST303')
    expect(classifySyncError(err)).toEqual({ status: 'error', message: AUTH_EXPIRED_MESSAGE })
  })

  it('surfaces a network failure as offline (no retry delays)', async () => {
    const { sb, calls } = client(() => {
      throw new TypeError('fetch failed')
    })
    const started = Date.now()
    const err = await new SupabaseRemote(sb, ORG).pull('songs', null).catch((e: unknown) => e)

    expect(classifySyncError(err)).toEqual({ status: 'offline', message: OFFLINE_MESSAGE })
    expect(calls).toHaveLength(1)
    expect(Date.now() - started).toBeLessThan(900)
  })
})

describe('SupabaseRemote.push', () => {
  function record(i: number, extra: Partial<SyncRecord> = {}): SyncRecord {
    return {
      table: 'songs',
      id: `5a000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      updatedAt: '2026-10-27T08:00:00.000Z',
      deleted: false,
      updatedBy: 'Kancelář',
      data: { title: `Píseň ${i}`, content: `{title: Píseň ${i}}` },
      ...extra
    }
  }

  it('upserts on (org_id, id) and maps songs to title/content columns', async () => {
    const { sb, calls } = client(() => ({ status: 201 }))
    await new SupabaseRemote(sb, ORG).push('songs', [record(1), record(2, { deleted: true, updatedBy: '' })])

    expect(calls).toHaveLength(1)
    const req = calls[0]!
    expect(req.method).toBe('POST')
    expect(req.url.pathname).toBe('/rest/v1/songs')
    expect(req.url.searchParams.get('on_conflict')).toBe('org_id,id')
    expect(req.headers.get('prefer')).toContain('resolution=merge-duplicates')
    expect(JSON.parse(req.body ?? '')).toEqual([
      {
        org_id: ORG,
        id: '5a000000-0000-4000-8000-000000000001',
        title: 'Píseň 1',
        content: '{title: Píseň 1}',
        updated_at: '2026-10-27T08:00:00.000Z',
        deleted: false,
        updated_by: 'Kancelář'
      },
      {
        org_id: ORG,
        id: '5a000000-0000-4000-8000-000000000002',
        title: 'Píseň 2',
        content: '{title: Píseň 2}',
        updated_at: '2026-10-27T08:00:00.000Z',
        deleted: true,
        updated_by: null
      }
    ])
  })

  it('uploads in batches of 200', async () => {
    const { sb, calls } = client(() => ({ status: 201 }))
    const records = Array.from({ length: 450 }, (_, i) => record(i + 1))
    await new SupabaseRemote(sb, ORG).push('songs', records)
    expect(calls.map((c) => (JSON.parse(c.body ?? '[]') as unknown[]).length)).toEqual([200, 200, 50])
  })

  it('maps media storagePath to its own column and plans to the data column', async () => {
    const { sb, calls } = client(() => ({ status: 201 }))
    const remote = new SupabaseRemote(sb, ORG)
    const media = {
      id: ID1,
      name: 'Logo',
      fileName: 'logo.png',
      size: 1234,
      storagePath: `${ORG}/${ID1}-logo.png`
    }
    await remote.push('media', [{ ...record(1), table: 'media', id: ID1, data: media }])
    await remote.push('plans', [
      { ...record(1), table: 'plans', id: ID1, data: { id: ID1, title: 'Neděle' } }
    ])

    const mediaRow = (JSON.parse(calls[0]!.body ?? '[]') as Array<Record<string, unknown>>)[0]
    expect(calls[0]!.url.pathname).toBe('/rest/v1/media')
    expect(mediaRow).toMatchObject({ storage_path: `${ORG}/${ID1}-logo.png`, size: 1234 })
    expect(mediaRow?.data).toEqual({ id: ID1, name: 'Logo', fileName: 'logo.png', size: 1234 })
    const planRow = (JSON.parse(calls[1]!.body ?? '[]') as Array<Record<string, unknown>>)[0]
    expect(planRow?.data).toEqual({ id: ID1, title: 'Neděle' })
    expect(planRow).not.toHaveProperty('title')
  })

  it('skips records whose id is not a UUID (e.g. built-in themes) and empty pushes', async () => {
    const { sb, calls } = client(() => ({ status: 201 }))
    const remote = new SupabaseRemote(sb, ORG)
    await remote.push('themes', [{ ...record(1), table: 'themes', id: 'classic-dark', data: {} }])
    await remote.push('songs', [])
    expect(calls).toHaveLength(0)
  })

  it('throws on errors with the status code kept', async () => {
    const { sb } = client(() => ({
      status: 403,
      body: { code: '42501', message: 'new row violates row-level security policy for table "songs"' }
    }))
    const err = await new SupabaseRemote(sb, ORG).push('songs', [record(1)]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SyncRemoteError)
    expect((err as SyncRemoteError).status).toBe(403)
    expect(classifySyncError(err).status).toBe('error')
  })
})

describe('SupabaseOrgApi', () => {
  it('joinOrg calls the join_org RPC with p_code and maps the result', async () => {
    const { sb, calls } = client(() => ({
      body: { id: ORG, name: 'Sbor Alfa', role: 'member', invite_code: 'ABCD-EFGH' }
    }))
    const org = await new SupabaseOrgApi(sb).joinOrg('abcd-efgh')

    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url.pathname).toBe('/rest/v1/rpc/join_org')
    expect(JSON.parse(calls[0]!.body ?? '')).toEqual({ p_code: 'abcd-efgh' })
    expect(org).toEqual({ id: ORG, name: 'Sbor Alfa', role: 'member', inviteCode: 'ABCD-EFGH' })
  })

  it('maps the other RPCs', async () => {
    const responses: Record<string, Canned> = {
      my_org: { body: null },
      create_org: { body: { id: ORG, name: 'Nový', role: 'admin', invite_code: 'WXYZ-2345' } },
      list_members: {
        body: [
          { user_id: 'u1', email: 'a@example.com', role: 'admin', display_name: 'Anna' },
          { user_id: 'u2', email: null, role: 'member', display_name: null }
        ]
      },
      rotate_invite_code: { body: 'NEWC-ODE2' },
      set_member_role: { status: 204 },
      remove_member: { status: 204 },
      leave_org: { status: 204 }
    }
    const { sb, calls } = client(
      (req) => responses[req.url.pathname.split('/').pop() ?? ''] ?? { status: 404 }
    )
    const api = new SupabaseOrgApi(sb)

    expect(await api.myOrg()).toBeNull()
    expect(await api.createOrg('Nový')).toEqual({
      id: ORG,
      name: 'Nový',
      role: 'admin',
      inviteCode: 'WXYZ-2345'
    })
    expect(await api.members()).toEqual([
      { userId: 'u1', email: 'a@example.com', role: 'admin', displayName: 'Anna' },
      { userId: 'u2', email: '', role: 'member', displayName: null }
    ])
    expect(await api.rotateInviteCode()).toBe('NEWC-ODE2')
    await api.setMemberRole('u2', 'admin')
    await api.removeMember('u2')
    await api.leaveOrg()

    const byFn = Object.fromEntries(
      calls.map((c) => [c.url.pathname.split('/').pop(), c.body && JSON.parse(c.body)])
    )
    expect(byFn.create_org).toEqual({ p_name: 'Nový' })
    expect(byFn.set_member_role).toEqual({ p_user: 'u2', p_role: 'admin' })
    expect(byFn.remove_member).toEqual({ p_user: 'u2' })
    expect(calls.map((c) => c.url.pathname)).toEqual([
      '/rest/v1/rpc/my_org',
      '/rest/v1/rpc/create_org',
      '/rest/v1/rpc/list_members',
      '/rest/v1/rpc/rotate_invite_code',
      '/rest/v1/rpc/set_member_role',
      '/rest/v1/rpc/remove_member',
      '/rest/v1/rpc/leave_org'
    ])
  })

  it('rejects RPC errors with the server code so the UI can explain them in Czech', async () => {
    const { sb } = client(() => ({ status: 400, body: { code: 'P0001', message: 'invalid_code' } }))
    const err = await new SupabaseOrgApi(sb).joinOrg('nope').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SyncRemoteError)
    expect((err as SyncRemoteError).message).toBe('invalid_code')
    expect(describeOrgError(err)).toMatch(/kód neplatí/)
  })

  it('uploads media into the org folder and downloads it again', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const { sb, calls } = client((req) => {
      if (req.method === 'GET') return { body: bytes, headers: { 'content-type': 'image/jpeg' } }
      return { body: { Key: `media/${req.url.pathname}`, Id: 'x' } }
    })
    const api = new SupabaseOrgApi(sb)

    const path = await api.uploadMedia(ORG, ID1, 'Píseň 1.JPG', bytes, 'image/jpeg')
    expect(path).toBe(`${ORG}/${ID1}-pisen-1.jpg`)
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url.pathname).toBe(`/storage/v1/object/media/${ORG}/${ID1}-pisen-1.jpg`)
    expect(calls[0]!.headers.get('x-upsert')).toBe('true')

    const downloaded = await api.downloadMedia(path)
    expect(calls[1]!.method).toBe('GET')
    expect(calls[1]!.url.pathname).toBe(`/storage/v1/object/media/${path}`)
    expect([...downloaded]).toEqual([1, 2, 3, 4])
  })

  it('removes media files', async () => {
    const { sb, calls } = client(() => ({ body: [] }))
    await new SupabaseOrgApi(sb).removeMedia([`${ORG}/a.jpg`, `${ORG}/b.jpg`])
    await new SupabaseOrgApi(sb).removeMedia([])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('DELETE')
    expect(JSON.parse(calls[0]!.body ?? '')).toEqual({ prefixes: [`${ORG}/a.jpg`, `${ORG}/b.jpg`] })
  })

  it('reports storage failures as SyncRemoteError', async () => {
    const { sb } = client(() => ({
      status: 403,
      body: { statusCode: '403', error: 'Unauthorized', message: 'denied' }
    }))
    const err = await new SupabaseOrgApi(sb).downloadMedia(`${ORG}/x.jpg`).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SyncRemoteError)
    expect((err as SyncRemoteError).status).toBe(403)
  })
})

describe('mediaStoragePath', () => {
  it('builds <org>/<id>-<ascii file name>', () => {
    expect(mediaStoragePath(ORG, ID1, 'Velikonoce – pozadí.webm')).toBe(
      `${ORG}/${ID1}-velikonoce-pozadi.webm`
    )
    expect(mediaStoragePath(ORG, ID1, '.hidden')).toBe(`${ORG}/${ID1}-hidden`)
    expect(mediaStoragePath(ORG, ID1, 'žluťoučký')).toBe(`${ORG}/${ID1}-zlutoucky`)
  })
})

describe('createSupabase', () => {
  it('stores the session in the given storage, not in localStorage', async () => {
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    const { fetchImpl } = fakeFetch(() => ({
      body: {
        access_token: 'token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'refresh',
        user: { id: 'u1', aud: 'authenticated', email: 'a@example.com', app_metadata: {}, user_metadata: {} }
      }
    }))
    const sb = createSupabase({ url: URL_BASE, anonKey: 'anon-key' }, storage, fetchImpl)
    const { error } = await sb.auth.signInWithPassword({ email: 'a@example.com', password: 'x' })
    expect(error).toBeNull()
    expect(setItem).toHaveBeenCalled()
    await sb.auth.stopAutoRefresh()
  })
})
