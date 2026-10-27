/**
 * Minimal raster helpers for the OCR pipeline. Pure TypeScript on typed arrays so they run in
 * Node (tests), in the browser renderer and in workers alike.
 */

/** 8-bit grayscale image, row-major, one byte per pixel. */
export interface Gray {
  width: number
  height: number
  data: Uint8Array
}

/** RGBA image as produced by canvas `getImageData` or PNG decoders. */
export interface Rgba {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Copy of the rectangle [x0, x1) × [y0, y1) (rounded outwards, clamped, at least 1×1 px). */
export function cropRgba(img: Rgba, rect: { x0: number; y0: number; x1: number; y1: number }): Rgba {
  const x0 = Math.min(img.width - 1, Math.max(0, Math.floor(rect.x0)))
  const y0 = Math.min(img.height - 1, Math.max(0, Math.floor(rect.y0)))
  const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil(rect.x1)))
  const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil(rect.y1)))
  const w = x1 - x0
  const out = new Uint8ClampedArray(w * (y1 - y0) * 4)
  for (let y = y0; y < y1; y++) {
    const from = (y * img.width + x0) * 4
    out.set(img.data.subarray(from, from + w * 4), (y - y0) * w * 4)
  }
  return { width: w, height: y1 - y0, data: out }
}

/** Luminance (BT.601 weights); transparent pixels are composited over white. */
export function toGray(img: Rgba): Gray {
  const { width, height, data } = img
  const out = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const lum = (77 * data[p]! + 150 * data[p + 1]! + 29 * data[p + 2]!) >> 8
    const a = data[p + 3]!
    out[i] = a === 255 ? lum : Math.round((lum * a + 255 * (255 - a)) / 255)
  }
  return { width, height, data: out }
}

/** Grayscale back to opaque RGBA (for OCR engines and canvases). */
export function grayToRgba(g: Gray): Rgba {
  const out = new Uint8ClampedArray(g.width * g.height * 4)
  for (let i = 0, p = 0; i < g.data.length; i++, p += 4) {
    const v = g.data[i]!
    out[p] = v
    out[p + 1] = v
    out[p + 2] = v
    out[p + 3] = 255
  }
  return { width: g.width, height: g.height, data: out }
}

/** Bilinear resize by `factor` (> 0). Pixel centres are aligned, edges are clamped. */
export function upscale(g: Gray, factor: number): Gray {
  const { width: w, height: h, data } = g
  const W = Math.max(1, Math.round(w * factor))
  const H = Math.max(1, Math.round(h * factor))
  if (W === w && H === h) return { width: w, height: h, data: data.slice() }
  const sx = w / W
  const sy = h / H
  // Precompute horizontal source indices and weights (fixed point, 0–256).
  const xi0 = new Int32Array(W)
  const xi1 = new Int32Array(W)
  const xw = new Int32Array(W)
  for (let x = 0; x < W; x++) {
    const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5))
    const i0 = Math.floor(fx)
    xi0[x] = i0
    xi1[x] = Math.min(w - 1, i0 + 1)
    xw[x] = Math.round((fx - i0) * 256)
  }
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const y0 = Math.floor(fy)
    const r0 = y0 * w
    const r1 = Math.min(h - 1, y0 + 1) * w
    const wy = Math.round((fy - y0) * 256)
    const o = y * W
    for (let x = 0; x < W; x++) {
      const a = xi0[x]!
      const b = xi1[x]!
      const wx = xw[x]!
      const top = data[r0 + a]! * (256 - wx) + data[r0 + b]! * wx
      const bottom = data[r1 + a]! * (256 - wx) + data[r1 + b]! * wx
      out[o + x] = (top * (256 - wy) + bottom * wy + 32768) >> 16
    }
  }
  return { width: W, height: H, data: out }
}

/** Box-filter shrink by an integer factor (used for fast analysis such as skew estimation). */
export function downscale(g: Gray, factor: number): Gray {
  const f = Math.max(1, Math.floor(factor))
  if (f === 1) return { width: g.width, height: g.height, data: g.data.slice() }
  const W = Math.max(1, Math.floor(g.width / f))
  const H = Math.max(1, Math.floor(g.height / f))
  const sums = new Uint32Array(W * H)
  const counts = new Uint32Array(W * H)
  for (let y = 0; y < Math.min(g.height, H * f); y++) {
    const oy = Math.floor(y / f) * W
    const row = y * g.width
    for (let x = 0; x < Math.min(g.width, W * f); x++) {
      const o = oy + Math.floor(x / f)
      sums[o] = sums[o]! + g.data[row + x]!
      counts[o] = counts[o]! + 1
    }
  }
  const out = new Uint8Array(W * H)
  for (let i = 0; i < out.length; i++) out[i] = Math.round(sums[i]! / counts[i]!)
  return { width: W, height: H, data: out }
}

/**
 * Rotate by `deg` degrees, positive = clockwise on screen. The canvas grows so no content is cut
 * off; uncovered areas get `background`. Bilinear sampling.
 */
export function rotate(g: Gray, deg: number, background = 255): Gray {
  if (deg === 0) return { width: g.width, height: g.height, data: g.data.slice() }
  const { width: w, height: h, data } = g
  const t = (deg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const W = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin) - 1e-9)
  const H = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos) - 1e-9)
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const cX = (W - 1) / 2
  const cY = (H - 1) / 2
  const out = new Uint8Array(W * H)
  const px = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < w && y < h ? data[y * w + x]! : background
  for (let Y = 0; Y < H; Y++) {
    const dy = Y - cY
    // Source coordinates for X = 0, then advance incrementally along the row.
    let sx = -cX * cos + dy * sin + cx
    let sy = cX * sin + dy * cos + cy
    const o = Y * W
    for (let X = 0; X < W; X++, sx += cos, sy -= sin) {
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      if (x0 < -1 || y0 < -1 || x0 >= w || y0 >= h) {
        out[o + X] = background
        continue
      }
      const fx = sx - x0
      const fy = sy - y0
      if (x0 >= 0 && y0 >= 0 && x0 + 1 < w && y0 + 1 < h) {
        const i = y0 * w + x0
        const top = data[i]! * (1 - fx) + data[i + 1]! * fx
        const bottom = data[i + w]! * (1 - fx) + data[i + w + 1]! * fx
        out[o + X] = Math.round(top * (1 - fy) + bottom * fy)
      } else {
        const top = px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx
        const bottom = px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx
        out[o + X] = Math.round(top * (1 - fy) + bottom * fy)
      }
    }
  }
  return { width: W, height: H, data: out }
}
