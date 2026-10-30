import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import { APP_SCHEME, BUNDLE_HOST, MEDIA_HOST } from '@shared/ipc'
import { paths, rendererDir } from './paths'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mjs.map': 'application/json',
  '.map': 'application/json'
}

/** Must run before app `ready`. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ])
}

/** Resolve `relative` inside `root`, refusing path traversal. */
export function safeJoin(root: string, relative: string): string | null {
  const target = normalize(join(root, relative))
  const base = normalize(root.endsWith(sep) ? root : root + sep)
  return target.startsWith(base) ? target : null
}

/** Parse a single-range `Range: bytes=a-b` header. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start: number
  let end: number
  if (m[1] === '' && m[2] !== '') {
    const suffix = Number(m[2])
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  }
  if (!Number.isFinite(start) || start > end || start >= size) return null
  return { start, end }
}

async function serveFile(filePath: string, request: Request): Promise<Response> {
  let info
  try {
    info = await stat(filePath)
    if (!info.isFile()) throw new Error('not a file')
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(request.headers.get('range'), info.size)
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes' }
  if (range) {
    const stream = createReadStream(filePath, { start: range.start, end: range.end })
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`
    headers['Content-Length'] = String(range.end - range.start + 1)
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers })
  }
  headers['Content-Length'] = String(info.size)
  return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, { status: 200, headers })
}

/** Call after app `ready`. */
export function handleAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (url.host === MEDIA_HOST) {
      const file = safeJoin(paths.media(), rel)
      return file ? serveFile(file, request) : new Response('Forbidden', { status: 403 })
    }
    if (url.host === BUNDLE_HOST) {
      const file = safeJoin(rendererDir(), rel || 'index.html')
      return file ? serveFile(file, request) : new Response('Forbidden', { status: 403 })
    }
    return new Response('Not found', { status: 404 })
  })
}
