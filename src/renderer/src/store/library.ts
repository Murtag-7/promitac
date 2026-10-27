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
  /** Raw ChordPro text as stored (the editor edits this, keeping the user's formatting). */
  contents: Record<string, string>
  /** Song ids sorted by title (Czech collation). */
  order: string[]
  load(): Promise<void>
  save(song: Song): Promise<Song>
  /** Save raw ChordPro text of an existing or new song. */
  saveContent(id: string, content: string): Promise<Song>
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
  contents: {},
  order: [],
  load: async () => {
    const files = await api().songs.list()
    const songs: Record<string, Song> = {}
    const contents: Record<string, string> = {}
    for (const f of files) {
      try {
        songs[f.id] = songFromContent(f.id, f.content, f.updatedAt)
        contents[f.id] = f.content
      } catch (err) {
        // Never replace an unreadable file with an empty song – just leave it out of the list.
        console.error(`Song ${f.id} could not be parsed`, err)
      }
    }
    songIndex.setAll(Object.values(songs))
    set({ songs, contents, order: sortedIds(songs), loaded: true })
  },
  save: async (input) => {
    const song: Song = { ...input, updatedAt: nowIso() }
    return get().saveContent(song.id, serializeChordPro(song))
  },
  saveContent: async (id, content) => {
    const updatedAt = nowIso()
    const song = songFromContent(id, content, updatedAt)
    await api().songs.save({ id, content, updatedAt })
    const songs = { ...get().songs, [id]: song }
    songIndex.upsert(song)
    set({ songs, contents: { ...get().contents, [id]: content }, order: sortedIds(songs) })
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
    const contents = { ...get().contents }
    delete songs[id]
    delete contents[id]
    songIndex.remove(id)
    set({ songs, contents, order: sortedIds(songs) })
  }
}))
