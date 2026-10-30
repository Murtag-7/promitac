import { formatReference, formatReferenceShort, parseReference, type BibleRef } from './reference'

describe('parseReference', () => {
  it.each<[string, BibleRef]>([
    ['J 3,16', { book: 'JHN', chapter: 3, verseStart: 16 }],
    ['Jan 3:16-18', { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 }],
    ['Ž 23', { book: 'PSA', chapter: 23 }],
    ['1K 13,4-7', { book: '1CO', chapter: 13, verseStart: 4, verseEnd: 7 }],
    ['1 Kor 13:4–7', { book: '1CO', chapter: 13, verseStart: 4, verseEnd: 7 }],
    ['1 Kor 13:4—7', { book: '1CO', chapter: 13, verseStart: 4, verseEnd: 7 }],
    ['J 3,16-4,2', { book: 'JHN', chapter: 3, verseStart: 16, chapterEnd: 4, verseEnd: 2 }],
    ['J 3,16–4:2', { book: 'JHN', chapter: 3, verseStart: 16, chapterEnd: 4, verseEnd: 2 }],
    ['Mt 5', { book: 'MAT', chapter: 5 }],
    ['Mt 5-7', { book: 'MAT', chapter: 5, chapterEnd: 7 }],
    ['1. Mojžíšova 1,1', { book: 'GEN', chapter: 1, verseStart: 1 }],
    ['zalm 23', { book: 'PSA', chapter: 23 }],
    ['Ž 23,1–6', { book: 'PSA', chapter: 23, verseStart: 1, verseEnd: 6 }],
    ['  Jan   3 , 16  -  18 ', { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 }],
    ['J 3,16.', { book: 'JHN', chapter: 3, verseStart: 16 }],
    ['Ž 23.', { book: 'PSA', chapter: 23 }],
    ['J3,16', { book: 'JHN', chapter: 3, verseStart: 16 }],
    ['John 3.16', { book: 'JHN', chapter: 3, verseStart: 16 }],
    ['II Kor 5,17', { book: '2CO', chapter: 5, verseStart: 17 }],
    ['I. K 13', { book: '1CO', chapter: 13 }],
    ['J 3,16-16', { book: 'JHN', chapter: 3, verseStart: 16 }],
    ['J 3,16-3,18', { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 }],
    ['Zj 22,21', { book: 'REV', chapter: 22, verseStart: 21 }],
    ['Ž 150', { book: 'PSA', chapter: 150 }]
  ])('parses "%s"', (input, expected) => {
    expect(parseReference(input)).toEqual(expected)
  })

  it('works with a non-breaking space between book and chapter', () => {
    expect(parseReference(`J${String.fromCharCode(0xa0)}3,16`)).toEqual({
      book: 'JHN',
      chapter: 3,
      verseStart: 16
    })
  })

  it.each<[string, BibleRef]>([
    ['Ju 3', { book: 'JUD', chapter: 1, verseStart: 3 }],
    ['Fm 4-6', { book: 'PHM', chapter: 1, verseStart: 4, verseEnd: 6 }],
    ['Ju 1', { book: 'JUD', chapter: 1 }],
    ['Ju 1,24-25', { book: 'JUD', chapter: 1, verseStart: 24, verseEnd: 25 }]
  ])('reads a single number in a one-chapter book as a verse: "%s"', (input, expected) => {
    expect(parseReference(input)).toEqual(expected)
  })

  it.each([
    '',
    '   ',
    'hello',
    'nesmysl 3,16',
    'Xyz 3,16',
    'J',
    '3,16',
    'J 0',
    'J 3,0',
    'J 3,18-16',
    'J 3,16-2,1',
    'J 3,16-22,1',
    'J 22',
    'Ž 151',
    'Mt 7-5',
    'Mt 5-29',
    'J 3,',
    'J 3,16-',
    'J abc',
    'J 3,16,17',
    'Ju 2,1',
    'Ju 3-2'
  ])('returns null for "%s"', (input) => {
    expect(parseReference(input)).toBeNull()
  })
})

