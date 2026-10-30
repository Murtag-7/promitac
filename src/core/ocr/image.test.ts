import { cropRgba, downscale, grayToRgba, rotate, toGray, upscale, type Gray, type Rgba } from './image'

function rgba(width: number, height: number, pixels: number[][]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4)
  pixels.forEach((p, i) => data.set(p, i * 4))
  return { width, height, data }
}

function gray(width: number, height: number, fill: (x: number, y: number) => number): Gray {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y)
  return { width, height, data }
}

describe('toGray', () => {
  it('uses luminance weights', () => {
    const g = toGray(
      rgba(4, 1, [
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [255, 0, 0, 255],
        [0, 255, 0, 255]
      ])
    )
    expect(g.width).toBe(4)
    expect(g.height).toBe(1)
    expect(g.data[0]).toBe(255)
    expect(g.data[1]).toBe(0)
    expect(g.data[2]).toBeGreaterThan(70)
    expect(g.data[2]).toBeLessThan(82)
    expect(g.data[3]).toBeGreaterThan(145)
    expect(g.data[3]).toBeLessThan(155)
  })

  it('composites transparent pixels over white', () => {
    const g = toGray(
      rgba(2, 1, [
        [0, 0, 0, 0],
        [0, 0, 0, 128]
      ])
    )
    expect(g.data[0]).toBe(255)
    expect(g.data[1]).toBeGreaterThan(120)
    expect(g.data[1]).toBeLessThan(135)
  })
})

describe('grayToRgba', () => {
  it('copies the value into all channels with opaque alpha', () => {
    const out = grayToRgba(gray(2, 1, (x) => (x === 0 ? 10 : 200)))
    expect(Array.from(out.data)).toEqual([10, 10, 10, 255, 200, 200, 200, 255])
  })
})

describe('upscale', () => {
  it('doubles the dimensions', () => {
    const g = upscale(
      gray(10, 7, () => 128),
      2
    )
    expect(g.width).toBe(20)
    expect(g.height).toBe(14)
    expect(g.data.every((v) => v === 128)).toBe(true)
  })

  it('interpolates bilinearly between pixels', () => {
    const g = upscale(
      gray(2, 1, (x) => (x === 0 ? 0 : 200)),
      4
    )
    expect(g.width).toBe(8)
    const row = Array.from(g.data.slice(0, g.width))
    expect(row[0]).toBe(0)
    expect(row[7]).toBe(200)
    // Monotonic ramp in the middle.
    for (let i = 1; i < row.length; i++) expect(row[i]!).toBeGreaterThanOrEqual(row[i - 1]!)
    expect(row[3]!).toBeGreaterThan(40)
    expect(row[4]!).toBeLessThan(160)
  })

  it('returns a copy for factor 1', () => {
    const src = gray(3, 3, (x, y) => x + y)
    const g = upscale(src, 1)
    expect(g).not.toBe(src)
    expect(Array.from(g.data)).toEqual(Array.from(src.data))
  })
})

describe('downscale', () => {
  it('averages blocks', () => {
    const g = downscale(
      gray(4, 2, (x) => (x < 2 ? 0 : 200)),
      2
    )
    expect(g.width).toBe(2)
    expect(g.height).toBe(1)
    expect(Array.from(g.data)).toEqual([0, 200])
  })
})

describe('rotate', () => {
  it('is the identity for 0 degrees', () => {
    const src = gray(13, 9, (x, y) => (x * 17 + y * 31) % 256)
    const out = rotate(src, 0)
    expect(out.width).toBe(13)
    expect(out.height).toBe(9)
    expect(Array.from(out.data)).toEqual(Array.from(src.data))
  })

  it('rotates clockwise for positive angles and grows the canvas to fit', () => {
    // A single dark pixel right of the centre moves down when rotated clockwise.
    const src = gray(41, 41, (x, y) => (x === 35 && y === 20 ? 0 : 255))
    const out = rotate(src, 30)
    expect(out.width).toBeGreaterThan(41)
    let darkest = 255
    let at = { x: 0, y: 0 }
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++) {
        const v = out.data[y * out.width + x]!
        if (v < darkest) {
          darkest = v
          at = { x, y }
        }
      }
    const cx = (out.width - 1) / 2
    const cy = (out.height - 1) / 2
    // Expected position: 15 px from the centre at +30° (clockwise on screen).
    expect(at.x - cx).toBeCloseTo(15 * Math.cos(Math.PI / 6), -0.5)
    expect(at.y - cy).toBeCloseTo(15 * Math.sin(Math.PI / 6), -0.5)
  })

  it('fills uncovered corners with the background', () => {
    const out = rotate(
      gray(20, 20, () => 0),
      10,
      255
    )
    expect(out.data[0]).toBe(255)
  })
})

describe('cropRgba', () => {
  it('copies the rectangle [x0, x1) × [y0, y1)', () => {
    const src = grayToRgba(gray(4, 3, (x, y) => y * 10 + x))
    const out = cropRgba(src, { x0: 1, y0: 1, x1: 3, y1: 3 })
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(Array.from(out.data.filter((_, i) => i % 4 === 0))).toEqual([11, 12, 21, 22])
  })

  it('clamps the rectangle to the image and never returns an empty image', () => {
    const src = grayToRgba(gray(4, 3, () => 7))
    const out = cropRgba(src, { x0: -5, y0: 2.4, x1: 99, y1: 2.6 })
    expect(out.width).toBe(4)
    expect(out.height).toBe(1)
  })
})
