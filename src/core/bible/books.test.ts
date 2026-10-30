import { BOOKS, findBook, getBook } from './books'

const USFM_IDS =
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(
    ' '
  )

const CZECH_ABBRS =
  'Gn Ex Lv Nu Dt Joz Sd Rt 1S 2S 1Kr 2Kr 1Pa 2Pa Ezd Neh Est Jb Ž Př Kaz Pís Iz Jr Pl Ez Da Oz Jl Am Abd Jon Mi Na Abk Sf Ag Za Mal Mt Mk L J Sk Ř 1K 2K Ga Ef Fp Ko 1Te 2Te 1Tm 2Tm Tt Fm Žd Jk 1P 2P 1J 2J 3J Ju Zj'.split(
    ' '
  )

const CZECH_NAMES = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numeri',
  'Deuteronomium',
  'Jozue',
  'Soudců',
  'Rút',
  '1. Samuelova',
  '2. Samuelova',
  '1. Královská',
  '2. Královská',
  '1. Paralipomenon',
  '2. Paralipomenon',
  'Ezdráš',
  'Nehemjáš',
  'Ester',
  'Jób',
  'Žalmy',
  'Přísloví',
  'Kazatel',
  'Píseň písní',
  'Izajáš',
  'Jeremjáš',
  'Pláč',
  'Ezechiel',
  'Daniel',
  'Ozeáš',
  'Jóel',
  'Ámos',
  'Abdijáš',
  'Jonáš',
  'Micheáš',
  'Nahum',
  'Abakuk',
  'Sofonjáš',
  'Ageus',
  'Zacharjáš',
  'Malachiáš',
  'Matouš',
  'Marek',
  'Lukáš',
  'Jan',
  'Skutky apoštolů',
  'Římanům',
  '1. Korintským',
  '2. Korintským',
  'Galatským',
  'Efezským',
  'Filipským',
  'Koloským',
  '1. Tesalonickým',
  '2. Tesalonickým',
  '1. Timoteovi',
  '2. Timoteovi',
  'Titovi',
  'Filemonovi',
  'Židům',
  'Jakubův',
  '1. Petrův',
  '2. Petrův',
  '1. Janův',
  '2. Janův',
  '3. Janův',
  'Judův',
  'Zjevení Janovo'
]

const CHAPTERS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12,
  14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5,
  5, 3, 5, 1, 1, 1, 22
]

describe('BOOKS', () => {
  it('lists the 66 books of the Protestant canon in order with USFM ids', () => {
    expect(BOOKS).toHaveLength(66)
    expect(BOOKS.map((b) => b.id)).toEqual(USFM_IDS)
    expect(BOOKS.map((b) => b.order)).toEqual(USFM_IDS.map((_, i) => i + 1))
  })

  it('has correct chapter counts (1189 in total)', () => {
    expect(BOOKS.map((b) => b.chapters)).toEqual(CHAPTERS)
    expect(BOOKS.reduce((sum, b) => sum + b.chapters, 0)).toBe(1189)
  })

  it('splits testaments after Malachi', () => {
    expect(BOOKS.filter((b) => b.testament === 'OT')).toHaveLength(39)
    expect(getBook('MAL')?.testament).toBe('OT')
    expect(getBook('MAT')?.testament).toBe('NT')
  })

  it('uses Czech ecumenical names and abbreviations', () => {
    expect(BOOKS.map((b) => b.nameCs)).toEqual(CZECH_NAMES)
    expect(BOOKS.map((b) => b.abbrCs)).toEqual(CZECH_ABBRS)
  })

  it('has English names and abbreviations', () => {
    expect(getBook('GEN')).toMatchObject({ nameEn: 'Genesis', abbrEn: 'Gen' })
    expect(getBook('PSA')).toMatchObject({ nameEn: 'Psalms', abbrEn: 'Ps' })
    expect(getBook('1CO')).toMatchObject({ nameEn: '1 Corinthians', abbrEn: '1 Cor' })
    expect(getBook('REV')).toMatchObject({ nameEn: 'Revelation', abbrEn: 'Rev' })
    for (const book of BOOKS) {
      expect(book.nameEn.length).toBeGreaterThan(2)
      expect(book.abbrEn.length).toBeGreaterThan(1)
    }
  })

  it('getBook returns undefined for unknown ids', () => {
    expect(getBook('TOB')).toBeUndefined()
  })
})

