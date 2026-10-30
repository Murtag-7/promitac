import type { OutputConfig } from '@core/settings/model'
import type { DisplayInfo } from '@shared/api'
import {
  activeDisplayId,
  autoDisplay,
  displayMap,
  newOutput,
  outputState,
  resolveDisplay
} from './outputsModel'

const laptop: DisplayInfo = {
  id: 1,
  label: 'Vestavěný displej',
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  scaleFactor: 2,
  primary: true,
  isControl: true
}
const projector: DisplayInfo = {
  id: 2,
  label: 'Projektor (HDMI)',
  bounds: { x: 1512, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  primary: false,
  isControl: false
}
const tv: DisplayInfo = {
  id: 3,
  label: 'Televize',
  bounds: { x: -1920, y: -98, width: 1920, height: 1080 },
  scaleFactor: 1,
  primary: false,
  isControl: false
}

const out = (patch: Partial<OutputConfig> = {}): OutputConfig => ({
  id: 'main',
  name: 'Plátno',
  displayId: 'auto',
  enabled: true,
  windowed: false,
  ...patch
})

describe('display resolution', () => {
  it('auto picks the first non-primary display', () => {
    expect(autoDisplay([laptop, projector])?.id).toBe(2)
    expect(autoDisplay([laptop])).toBeNull()
    expect(resolveDisplay(out(), [laptop, projector])?.id).toBe(2)
  })

  it('a fixed display that is unplugged resolves to nothing', () => {
    expect(resolveDisplay(out({ displayId: 3 }), [laptop, projector])).toBeNull()
    expect(resolveDisplay(out({ displayId: 1 }), [laptop, projector])?.id).toBe(1)
  })

  it('prefers what main reports for an open window', () => {
    const status = { outputId: 'main', state: 'open' as const, displayId: 1, displayLabel: 'x' }
    expect(activeDisplayId(out(), status, [laptop, projector])).toBe(1)
    expect(activeDisplayId(out({ enabled: false }), status, [laptop, projector])).toBeNull()
    expect(activeDisplayId(out(), undefined, [laptop, projector])).toBe(2)
  })

  it('derives a state when main has not reported yet', () => {
    expect(outputState(out(), undefined)).toBe('no-display')
    expect(outputState(out({ enabled: false }), undefined)).toBe('disabled')
  })
})

describe('displayMap', () => {
  it('normalises bounds to the common bounding box, keeping negative positions', () => {
    const map = displayMap([laptop, projector, tv])
    expect(map.width).toBe(1920 + 1512 + 1920)
    expect(map.height).toBe(1080 + 98)
    const [l, p, t] = map.rects
    expect(t).toMatchObject({ left: 0, top: 0 })
    expect(l?.left).toBeCloseTo(1920 / map.width)
    expect(l?.top).toBeCloseTo(98 / map.height)
    expect(p?.width).toBeCloseTo(1920 / map.width)
    for (const r of map.rects) {
      expect(r.left + r.width).toBeLessThanOrEqual(1 + 1e-9)
      expect(r.top + r.height).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('handles no displays', () => {
    expect(displayMap([])).toEqual({ rects: [], width: 0, height: 0 })
  })
})

describe('newOutput', () => {
  it('uses a free external display and a unique name', () => {
    const o = newOutput([out()], [laptop, projector, tv], 'x', (n) => `Výstup ${n}`)
    expect(o).toMatchObject({ id: 'x', name: 'Výstup 2', displayId: 3, enabled: true, windowed: false })
  })

  it('falls back to auto when every external display is taken', () => {
    const o = newOutput(
      [out(), out({ id: 'b', name: 'Výstup 2' })],
      [laptop, projector],
      'y',
      (n) => `Výstup ${n}`
    )
    expect(o).toMatchObject({ name: 'Výstup 3', displayId: 'auto' })
  })
})
