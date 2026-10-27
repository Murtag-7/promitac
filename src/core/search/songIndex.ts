import MiniSearch, { type SearchOptions } from 'minisearch'
import type { Song } from '../chordpro/model'
import { firstLyricLine, songLyricsText } from '../chordpro/text'
import { fold } from './normalize'

interface SongDocument {
  id: string
  title: string
  firstLine: string
  lyrics: string
  artist: string
  tags: string
}

export interface SongSearchResult {
  id: string
  score: number
}

const FIELDS = ['title', 'firstLine', 'lyrics', 'artist', 'tags'] as const

const SEARCH_OPTIONS: SearchOptions = {
  prefix: true,
  // Typos are tolerated only in longer words; short words would match far too much.
  fuzzy: (term) => (term.length > 3 ? 0.2 : false),
  boost: { title: 3, firstLine: 2 },
  combineWith: 'AND'
}

function toDocument(song: Song): SongDocument {
  return {
    id: song.id,
    title: song.meta.title,
    firstLine: firstLyricLine(song),
    lyrics: songLyricsText(song),
    artist: song.meta.artist ?? '',
    tags: song.meta.tags.join(' ')
  }
}

function createIndex(): MiniSearch<SongDocument> {
  return new MiniSearch<SongDocument>({
    idField: 'id',
    fields: [...FIELDS],
    processTerm: (term) => fold(term),
    searchOptions: SEARCH_OPTIONS
  })
}

/**
 * In-memory full-text index of the song library (title, first line, lyrics, artist, tags).
 * Matching ignores case and diacritics, supports prefixes and small typos.
 */
export class SongIndex {
  private index = createIndex()

  get size(): number {
    return this.index.documentCount
  }

  /** Replace the whole index. With duplicate ids the last song wins. */
  setAll(songs: Song[]): void {
    const unique = new Map<string, SongDocument>()
    for (const song of songs) unique.set(song.id, toDocument(song))
    this.index = createIndex()
    this.index.addAll([...unique.values()])
  }

  upsert(song: Song): void {
    if (this.index.has(song.id)) this.index.replace(toDocument(song))
    else this.index.add(toDocument(song))
  }

  remove(id: string): void {
    if (this.index.has(id)) this.index.discard(id)
  }

  /** Best matches first; an empty query returns [] (the UI then lists songs alphabetically). */
  search(query: string, limit = 50): SongSearchResult[] {
    if (!query.trim()) return []
    return this.index
      .search(query)
      .slice(0, Math.max(0, limit))
      .map((r) => ({ id: String(r.id), score: r.score }))
  }
}
