import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseUsfx } from './usfx'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/bible/${name}`, import.meta.url)), 'utf8')

describe('parseUsfx', () => {
  const bible = parseUsfx(fixture('usfx-bkr.xml'))

  it('reads the language code and the name from the id line', () => {
    expect(bible).toMatchObject({ id: 'cs-bk', name: 'Bible kralická', abbreviation: 'BK', language: 'cs' })
  })

  it('keeps only canonical books', () => {
    expect(bible.books.map((b) => b.id)).toEqual(['GEN', 'JHN'])
  })

  it('collects verse text between <v> and <ve/> and drops footnotes, cross references and headings', () => {
    const [gen, john] = bible.books
    expect(gen!.chapters[0]).toEqual([
      'Na počátku stvořil Bůh nebe a zemi.',
      'Země pak byla nesličná a pustá, a tma byla nad propastí, a Duch Boží vznášel se nad vodami.',
      'I řekl Bůh: Buď světlo! I bylo světlo.'
    ])
    expect(gen!.chapters[1]![1]).toBe(
      'A dokonal Bůh dne sedmého dílo své, kteréž dělal; a odpočinul v den sedmý ode všeho díla svého, kteréž byl dělal.'
    )
    expect(john!.chapters[0]).toEqual([
      'Na počátku bylo Slovo, a to Slovo bylo u Boha, a to Slovo byl Bůh.',
      'To bylo na počátku u Boha.',
      'Všecky věci skrze ně učiněny jsou, a bez něho nic není učiněno, což učiněno jest.'
    ])
    expect(john!.chapters[2]![15]).toBe(
      'Nebo tak Bůh miloval svět, že Syna svého jednorozeného dal, aby každý, kdož věří v něho, nezahynul, ale měl život věčný.'
    )
    expect(john!.chapters[2]![16]).toBe(
      'Neboť neposlal Bůh Syna svého na svět, aby odsoudil svět, ale aby spasen byl svět skrze něho.'
    )
    const all = bible.books.flatMap((b) => b.chapters.flat()).join(' ')
    expect(all).not.toMatch(/Poznámka|Ex 20|Stvoření světa|Nikodém|GENESIS/)
  })

  it('handles verse ranges and a missing name', () => {
    const data = parseUsfx(
      '<usfx><book id="psa"><c id="117"/><p><v id="1-2"/>Chvalte Hospodina všickni národové.</p></book></usfx>',
      { fallbackName: 'Žaltář' }
    )
    expect(data).toMatchObject({ name: 'Žaltář', language: 'und' })
    expect(data.books[0]!.id).toBe('PSA')
    expect(data.books[0]!.chapters[116]).toEqual(['Chvalte Hospodina všickni národové.'])
  })

  it('throws for files without verses or of another format', () => {
    expect(() => parseUsfx('<usfx><book id="GEN"><h>Genesis</h></book></usfx>')).toThrow(
      expect.objectContaining({ code: 'no-verses' })
    )
    expect(() => parseUsfx('<XMLBIBLE/>')).toThrow(expect.objectContaining({ code: 'wrong-format' }))
  })
})
