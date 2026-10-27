import { create } from 'zustand'
import { useLive } from '@/store/live'

export const OUTPUT_TEST_MS = 4000

interface OutputTestState {
  /** Output whose test pattern is on screen now. */
  testingId: string | null
  start(outputId: string, label: string): void
  stop(): void
}

let timer: ReturnType<typeof setTimeout> | null = null

/**
 * "Test obrazu": shows the output's name on every output for 4 s. Kept outside React so the test
 * always ends on time, even when the operator leaves the settings meanwhile.
 */
export const useOutputTest = create<OutputTestState>((set, get) => ({
  testingId: null,
  start: (outputId, label) => {
    if (timer) clearTimeout(timer)
    set({ testingId: outputId })
    useLive.getState().setIdentify({ label })
    timer = setTimeout(() => get().stop(), OUTPUT_TEST_MS)
  },
  stop: () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (get().testingId !== null) useLive.getState().setIdentify(null)
    set({ testingId: null })
  }
}))
