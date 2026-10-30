export type MediaKind = 'image' | 'video'

export interface MediaItem {
  id: string
  name: string
  kind: MediaKind
  /** File name inside the app media folder. */
  fileName: string
  mime: string
  size: number
  width?: number
  height?: number
  /** Not uploaded to the shared library (too large or explicitly local). */
  localOnly: boolean
  updatedAt: string
}

/** Supabase free tier upload limit per file. */
export const MAX_SYNC_MEDIA_BYTES = 50 * 1024 * 1024

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'] as const

export function mediaKindFromName(name: string): MediaKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'image'
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return 'video'
  return null
}

export function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime'
  }
  return map[ext] ?? 'application/octet-stream'
}
