import { formatDuration, formatFileSize } from './format'

const NBSP = String.fromCharCode(0xa0)
const s = (text: string): string => text.replace(/ /g, NBSP)

describe('formatFileSize', () => {
  it('uses bytes, kB, MB and GB with a Czech decimal comma', () => {
    expect(formatFileSize(0)).toBe(s('0 B'))
    expect(formatFileSize(1023)).toBe(s('1023 B'))
    expect(formatFileSize(1536)).toBe(s('1,5 kB'))
    expect(formatFileSize(820 * 1024)).toBe(s('820 kB'))
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe(s('1,3 MB'))
    expect(formatFileSize(50 * 1024 * 1024)).toBe(s('50 MB'))
    expect(formatFileSize(1234 * 1024 * 1024)).toBe(s('1,2 GB'))
  })

  it('returns an empty string for invalid sizes', () => {
    expect(formatFileSize(Number.NaN)).toBe('')
    expect(formatFileSize(-1)).toBe('')
  })
})

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(42.4)).toBe('0:42')
    expect(formatDuration(725)).toBe('12:05')
    expect(formatDuration(3723)).toBe('1:02:03')
  })

  it('returns an empty string for unknown durations', () => {
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
  })
})
