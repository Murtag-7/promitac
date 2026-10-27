import { create } from 'zustand'
import type { BibleData, BibleTranslationInfo } from '@core/bible/model'
import { api } from '@/api/client'

interface BibleState {
  translations: BibleTranslationInfo[]
  data: Record<string, BibleData>
  loading: Record<string, boolean>
  /** Translations that could not be loaded (e.g. an imported one was removed). */
  failed: Record<string, boolean>
  loadList(): Promise<void>
  ensure(id: string): Promise<BibleData | null>
  importFile(file: File): Promise<BibleTranslationInfo>
  remove(id: string): Promise<void>
}

export const useBible = create<BibleState>((set, get) => ({
  translations: [],
  data: {},
  loading: {},
  failed: {},
  loadList: async () => set({ translations: await api().bible.listTranslations() }),
  ensure: async (id) => {
    const cached = get().data[id]
    if (cached) return cached
    if (get().loading[id] || get().failed[id]) return null
    set({ loading: { ...get().loading, [id]: true } })
    try {
      const data = await api().bible.load(id)
      set({ data: { ...get().data, [id]: data } })
      return data
    } catch (err) {
      console.error('Bible load failed', err)
      set({ failed: { ...get().failed, [id]: true } })
      return null
    } finally {
      set({ loading: { ...get().loading, [id]: false } })
    }
  },
  importFile: async (file) => {
    const info = await api().bible.importTranslation(file.name, await file.text())
    await get().loadList()
    return info
  },
  remove: async (id) => {
    await api().bible.removeTranslation(id)
    const data = { ...get().data }
    delete data[id]
    set({ data })
    await get().loadList()
  }
}))
