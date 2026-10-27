import { create } from 'zustand'
import type { SyncStatus } from '@shared/api'
import { api } from '@/api/client'

interface SyncStore {
  status: SyncStatus
  init(onRemoteChange: () => void): Promise<void>
}

const INITIAL: SyncStatus = {
  state: 'local',
  lastSyncedAt: null,
  error: null,
  configured: false,
  user: null,
  org: null,
  builtInConfig: false
}

export const useSync = create<SyncStore>((set, get) => ({
  status: INITIAL,
  init: async (onRemoteChange) => {
    api().sync.onStatus((status) => {
      const prev = get().status
      set({ status })
      // A finished sync that brought data from other computers – reload the library quietly.
      if (status.state === 'synced' && status.lastSyncedAt !== prev.lastSyncedAt && (status.changes ?? 0) > 0) {
        onRemoteChange()
      }
    })
    try {
      set({ status: await api().sync.status() })
    } catch {
      // keep local mode
    }
  }
}))
