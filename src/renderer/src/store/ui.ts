import { create } from 'zustand'

export type View = 'live' | 'plan' | 'songs' | 'bible' | 'media' | 'settings'
export type SettingsSection = 'outputs' | 'themes' | 'general' | 'account' | 'backup' | 'ai'

interface UiState {
  view: View
  importOpen: boolean
  settingsSection: SettingsSection
  /** Song opened in the Songs screen. */
  selectedSongId: string | null
  /** Plan opened in the Plan screen. */
  selectedPlanId: string | null
  setView(view: View): void
  openSong(id: string | null): void
  openPlan(id: string | null): void
  setImportOpen(open: boolean): void
  openSettings(section: SettingsSection): void
}

export const useUi = create<UiState>((set) => ({
  view: 'live',
  importOpen: false,
  settingsSection: 'outputs',
  selectedSongId: null,
  selectedPlanId: null,
  setView: (view) => set({ view }),
  openSong: (id) => set({ selectedSongId: id, view: 'songs' }),
  openPlan: (id) => set({ selectedPlanId: id, view: 'plan' }),
  setImportOpen: (importOpen) => set({ importOpen }),
  openSettings: (settingsSection) => set({ settingsSection, view: 'settings' })
}))
