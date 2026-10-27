import { create } from 'zustand'
import { BUILT_IN_THEMES } from '@core/theme/defaults'
import type { Theme } from '@core/theme/model'
import { newId, nowIso } from '@core/util/id'
import { api } from '@/api/client'

interface ThemesState {
  /** Built-in themes first, then user themes. */
  themes: Theme[]
  load(): Promise<void>
  save(theme: Theme): Promise<Theme>
  duplicate(id: string, name: string): Promise<Theme | null>
  remove(id: string): Promise<void>
}

const merge = (user: Theme[]): Theme[] => [
  ...BUILT_IN_THEMES,
  ...user.filter((t) => !BUILT_IN_THEMES.some((b) => b.id === t.id))
]

export const useThemes = create<ThemesState>((set, get) => ({
  themes: BUILT_IN_THEMES,
  load: async () => set({ themes: merge(await api().themes.list()) }),
  save: async (theme) => {
    const saved = { ...theme, builtIn: false, updatedAt: nowIso() }
    set({ themes: merge([...get().themes.filter((t) => !t.builtIn && t.id !== saved.id), saved]) })
    await api().themes.save(saved)
    return saved
  },
  duplicate: async (id, name) => {
    const src = get().themes.find((t) => t.id === id)
    if (!src) return null
    return get().save({ ...structuredClone(src), id: newId(), name, builtIn: false })
  },
  remove: async (id) => {
    set({ themes: get().themes.filter((t) => t.id !== id) })
    await api().themes.remove(id)
  }
}))
