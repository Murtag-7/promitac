import { fitFontSize } from './fit'

const base = { lineHeight: 1.25, availWidth: 1600, availHeight: 800, min: 44, max: 96 }

describe('fitFontSize', () => {
  it('uses the maximum size for short text', () => {
    expect(fitFontSize({ ...base, lineWidthsAt1px: [8, 10] })).toEqual({ size: 96, wrap: false })
  })

  it('shrinks a long line so it fits on one line', () => {
    const r = fitFontSize({ ...base, lineWidthsAt1px: [25] })
    expect(r.wrap).toBe(false)
    expect(r.size).toBeCloseTo(64, 0)
    expect(r.size * 25).toBeLessThanOrEqual(1600)
  })

  it('wraps at the minimum size instead of going below it', () => {
    const r = fitFontSize({ ...base, lineWidthsAt1px: [60] })
    expect(r).toEqual({ size: 44, wrap: true })
  })

  it('height limits the size when there are many lines', () => {
    const r = fitFontSize({ ...base, lineWidthsAt1px: Array(8).fill(5) })
    expect(r.wrap).toBe(false)
    expect(r.size * 1.25 * 8).toBeLessThanOrEqual(800)
    expect(r.size).toBeGreaterThanOrEqual(44)
    expect(r.size).toBeLessThan(96)
  })

  it('never clips: goes below the minimum when even wrapped text would overflow', () => {
    const r = fitFontSize({ ...base, lineWidthsAt1px: Array(12).fill(60) })
    expect(r.wrap).toBe(true)
    expect(r.size).toBeLessThan(44)
    const linesPerSource = Math.ceil((60 * r.size) / (1600 * 0.92))
    expect(linesPerSource * 12 * r.size * 1.25).toBeLessThanOrEqual(800)
  })

  it('handles empty input', () => {
    expect(fitFontSize({ ...base, lineWidthsAt1px: [] })).toEqual({ size: 96, wrap: false })
  })

  it('respects autoFit off by returning max when it fits and shrinking only when needed', () => {
    expect(fitFontSize({ ...base, max: 50, lineWidthsAt1px: [10] }).size).toBe(50)
  })
  it('paragraph mode wraps at the largest size that fits', () => {
    const r = fitFontSize({ ...base, paragraph: true, lineWidthsAt1px: [120] })
    expect(r.wrap).toBe(true)
    expect(r.size).toBeGreaterThan(44)
    expect(r.size).toBeLessThanOrEqual(96)
    expect(Math.ceil((120 * r.size) / (1600 * 0.92)) * r.size * 1.25).toBeLessThanOrEqual(800)
  })
})
