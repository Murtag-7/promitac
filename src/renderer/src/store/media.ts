import { create } from 'zustand'
import type { MediaItem } from '@core/media/model'
import { api } from '@/api/client'

interface MediaState {
  items: MediaItem[]
  load(): Promise<void>
  importFiles(files: File[]): Promise<MediaItem[]>
  update(item: MediaItem): Promise<void>
  remove(id: string): Promise<void>
}

export function mediaUrl(item: MediaItem | undefined): string {
  return item ? api().media.url(item) : ''
}

export const useMedia = create<MediaState>((set, get) => ({
  items: [],
  load: async () => set({ items: await api().media.list() }),
  importFiles: async (files) => {
    const added = await api().media.importFiles(files)
    set({ items: [...get().items, ...added] })
    return added
  },
  update: async (item) => {
    set({ items: get().items.map((m) => (m.id === item.id ? item : m)) })
    await api().media.update(item)
  },
  remove: async (id) => {
    set({ items: get().items.filter((m) => m.id !== id) })
    await api().media.remove(id)
  }
}))