describe('formatReference', () => {
  it('formats Czech references with full book names, comma and en dash', () => {
    expect(formatReference({ book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 })).toBe('Jan 3,16–18')
    expect(formatReference({ book: 'JHN', chapter: 3, verseStart: 16 })).toBe('Jan 3,16')
    expect(formatReference({ book: 'PSA', chapter: 23 })).toBe('Žalmy 23')
    expect(formatReference({ book: 'JHN', chapter: 3, verseStart: 16, chapterEnd: 4, verseEnd: 2 })).toBe(
      'Jan 3,16–4,2'
    )
    expect(formatReference({ book: 'MAT', chapter: 5, chapterEnd: 7 })).toBe('Matouš 5–7')
    expect(formatReference({ book: '1CO', chapter: 13, verseStart: 4, verseEnd: 7 }, 'cs')).toBe(
      '1. Korintským 13,4–7'
    )
  })

  it('formats English references with colon and hyphen', () => {
    expect(formatReference({ book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 }, 'en')).toBe(
      'John 3:16-18'
    )
    expect(formatReference({ book: 'PSA', chapter: 23 }, 'en')).toBe('Psalms 23')
    expect(
      formatReference({ book: 'JHN', chapter: 3, verseStart: 16, chapterEnd: 4, verseEnd: 2 }, 'en')
    ).toBe('John 3:16-4:2')
    expect(formatReference({ book: 'MAT', chapter: 5, chapterEnd: 7 }, 'en')).toBe('Matthew 5-7')
  })

  it('ignores a redundant end equal to the start', () => {
    expect(formatReference({ book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 16 })).toBe('Jan 3,16')
    expect(formatReference({ book: 'JHN', chapter: 3, verseStart: 16, chapterEnd: 3, verseEnd: 18 })).toBe(
      'Jan 3,16–18'
    )
  })

  it('falls back to the raw id for an unknown book', () => {
    expect(formatReference({ book: 'TOB', chapter: 1, verseStart: 2 })).toBe('TOB 1,2')
  })

  it('formats short references with abbreviations', () => {
    expect(formatReferenceShort({ book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 })).toBe('J 3,16–18')
    expect(formatReferenceShort({ book: '1CO', chapter: 13, verseStart: 4, verseEnd: 7 })).toBe('1K 13,4–7')
    expect(formatReferenceShort({ book: 'PSA', chapter: 23 })).toBe('Ž 23')
    expect(formatReferenceShort({ book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 }, 'en')).toBe(
      'John 3:16-18'
    )
    expect(formatReferenceShort({ book: '1CO', chapter: 13, verseStart: 4, verseEnd: 7 }, 'en')).toBe(
      '1 Cor 13:4-7'
    )
  })

  it.each<BibleRef>([
    { book: 'JHN', chapter: 3, verseStart: 16 },
    { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 },
    { book: 'JHN', chapter: 3, verseStart: 16, chapterEnd: 4, verseEnd: 2 },
    { book: 'PSA', chapter: 23 },
    { book: 'MAT', chapter: 5, chapterEnd: 7 },
    { book: '1CO', chapter: 13, verseStart: 4, verseEnd: 7 },
    { book: 'SNG', chapter: 2, verseStart: 1 },
    { book: '3JN', chapter: 1, verseStart: 2, verseEnd: 4 },
    { book: 'ACT', chapter: 2, verseStart: 1, verseEnd: 4 }
  ])('round-trips %o through every format', (ref) => {
    expect(parseReference(formatReference(ref))).toEqual(ref)
    expect(parseReference(formatReference(ref, 'en'))).toEqual(ref)
    expect(parseReference(formatReferenceShort(ref))).toEqual(ref)
    expect(parseReference(formatReferenceShort(ref, 'en'))).toEqual(ref)
  })
})
