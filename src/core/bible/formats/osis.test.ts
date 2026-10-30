import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseOsis } from './osis'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/bible/${name}`, import.meta.url)), 'utf8')

describe('parseOsis (container verses)', () => {
  const bible = parseOsis(fixture('osis-kjv.xml'))

  it('reads the metadata from osisText and the work header', () => {
    expect(bible).toMatchObject({
      id: 'en-kjv',
      name: 'King James Version (1769)',
      abbreviation: 'KJV',
      language: 'en',
      license: 'Public Domain'
    })
  })

  it('maps OSIS book ids to USFM and ignores unknown books', () => {
    expect(bible.books.map((b) => b.id)).toEqual(['GEN', 'JHN'])
  })

  it('keeps the text of inline markup and drops notes and titles', () => {
    const [gen, john] = bible.books
    expect(gen!.chapters[0]![0]).toBe('In the beginning God created the heaven and the earth.')
    expect(gen!.chapters[0]![1]).toBe(
      'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.'
    )
    expect(gen!.chapters[1]).toHaveLength(2)
    expect(john!.chapters[2]![15]).toBe(
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
    )
    expect(john!.chapters[2]![16]).toBe(
      'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.'
    )
    expect(john!.chapters[2]!.slice(0, 15).every((v) => v === '')).toBe(true)
  })
})

describe('parseOsis (milestone verses)', () => {
  const bible = parseOsis(fixture('osis-milestone-bkr.xml'))

  it('reads the metadata', () => {
    expect(bible).toMatchObject({
      id: 'cs-czebkr',
      name: 'Bible kralická',
      abbreviation: 'CzeBKR',
      language: 'cs'
    })
    expect(bible.license).toBeUndefined()
  })

  it('collects text between sID and eID milestones', () => {
    const [gen, john] = bible.books
    expect(gen!.chapters[0]).toEqual([
      'Na počátku stvořil Bůh nebe a zemi.',
      'Země pak byla nesličná a pustá, a tma byla nad propastí, a Duch Boží vznášel se nad vodami.',
      'I řekl Bůh: Buď světlo! I bylo světlo.'
    ])
    expect(gen!.chapters[1]![1]).toBe(
      'A dokonal Bůh dne sedmého dílo své, kteréž dělal; a odpočinul v den sedmý ode všeho díla svého, kteréž byl dělal.'
    )
    expect(john!.chapters[0]![0]).toBe('Na počátku bylo Slovo, a to Slovo bylo u Boha, a to Slovo byl Bůh.')
    expect(john!.chapters[2]![15]).toBe(
      'Nebo tak Bůh miloval svět, že Syna svého jednorozeného dal, aby každý, kdož věří v něho, nezahynul, ale měl život věčný.'
    )
  })

  it('does not leak section titles between verses into a verse', () => {
    const all = bible.books.flatMap((b) => b.chapters.flat()).join(' ')
    expect(all).not.toContain('Stvoření světa')
    expect(all).not.toContain('Poznámka')
  })
})

describe('parseOsis edge cases', () => {
  const wrap = (body: string) =>
    `<osis xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace"><osisText osisIDWork="Test" xml:lang="en"><div type="book" osisID="Ps">${body}</div></osisText></osis>`

  it('keeps canonical psalm titles that are part of verse 1', () => {
    const data = parseOsis(
      wrap(
        '<chapter osisID="Ps.23"><verse osisID="Ps.23.1"><title type="psalm" canonical="true">A Psalm of David.</title> The LORD is my shepherd; I shall not want.</verse></chapter>'
      )
    )
    expect(data.books[0]!.chapters[22]![0]).toBe(
      'A Psalm of David. The LORD is my shepherd; I shall not want.'
    )
  })

  it('puts the text of a combined verse into the first verse', () => {
    const data = parseOsis(
      wrap('<chapter osisID="Ps.1"><verse osisID="Ps.1.1 Ps.1.2">Blessed is the man.</verse></chapter>')
    )
    expect(data.books[0]!.chapters[0]).toEqual(['Blessed is the man.', ''])
  })

  it('accepts verses identified by n inside a chapter', () => {
    const data = parseOsis(
      wrap('<chapter osisID="Ps.2"><verse n="1">Why do the heathen rage?</verse></chapter>')
    )
    expect(data.books[0]!.chapters[1]![0]).toBe('Why do the heathen rage?')
  })

  it('throws for files without verses or of another format', () => {
    expect(() => parseOsis(wrap(''))).toThrow(expect.objectContaining({ code: 'no-verses' }))
    expect(() => parseOsis('<XMLBIBLE/>')).toThrow(expect.objectContaining({ code: 'wrong-format' }))
    expect(() => parseOsis('<osis>')).toThrow(expect.objectContaining({ code: 'invalid-xml' }))
  })
})
