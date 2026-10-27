import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BibleFormatError } from './common'
import { parseZefania } from './zefania'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/bible/${name}`, import.meta.url)), 'utf8')

describe('parseZefania', () => {
  const bible = parseZefania(fixture('zefania-kjv.xml'))

  it('reads the metadata from INFORMATION', () => {
    expect(bible).toMatchObject({
      id: 'en-kjv',
      name: 'King James Version',
      abbreviation: 'KJV',
      language: 'en',
      license: 'Public Domain'
    })
  })

  it('maps bnumber to USFM ids and ignores books beyond the Protestant canon', () => {
    expect(bible.books.map((b) => b.id)).toEqual(['GEN', 'JHN'])
  })

  it('stores chapters and verses by number', () => {
    const gen = bible.books[0]!
    expect(gen.chapters).toHaveLength(2)
    expect(gen.chapters[0]).toHaveLength(3)
    expect(gen.chapters[0]![0]).toBe('In the beginning God created the heaven and the earth.')
    expect(gen.chapters[1]![1]).toBe(
      'And on the seventh day God ended his work which he had made; and he rested on the seventh day from all his work which he had made.'
    )
  })

  it('drops notes and captions, keeps text of inline markup', () => {
    const gen = bible.books[0]!
    expect(gen.chapters[0]![1]).toBe(
      'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.'
    )
    const john = bible.books[1]!
    expect(john.chapters[0]![0]).toBe(
      'In the beginning was the Word, and the Word was with God, and the Word was God.'
    )
    expect(john.chapters[2]![15]).toBe(
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
    )
    expect(john.chapters[2]![16]).toBe(
      'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.'
    )
  })

  it('fills missing chapters and verses with empty values', () => {
    const john = bible.books[1]!
    expect(john.chapters).toHaveLength(3)
    expect(john.chapters[1]).toEqual([])
    expect(john.chapters[2]).toHaveLength(17)
    expect(john.chapters[2]!.slice(0, 15).every((v) => v === '')).toBe(true)
  })

  it('falls back to biblename and derives the abbreviation', () => {
    const xml = `<XMLBIBLE biblename="Český ekumenický překlad"><BIBLEBOOK bnumber="19"><CHAPTER cnumber="23"><VERS vnumber="1">Hospodin je můj pastýř, nebudu mít nedostatek.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`
    const data = parseZefania(xml)
    expect(data).toMatchObject({ name: 'Český ekumenický překlad', abbreviation: 'ČEP', language: 'und' })
    expect(data.id).toBe('und-cep')
    expect(data.books[0]!.id).toBe('PSA')
    expect(data.books[0]!.chapters[22]![0]).toBe('Hospodin je můj pastýř, nebudu mít nedostatek.')
  })

  it('uses the fallback name when the file has none', () => {
    const xml = `<XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">Text.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`
    expect(parseZefania(xml, { fallbackName: 'Můj překlad' }).name).toBe('Můj překlad')
    expect(parseZefania(xml).name).toBe('Zefania')
  })

  it('throws a descriptive error for unusable input', () => {
    expect(() => parseZefania('not xml at all')).toThrow(BibleFormatError)
    expect(() => parseZefania('<XMLBIBLE><BIBLEBOOK></XMLBIBLE>')).toThrow(
      expect.objectContaining({ code: 'invalid-xml' })
    )
    expect(() => parseZefania('<osis><osisText/></osis>')).toThrow(
      expect.objectContaining({ code: 'wrong-format' })
    )
    expect(() => parseZefania('<XMLBIBLE biblename="Prázdná"></XMLBIBLE>')).toThrow(
      expect.objectContaining({ code: 'no-verses' })
    )
  })
})
