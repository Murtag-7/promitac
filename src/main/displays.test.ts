import type { OutputConfig } from '@core/settings/model'
import type { DisplayInfo } from '@shared/api'
import { resolveOutputDisplay } from './displays'

const d = (id: number, primary: boolean, label = `Display ${id}`): DisplayInfo => ({
  id,
  label,
  primary,
  isControl: false,
  scaleFactor: 1,
  bounds: { x: id * 2000, y: 0, width: 1920, height: 1080 }
})

const auto: OutputConfig = { id: 'main', name: 'Plátno', displayId: 'auto', enabled: true, windowed: false }

describe('resolveOutputDisplay', () => {
  it('returns nothing with a single monitor (never covers the control window)', () => {
    expect(resolveOutputDisplay(auto, [d(1, true)], 1)).toBeNull()
  })
  it('picks the external monitor automatically', () => {
    expect(resolveOutputDisplay(auto, [d(1, true), d(2, false)], 1)?.id).toBe(2)
  })
  it('picks the first non-primary display when there are three', () => {
    expect(resolveOutputDisplay(auto, [d(1, true), d(3, false), d(2, false)], 1)?.id).toBe(3)
  })
  it('skips the display the control window is on and uses the primary projector instead', () => {
    // The system made the projector (1) primary; the operator works on the laptop (2).
    expect(resolveOutputDisplay(auto, [d(1, true), d(2, false)], 2)?.id).toBe(1)
  })
  it('never picks the only display when the control window position is unknown', () => {
    expect(resolveOutputDisplay(auto, [d(1, true)], null)).toBeNull()
  })
  it('returns null when the chosen display is disconnected and finds it again when reconnected', () => {
    const cfg = { ...auto, displayId: 2 }
    expect(resolveOutputDisplay(cfg, [d(1, true)], 1)).toBeNull()
    expect(resolveOutputDisplay(cfg, [d(1, true), d(2, false)], 1)?.id).toBe(2)
  })
  it('finds a reconnected display by its label when the id changed', () => {
    const cfg = { ...auto, displayId: 7, displayLabel: 'Projektor' }
    expect(resolveOutputDisplay(cfg, [d(1, true), d(9, false, 'Projektor')], 1)?.id).toBe(9)
  })
  it('refuses the control display for fullscreen output', () => {
    expect(resolveOutputDisplay({ ...auto, displayId: 1 }, [d(1, true), d(2, false)], 1)).toBeNull()
  })
  it('windowed mode may use the control display (testing with one monitor)', () => {
    expect(resolveOutputDisplay({ ...auto, windowed: true }, [d(1, true)], 1)?.id).toBe(1)
    expect(resolveOutputDisplay({ ...auto, displayId: 1, windowed: true }, [d(1, true)], 1)?.id).toBe(1)
  })
  it('disabled outputs never resolve', () => {
    expect(resolveOutputDisplay({ ...auto, enabled: false }, [d(1, true), d(2, false)], 1)).toBeNull()
  })
})
