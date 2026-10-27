import { create } from 'zustand'
import type { Song } from '@core/chordpro/model'
import { parseChordPro } from '@core/chordpro/parse'
import { serializeChordPro } from '@core/chordpro/serialize'
import { SongIndex } from '@core/search/songIndex'
import { newId, nowIso } from '@core/util/id'
import { api } from '@/api/client'

export const songIndex = new SongIndex()

const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true })

function sortedIds(songs: Record<string, Song>): string[] {
  return Object.values(songs)
    .sort((a, b) => collator.compare(a.meta.title || '￿', b.meta.title || '￿'))
    .map((s) => s.id)
}

interface LibraryState {
  loaded: boolean
  songs: Record<string, Song>
  /** Song ids sorted by title (Czech collation). */
  order: string[]
  load(): Promise<void>
  save(song: Song): Promise<Song>
  create(content?: string): Promise<Song>
  remove(id: string): Promise<void>
}

export function songFromContent(id: string, content: string, updatedAt: string): Song {
  const song = parseChordPro(content)
  return { ...song, id, updatedAt }
}

export const useLibrary = create<LibraryState>((set, get) => ({
  loaded: false,
  songs: {},
  order: [],
  load: async () => {
    const files = await api().songs.list()
    const songs: Record<string, Song> = {}
    for (const f of files) songs[f.id] = songFromContent(f.id, f.content, f.updatedAt)
    songIndex.setAll(Object.values(songs))
    set({ songs, order: sortedIds(songs), loaded: true })
  },
  save: async (input) => {
    const song: Song = { ...input, updatedAt: nowIso() }
    await api().songs.save({ id: song.id, content: serializeChordPro(song), updatedAt: song.updatedAt })
    const songs = { ...get().songs, [song.id]: song }
    songIndex.upsert(song)
    set({ songs, order: sortedIds(songs) })
    return song
  },
  create: async (content) => {
    const id = newId()
    const base = songFromContent(id, content ?? '{title: Nová píseň}\n', nowIso())
    return get().save(base)
  },
  remove: async (id) => {
    await api().songs.remove(id)
    const songs = { ...get().songs }
    delete songs[id]
    songIndex.remove(id)
    set({ songs, order: sortedIds(songs) })
  }
}))
