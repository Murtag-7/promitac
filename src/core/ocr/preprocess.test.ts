import { rotate, type Gray, type Rgba } from './image'
import { binarize, estimateSkew, otsuThreshold, preprocessForOcr, stretchContrast } from './preprocess'

/** Deterministic pseudo random numbers (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A page of fake text: dark "words" (bars) on rows, drawn directly in rotated coordinates so the
 * sign convention of estimateSkew is tested independently of `rotate`.
 * Positive `deg` = clockwise on screen (rows descend to the right).
 */
function textPage(width: number, height: number, deg: number): Gray {
  const data = new Uint8Array(width * height).fill(245)
  const t = (deg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const cx = width / 2
  const cy = height / 2
  const margin = width * 0.1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const dy = y - cy
      const u = dx * cos + dy * sin + cx
      const v = -dx * sin + dy * cos + cy
      if (u < margin || u > width - margin || v < margin || v > height - margin) continue
      const inRow = v % 36 < 12
      const inWord = u % 70 < 55
      if (inRow && inWord) data[y * width + x] = 20
    }
  }
  return { width, height, data }
}

function toRgba(g: Gray): Rgba {
  const data = new Uint8ClampedArray(g.width * g.height * 4)
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i]!
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return { width: g.width, height: g.height, data }
}

describe('stretchContrast', () => {
  it('maps the 1st–99th percentile range onto 0–255', () => {
    const r = rng(1)
    const data = new Uint8Array(10_000).map(() => 100 + Math.floor(r() * 51))
    const out = stretchContrast({ width: 100, height: 100, data })
    const min = Math.min(...out.data)
    const max = Math.max(...out.data)
    expect(min).toBe(0)
    expect(max).toBe(255)
  })

  it('leaves a flat image unchanged', () => {
    const out = stretchContrast({ width: 2, height: 2, data: new Uint8Array([90, 90, 90, 90]) })
    expect(Array.from(out.data)).toEqual([90, 90, 90, 90])
  })
})

describe('otsuThreshold', () => {
  it('lands between the two modes of a bimodal histogram', () => {
    const r = rng(7)
    const data = new Uint8Array(20_000).map((_, i) =>
      i % 3 === 0 ? 40 + Math.floor(r() * 30) : 180 + Math.floor(r() * 40)
    )
    const t = otsuThreshold({ width: 200, height: 100, data })
    expect(t).toBeGreaterThanOrEqual(69)
    expect(t).toBeLessThan(180)
  })
})

describe('binarize', () => {
  it('turns pixels above the threshold white and the rest black', () => {
    const out = binarize({ width: 4, height: 1, data: new Uint8Array([0, 100, 101, 255]) }, 100)
    expect(Array.from(out.data)).toEqual([0, 0, 255, 255])
  })
})

describe('estimateSkew', () => {
  it.each([3, -3, 1.5, -5])('detects %d° rotation of drawn text rows', (deg) => {
    const s = estimateSkew(textPage(900, 700, deg))
    expect(s).toBeGreaterThanOrEqual(deg - 0.5)
    expect(s).toBeLessThanOrEqual(deg + 0.5)
  })

  it('returns ~0 for straight text', () => {
    expect(Math.abs(estimateSkew(textPage(900, 700, 0)))).toBeLessThanOrEqual(0.25)
  })

  it('agrees with rotate(): straight rows rotated by 3° measure as 3°', () => {
    const s = estimateSkew(rotate(textPage(900, 700, 0), 3, 245))
    expect(s).toBeGreaterThanOrEqual(2.5)
    expect(s).toBeLessThanOrEqual(3.5)
    const back = estimateSkew(rotate(textPage(900, 700, 0), -3, 245))
    expect(back).toBeGreaterThanOrEqual(-3.5)
    expect(back).toBeLessThanOrEqual(-2.5)
  })

  it('returns 0 for an empty page', () => {
    expect(estimateSkew({ width: 50, height: 50, data: new Uint8Array(2500).fill(255) })).toBe(0)
  })
})

describe('preprocessForOcr', () => {
  it('upscales small images (max factor 3) and outputs a binary image', () => {
    const { image, scale, skewDeg } = preprocessForOcr(toRgba(textPage(500, 400, 0)))
    expect(scale).toBe(3)
    expect(image.width).toBe(1500)
    expect(image.height).toBe(1200)
    expect(Math.abs(skewDeg)).toBeLessThan(0.4)
    let nonBinary = 0
    let transparent = 0
    for (let i = 0; i < image.data.length; i += 4) {
      const v = image.data[i]!
      if (v !== 0 && v !== 255) nonBinary++
      if (image.data[i + 3] !== 255) transparent++
    }
    expect(nonBinary).toBe(0)
    expect(transparent).toBe(0)
  })

  it('does not upscale images that are already wide enough', () => {
    const { image, scale } = preprocessForOcr(toRgba(textPage(1000, 300, 0)), { targetWidth: 800 })
    expect(scale).toBe(1)
    expect(image.width).toBe(1000)
  })

  it('straightens skewed pages', () => {
    const { image, skewDeg } = preprocessForOcr(toRgba(textPage(900, 700, 2.5)), { targetWidth: 900 })
    expect(skewDeg).toBeGreaterThan(2)
    expect(skewDeg).toBeLessThan(3)
    const g: Gray = {
      width: image.width,
      height: image.height,
      data: new Uint8Array(image.width * image.height)
    }
    for (let i = 0; i < g.data.length; i++) g.data[i] = image.data[i * 4]!
    expect(Math.abs(estimateSkew(g))).toBeLessThanOrEqual(0.5)
  })

  it('processes a 2000×2800 page in well under 2 s', () => {
    const big = toRgba(textPage(2000, 2800, 1))
    const t0 = performance.now()
    preprocessForOcr(big)
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(2000)
  })
})
