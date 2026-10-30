import { downscale, grayToRgba, rotate, toGray, upscale, type Gray, type Rgba } from './image'

/** Value histogram of a grayscale image. */
function histogram(g: Gray): Uint32Array {
  const hist = new Uint32Array(256)
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]!]!++
  return hist
}

function percentile(hist: Uint32Array, total: number, pct: number): number {
  const target = (total * pct) / 100
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!
    if (acc >= target && acc > 0) return v
  }
  return 255
}

/** Linear contrast stretch: the `lowPct` percentile becomes 0, the `highPct` percentile 255. */
export function stretchContrast(g: Gray, lowPct = 1, highPct = 99): Gray {
  const hist = histogram(g)
  const total = g.data.length
  const lo = percentile(hist, total, lowPct)
  const hi = percentile(hist, total, highPct)
  if (hi <= lo) return { width: g.width, height: g.height, data: g.data.slice() }
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) {
    lut[v] = v <= lo ? 0 : v >= hi ? 255 : Math.round(((v - lo) * 255) / (hi - lo))
  }
  const out = new Uint8Array(total)
  for (let i = 0; i < total; i++) out[i] = lut[g.data[i]!]!
  return { width: g.width, height: g.height, data: out }
}

/**
 * Otsu's global threshold: maximises the between-class variance of [0..t] (ink) and
 * [t+1..255] (paper).
 */
export function otsuThreshold(g: Gray): number {
  const hist = histogram(g)
  const total = g.data.length
  let sumAll = 0
  for (let v = 0; v < 256; v++) sumAll += v * hist[v]!
  let wB = 0
  let sumB = 0
  let best = -1
  let bestT = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]!
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      bestT = t
    }
  }
  return bestT
}

/** Pixels above `t` become white (255), the rest black (0). */
export function binarize(g: Gray, t: number): Gray {
  const out = new Uint8Array(g.data.length)
  for (let i = 0; i < out.length; i++) out[i] = g.data[i]! > t ? 255 : 0
  return { width: g.width, height: g.height, data: out }
}

/** Width the skew analysis works at – enough resolution for 0.25° steps, still fast. */
const SKEW_ANALYSIS_WIDTH = 800
/** Upper bound of ink points used for the projection profiles. */
const SKEW_MAX_POINTS = 150_000

/**
 * Estimate the text skew in degrees (positive = text rotated clockwise, i.e. rows descend to the
 * right). Projection-profile method: the ink of a downscaled binary image is projected onto the
 * vertical axis for each candidate angle; straight rows give the sharpest profile (max variance).
 */
export function estimateSkew(g: Gray, maxDeg = 6, stepDeg = 0.25): number {
  const small = downscale(g, Math.max(1, Math.floor(g.width / SKEW_ANALYSIS_WIDTH)))
  const t = otsuThreshold(small)
  const { width: w, height: h, data } = small
  let count = 0
  for (let i = 0; i < data.length; i++) if (data[i]! <= t) count++
  // Nothing to measure: blank page or no contrast at all.
  if (count === 0 || count === data.length) return 0
  const stride = Math.max(1, Math.ceil(count / SKEW_MAX_POINTS))
  const xs = new Float32Array(Math.ceil(count / stride))
  const ys = new Float32Array(xs.length)
  let n = 0
  let k = 0
  const cx = w / 2
  const cy = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x]! > t) continue
      if (k++ % stride !== 0) continue
      xs[n] = x - cx
      ys[n] = y - cy
      n++
    }
  }
  const diag = Math.ceil(Math.hypot(w, h)) + 2
  const bins = new Float64Array(diag * 2)
  const score = (deg: number): number => {
    const a = (deg * Math.PI) / 180
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    bins.fill(0)
    for (let i = 0; i < n; i++) bins[Math.round(ys[i]! * cos - xs[i]! * sin) + diag]!++
    let s = 0
    for (let i = 0; i < bins.length; i++) s += bins[i]! * bins[i]!
    return s
  }
  const steps = Math.round(maxDeg / stepDeg)
  const scores: number[] = []
  let bestI = 0
  for (let i = -steps; i <= steps; i++) {
    const s = score(i * stepDeg)
    scores.push(s)
    if (s > scores[bestI]!) bestI = scores.length - 1
  }
  // Parabolic refinement around the peak for sub-step precision.
  let offset = 0
  if (bestI > 0 && bestI < scores.length - 1) {
    const a = scores[bestI - 1]!
    const b = scores[bestI]!
    const c = scores[bestI + 1]!
    const denom = a - 2 * b + c
    if (denom < 0) offset = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom))
  }
  const deg = (bestI - steps + offset) * stepDeg
  return Math.round(deg * 100) / 100 || 0
}

export interface PreprocessOptions {
  /** Small images are upscaled (max 3×) so their width reaches this value. Default 2000. */
  targetWidth?: number
}

export interface PreprocessResult {
  image: Rgba
  /** Detected skew in degrees (the image was rotated back when |skew| ≥ 0.4°). */
  skewDeg: number
  /** Upscale factor applied before deskewing. */
  scale: number
}

/** Skew below this is left alone – rotating resamples the glyphs and is not worth it. */
const MIN_DESKEW_DEG = 0.4

/**
 * Prepare a photo or scan for Tesseract: grayscale → upscale → contrast stretch → deskew →
 * Otsu binarisation. Word boxes reported by the OCR engine are in the coordinates of `image`.
 */
export function preprocessForOcr(rgba: Rgba, opts: PreprocessOptions = {}): PreprocessResult {
  const targetWidth = opts.targetWidth ?? 2000
  let g = toGray(rgba)
  let scale = Math.min(3, Math.max(1, targetWidth / g.width))
  if (scale < 1.05) scale = 1
  if (scale > 1) g = upscale(g, scale)
  g = stretchContrast(g)
  const skewDeg = estimateSkew(g)
  if (Math.abs(skewDeg) >= MIN_DESKEW_DEG) g = rotate(g, -skewDeg, 255)
  g = binarize(g, otsuThreshold(g))
  return { image: grayToRgba(g), skewDeg, scale }
}
