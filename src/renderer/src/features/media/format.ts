/** Non-breaking space so "1,2 MB" never wraps between number and unit. */
const NBSP = String.fromCharCode(0xa0)
const UNITS = ['kB', 'MB', 'GB', 'TB']

/** Human file size with Czech decimal comma: "512 B", "1,5 kB", "12 MB", "1,2 GB". */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${Math.round(bytes)}${NBSP}B`
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value < 10 ? 1 : 0
  const text = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits, useGrouping: false }).format(
    value
  )
  return `${text}${NBSP}${UNITS[unit]}`
}

/** Video length as "0:42", "12:05" or "1:02:03"; '' when unknown. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
