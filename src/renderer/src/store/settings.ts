import { create } from 'zustand'
import { type AppSettings, DEFAULT_SETTINGS } from '@core/settings/model'
import { api } from '@/api/client'

interface SettingsState {
  settings: AppSettings
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  load: async () => set({ settings: await api().settings.get() }),
  update: async (patch) => {
    set({ settings: { ...get().settings, ...patch } })
    set({ settings: await api().settings.update(patch) })
  }
}))
