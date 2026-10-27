import { parseChordPro } from '../chordpro/parse'
import type { Song } from '../chordpro/model'
import { findDuplicates } from './duplicates'

const song = (id: string, title: string, firstLine = `První řádek písně ${title}`): Song => {
  const s = parseChordPro(`{title: ${title}}\n{start_of_verse}\n[G]${firstLine}\nDruhý řádek\n{end_of_verse}`)
  s.id = id
  return s
}

describe('findDuplicates', () => {
  const library = [
    song('a', 'Žehnej, duše má', 'Žehnej, duše má, Hospodinu'),
    song('b', 'Světlo nad horami', 'Ráno, když se probouzí den,'),
    song('c', 'Krátká', 'Amen, amen'),
    song('d', 'Jiná píseň')
  ]

  it('finds songs with the same title regardless of case, diacritics and spacing', () => {
    expect(findDuplicates(song('', 'zehnej,  DUSE ma'), library).map((s) => s.id)).toEqual(['a'])
  })

  it('finds songs with the same first lyric line', () => {
    expect(
      findDuplicates(song('', 'Úplně jiný název', 'ráno, když se probouzí den.'), library).map((s) => s.id)
    ).toEqual(['b'])
  })

  it('ignores first lines shorter than 12 characters', () => {
    expect(findDuplicates(song('', 'Úplně jiný název', 'Amen, amen'), library)).toEqual([])
  })

  it('ignores empty titles', () => {
    const untitled = song('', 'x', 'Úplně nový první řádek')
    untitled.meta.title = ''
    const other = song('e', 'y', 'Jiný první řádek písně')
    other.meta.title = ''
    expect(findDuplicates(untitled, [other])).toEqual([])
  })

  it('excludes the song itself', () => {
    expect(findDuplicates(song('a', 'Žehnej, duše má'), library)).toEqual([])
  })

  it('returns each duplicate once, in library order', () => {
    const both = song('', 'Jiná píseň', 'Ráno, když se probouzí den,')
    expect(findDuplicates(both, library).map((s) => s.id)).toEqual(['b', 'd'])
  })
})
