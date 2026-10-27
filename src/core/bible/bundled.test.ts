import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { BOOKS } from './books'
import type { BibleData, BibleTranslationInfo } from './model'
import { getVerses } from './passage'

const resource = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../resources/bibles/${name}`, import.meta.url)))

function loadBible(name: string): BibleData {
  return JSON.parse(gunzipSync(resource(name)).toString('utf8')) as BibleData
}

describe.each([
  {
    file: 'cs-bkr.json.gz',
    id: 'cs-bkr',
    abbreviation: 'BKR',
    language: 'cs',
    gen11: 'Na počátku stvořil Bůh nebe a zemi.',
    jhn316:
      'Nebo tak Bůh miloval svět, že Syna svého jednorozeného dal, aby každý, kdož věří v něho, nezahynul, ale měl život věčný.'
  },
  {
    file: 'en-kjv.json.gz',
    id: 'en-kjv',
    abbreviation: 'KJV',
    language: 'en',
    gen11: 'In the beginning God created the heaven and the earth.',
    jhn316:
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
  }
])('bundled $file', ({ file, id, abbreviation, language, gen11, jhn316 }) => {
  const bible = loadBible(file)

  it('has the expected metadata', () => {
    expect(bible).toMatchObject({ id, abbreviation, language, license: 'Public Domain' })
  })

  it('contains all 66 books in canonical order with matching chapter counts', () => {
    expect(bible.books.map((b) => b.id)).toEqual(BOOKS.map((b) => b.id))
    for (const [i, book] of bible.books.entries()) {
      expect({ id: book.id, chapters: book.chapters.length }).toEqual({
        id: book.id,
        chapters: BOOKS[i]!.chapters
      })
    }
  })

  it('has Genesis 1:1 and John 3:16', () => {
    expect(bible.books[0]!.chapters[0]![0]).toBe(gen11)
    expect(getVerses(bible, { book: 'JHN', chapter: 3, verseStart: 16 })).toEqual([
      { chapter: 3, verse: 16, text: jhn316 }
    ])
  })

  it('has 31102 non-empty verses without leftover markup', () => {
    const verses = bible.books.flatMap((b) => b.chapters.flat())
    expect(verses).toHaveLength(31102)
    const bad = verses.filter((v) => v === '' || /[<>{}¶]|\d|\s{2}|^\s|\s$/.test(v))
    expect(bad).toEqual([])
  })

  it('has six verses in Psalm 23', () => {
    expect(getVerses(bible, { book: 'PSA', chapter: 23 })).toHaveLength(6)
  })
})

describe('bundled KJV cleanup', () => {
  const kjv = loadBible('en-kjv.json.gz')
  const verse = (book: string, chapter: number, v: number) =>
    getVerses(kjv, { book, chapter, verseStart: v })[0]?.text

  it('turns the drop-cap first word of a chapter into normal case', () => {
    expect(verse('PSA', 23, 1)).toBe('A Psalm of David. The Lord is my shepherd; I shall not want.')
    expect(verse('JOB', 31, 1)).toBe('I made a covenant with mine eyes; why then should I think upon a maid?')
    expect(verse('ISA', 25, 1)?.startsWith('O Lord, thou art my God;')).toBe(true)
    expect(verse('HOS', 14, 1)).toBe(
      'O Israel, return unto the Lord thy God; for thou hast fallen by thine iniquity.'
    )
    expect(verse('PRO', 15, 1)).toBe('A soft answer turneth away wrath: but grievous words stir up anger.')
  })

  it('keeps all-caps inscriptions inside chapters', () => {
    expect(verse('DAN', 5, 25)).toContain('MENE, MENE, TEKEL, UPHARSIN')
  })

  it('fills the verses that are empty in the source', () => {
    expect(verse('ROM', 8, 1)).toBe(
      'There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit.'
    )
  })
})

describe('bundled BKR cleanup', () => {
  it('removes the bracketed alternative readings', () => {
    const bkr = loadBible('cs-bkr.json.gz')
    expect(getVerses(bkr, { book: 'MAT', chapter: 2, verseStart: 4 })[0]?.text).toBe(
      'A protož svolav všecky přední kněží a učitele lidu, tázal se jich, kde by se Kristus měl naroditi.'
    )
  })
})

describe('bundled index.json', () => {
  it('lists both built-in translations', () => {
    const index = JSON.parse(resource('index.json').toString('utf8')) as BibleTranslationInfo[]
    expect(index).toEqual([
      {
        id: 'cs-bkr',
        name: 'Bible kralická (1613)',
        abbreviation: 'BKR',
        language: 'cs',
        builtIn: true,
        license: 'Public Domain',
        source: expect.stringContaining('CzeBKR')
      },
      {
        id: 'en-kjv',
        name: 'King James Version (1769, Pure Cambridge Edition)',
        abbreviation: 'KJV',
        language: 'en',
        builtIn: true,
        license: 'Public Domain',
        source: expect.stringContaining('KJVPCE')
      }
    ])
  })
})