describe('findBook', () => {
  it('finds every book by its own names, abbreviations, aliases and id (no collisions)', () => {
    for (const book of BOOKS) {
      for (const query of [book.id, book.nameCs, book.abbrCs, book.nameEn, book.abbrEn, ...book.aliases]) {
        expect({ query, id: findBook(query)?.id }).toEqual({ query, id: book.id })
      }
    }
  })

  it.each([
    ['J', 'JHN'],
    ['1J', '1JN'],
    ['Jk', 'JAS'],
    ['Jl', 'JOL'],
    ['Jb', 'JOB'],
    ['Ž', 'PSA'],
    ['Žd', 'HEB'],
    ['L', 'LUK'],
    ['Ř', 'ROM'],
    ['Rt', 'RUT'],
    ['Mt.', 'MAT']
  ])('resolves the tricky abbreviation %s → %s', (query, id) => {
    expect(findBook(query)?.id).toBe(id)
  })

  it.each(['1 K', '1.K', '1K', 'I K', 'I. K', '1. K', '1 Kor', '1Kor', 'I Kor', '1 Cor', '1. Korintským'])(
    'ignores spaces, dots and roman numerals in "%s" → 1. Korintským',
    (query) => {
      expect(findBook(query)?.id).toBe('1CO')
    }
  )

  it.each([
    ['II Kor', '2CO'],
    ['II. K', '2CO'],
    ['III J', '3JN'],
    ['3 Jan', '3JN'],
    ['1 John', '1JN'],
    ['III John', '3JN'],
    ['I Samuel', '1SA'],
    ['II Kings', '2KI']
  ])('handles roman and arabic book numbers: %s → %s', (query, id) => {
    expect(findBook(query)?.id).toBe(id)
  })

  it.each([
    ['1. Mojžíšova', 'GEN'],
    ['1 Mojzisova', 'GEN'],
    ['I. Mojžíšova', 'GEN'],
    ['2. Mojžíšova', 'EXO'],
    ['3. Mojžíšova', 'LEV'],
    ['4. Mojžíšova', 'NUM'],
    ['5. Mojžíšova', 'DEU'],
    ['Žalm', 'PSA'],
    ['Zalm', 'PSA'],
    ['zalmy', 'PSA'],
    ['ŽALM', 'PSA'],
    ['Žl', 'PSA'],
    ['Ps', 'PSA'],
    ['Mat', 'MAT'],
    ['Mar', 'MRK'],
    ['Luk', 'LUK'],
    ['Jan', 'JHN'],
    ['jan', 'JHN'],
    ['JAN', 'JHN'],
    ['Janovo evangelium', 'JHN'],
    ['Skutky', 'ACT'],
    ['Rim', 'ROM'],
    ['Řím', 'ROM'],
    ['Zj', 'REV'],
    ['Zjev', 'REV'],
    ['Apokalypsa', 'REV'],
    ['Pisen pisni', 'SNG'],
    ['Fil', 'PHP'],
    ['Jak', 'JAS']
  ])('knows the Czech variant %s → %s', (query, id) => {
    expect(findBook(query)?.id).toBe(id)
  })

  it.each([
    ['Gen', 'GEN'],
    ['Ex', 'EXO'],
    ['Psalm', 'PSA'],
    ['Psalms', 'PSA'],
    ['Matt', 'MAT'],
    ['Mk', 'MRK'],
    ['Lk', 'LUK'],
    ['Jn', 'JHN'],
    ['John', 'JHN'],
    ['Rom', 'ROM'],
    ['Rev', 'REV'],
    ['Song of Solomon', 'SNG'],
    ['Phil', 'PHP'],
    ['Phlm', 'PHM'],
    ['Revelation of John', 'REV']
  ])('knows the English variant %s → %s', (query, id) => {
    expect(findBook(query)?.id).toBe(id)
  })

  it.each([
    ['Genes', 'GEN'],
    ['Deuteron', 'DEU'],
    ['Filip', 'PHP'],
    ['Kolos', 'COL'],
    ['Ezech', 'EZK'],
    ['Zachar', 'ZEC'],
    ['1 Tesal', '1TH'],
    ['Thessalon', null],
    ['2 Thessalon', '2TH']
  ])('matches a unique name prefix of 3+ letters: %s → %s', (query, id) => {
    expect(findBook(query)?.id ?? null).toBe(id)
  })

  it.each(['Phi', 'Evangelium', 'Jo', 'Kor', 'Tes'])(
    'returns null for the ambiguous or short "%s"',
    (query) => {
      expect(findBook(query)).toBeNull()
    }
  )

  it.each(['', '   ', '1', 'Xyz', 'Tobiáš', 'Sir', '4 Jan', '1 Gn', 'Jan Jan'])(
    'returns null for unknown "%s"',
    (query) => {
      expect(findBook(query)).toBeNull()
    }
  )
})
