import type { BibleData } from './model'
import { getVerses, passageToSlides, type PassageVerse } from './passage'

function chapter(c: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Text ${c}:${i + 1}.`)
}

const data: BibleData = {
  id: 'test',
  name: 'Test',
  abbreviation: 'TST',
  language: 'cs',
  books: [
    { id: 'JHN', chapters: [chapter(1, 51), chapter(2, 25), chapter(3, 36), chapter(4, 54)] },
    { id: 'PSA', chapters: [...Array.from({ length: 22 }, (_, i) => chapter(i + 1, 3)), chapter(23, 6)] },
    // a translation with a gap in its versification
    { id: 'ROM', chapters: [[], ['First.', '', 'Third.']] }
  ]
}

const opts = { maxChars: 300, verseNumbers: false, label: 'BKR' }

describe('getVerses', () => {
  it('returns a single verse', () => {
    expect(getVerses(data, { book: 'JHN', chapter: 3, verseStart: 16 })).toEqual([
      { chapter: 3, verse: 16, text: 'Text 3:16.' }
    ])
  })

  it('returns a verse range', () => {
    const verses = getVerses(data, { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 })
    expect(verses.map((v) => v.verse)).toEqual([16, 17, 18])
  })

  it('returns the whole chapter when no verse is given', () => {
    const verses = getVerses(data, { book: 'PSA', chapter: 23 })
    expect(verses).toHaveLength(6)
    expect(verses[0]).toEqual({ chapter: 23, verse: 1, text: 'Text 23:1.' })
  })

  it('returns whole chapters for a chapter range', () => {
    const verses = getVerses(data, { book: 'JHN', chapter: 3, chapterEnd: 4 })
    expect(verses).toHaveLength(36 + 54)
  })

  it('crosses chapter boundaries', () => {
    const verses = getVerses(data, { book: 'JHN', chapter: 3, verseStart: 35, chapterEnd: 4, verseEnd: 2 })
    expect(verses.map((v) => `${v.chapter}:${v.verse}`)).toEqual(['3:35', '3:36', '4:1', '4:2'])
  })

  it('clamps to the verses that exist', () => {
    const verses = getVerses(data, { book: 'JHN', chapter: 3, verseStart: 35, verseEnd: 99 })
    expect(verses.map((v) => v.verse)).toEqual([35, 36])
    expect(getVerses(data, { book: 'JHN', chapter: 4, verseStart: 60 })).toEqual([])
    const tail = getVerses(data, { book: 'JHN', chapter: 4, verseStart: 53, chapterEnd: 9, verseEnd: 1 })
    expect(tail.map((v) => `${v.chapter}:${v.verse}`)).toEqual(['4:53', '4:54'])
  })

  it('returns an empty array when the book or chapter is missing', () => {
    expect(getVerses(data, { book: 'GEN', chapter: 1 })).toEqual([])
    expect(getVerses(data, { book: 'JHN', chapter: 21 })).toEqual([])
    expect(getVerses(data, { book: 'ROM', chapter: 1 })).toEqual([])
  })

  it('skips verses the translation does not have', () => {
    const verses = getVerses(data, { book: 'ROM', chapter: 2 })
    expect(verses).toEqual([
      { chapter: 2, verse: 1, text: 'First.' },
      { chapter: 2, verse: 3, text: 'Third.' }
    ])
  })
})

describe('passageToSlides', () => {
  const john316: PassageVerse[] = [
    {
      chapter: 3,
      verse: 16,
      text: 'Nebo tak Bůh miloval svět, že Syna svého jednorozeného dal, aby každý, kdož věří v něho, nezahynul, ale měl život věčný.'
    }
  ]

  it('creates one bible slide with the reference and translation in the footer', () => {
    const slides = passageToSlides(john316, { book: 'JHN', chapter: 3, verseStart: 16 }, opts)
    expect(slides).toEqual([
      {
        id: 'bible#0',
        kind: 'bible',
        lines: [john316[0]!.text],
        verses: [{ text: john316[0]!.text }],
        footer: 'Jan 3,16 (BKR)'
      }
    ])
  })

  it('formats the footer in English when asked', () => {
    const slides = passageToSlides(
      john316,
      { book: 'JHN', chapter: 3, verseStart: 16 },
      { ...opts, label: 'KJV', lang: 'en' }
    )
    expect(slides[0]!.footer).toBe('John 3:16 (KJV)')
  })

  it('omits the brackets when the label is empty', () => {
    const slides = passageToSlides(
      john316,
      { book: 'JHN', chapter: 3, verseStart: 16 },
      { ...opts, label: '' }
    )
    expect(slides[0]!.footer).toBe('Jan 3,16')
  })

  it('joins several short verses into one paragraph', () => {
    const ref = { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 18 }
    const slides = passageToSlides(getVerses(data, ref), ref, opts)
    expect(slides).toHaveLength(1)
    expect(slides[0]!.lines).toEqual(['Text 3:16. Text 3:17. Text 3:18.'])
    expect(slides[0]!.footer).toBe('Jan 3,16–18 (BKR)')
  })

  it('prefixes verse numbers when asked', () => {
    const ref = { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 17 }
    const slides = passageToSlides(getVerses(data, ref), ref, { ...opts, verseNumbers: true })
    expect(slides[0]!.lines).toEqual(['16 Text 3:16. 17 Text 3:17.'])
  })

  it('uses chapter:verse numbers when the passage spans chapters', () => {
    const ref = { book: 'JHN', chapter: 3, verseStart: 36, chapterEnd: 4, verseEnd: 1 }
    const slides = passageToSlides(getVerses(data, ref), ref, { ...opts, verseNumbers: true })
    expect(slides[0]!.lines).toEqual(['3,36 Text 3:36. 4,1 Text 4:1.'])
    expect(slides[0]!.footer).toBe('Jan 3,36–4,1 (BKR)')
    const en = passageToSlides(getVerses(data, ref), ref, { ...opts, verseNumbers: true, lang: 'en' })
    expect(en[0]!.lines).toEqual(['3:36 Text 3:36. 4:1 Text 4:1.'])
  })

  it('keeps verse numbers apart from the text for typesetting', () => {
    const ref = { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 17 }
    const slides = passageToSlides(getVerses(data, ref), ref, { ...opts, verseNumbers: true })
    expect(slides[0]!.verses).toEqual([
      { number: '16', text: 'Text 3:16.' },
      { number: '17', text: 'Text 3:17.' }
    ])
    const plain = passageToSlides(getVerses(data, ref), ref, opts)
    expect(plain[0]!.verses).toEqual([{ text: 'Text 3:16.' }, { text: 'Text 3:17.' }])
  })

  it('numbers only the first piece of a verse split across slides', () => {
    const ref = { book: 'JHN', chapter: 3, verseStart: 16 }
    const verses = [
      { chapter: 3, verse: 16, text: 'Prvni veta je tady. Druha veta je tady. Treti veta je tady.' }
    ]
    const slides = passageToSlides(verses, ref, { ...opts, verseNumbers: true, maxChars: 25 })
    expect(slides.length).toBeGreaterThan(1)
    expect(slides[0]!.verses?.[0]).toEqual({ number: '16', text: 'Prvni veta je tady.' })
    expect(slides[1]!.verses?.[0]?.number).toBeUndefined()
  })

  it('keeps the chapter-only reference when a whole chapter fits on one slide', () => {
    const ref = { book: 'PSA', chapter: 23 }
    const slides = passageToSlides(getVerses(data, ref), ref, opts)
    expect(slides).toHaveLength(1)
    expect(slides[0]!.footer).toBe('Žalmy 23 (BKR)')
  })

  it('splits a long passage into slides of whole verses within maxChars', () => {
    const ref = { book: 'JHN', chapter: 3 }
    const verses = getVerses(data, ref)
    const slides = passageToSlides(verses, ref, { ...opts, maxChars: 50, verseNumbers: true })
    expect(slides.length).toBeGreaterThan(5)
    for (const slide of slides) {
      expect(slide.kind).toBe('bible')
      expect(slide.lines).toHaveLength(1)
      expect(slide.lines[0]!.length).toBeLessThanOrEqual(50)
    }
    expect(slides.map((s) => s.id)).toEqual(slides.map((_, i) => `bible#${i}`))
    // greedy: "1 Text 3:1. 2 Text 3:2. 3 Text 3:3. 4 Text 3:4." has 47 characters
    expect(slides[0]!.lines[0]).toBe('1 Text 3:1. 2 Text 3:2. 3 Text 3:3. 4 Text 3:4.')
    expect(slides[0]!.footer).toBe('Jan 3,1–4 (BKR)')
    expect(slides.at(-1)!.footer).toBe('Jan 3,36 (BKR)')
    expect(slides.at(-2)!.footer).toBe('Jan 3,33–35 (BKR)')
    // nothing is lost or duplicated
    const all = slides.map((s) => s.lines[0]).join(' ')
    expect(all).toBe(verses.map((v) => `${v.verse} ${v.text}`).join(' '))
  })

  it('splits a verse longer than the limit at sentence boundaries', () => {
    const verses: PassageVerse[] = [
      {
        chapter: 3,
        verse: 16,
        text: 'First sentence is here. Second one is here too! Is this the third one?'
      }
    ]
    const slides = passageToSlides(
      verses,
      { book: 'JHN', chapter: 3, verseStart: 16 },
      { ...opts, maxChars: 30 }
    )
    expect(slides.map((s) => s.lines[0])).toEqual([
      'First sentence is here.',
      'Second one is here too!',
      'Is this the third one?'
    ])
    expect(slides.map((s) => s.footer)).toEqual(['Jan 3,16 (BKR)', 'Jan 3,16 (BKR)', 'Jan 3,16 (BKR)'])
  })

  it('packs several short sentences of a long verse together', () => {
    const verses: PassageVerse[] = [{ chapter: 1, verse: 1, text: 'One. Two. Three. Four. Five. Six.' }]
    const slides = passageToSlides(
      verses,
      { book: 'GEN', chapter: 1, verseStart: 1 },
      { ...opts, maxChars: 20 }
    )
    expect(slides.map((s) => s.lines[0])).toEqual(['One. Two. Three.', 'Four. Five. Six.'])
  })

  it('treats semicolons as sentence boundaries', () => {
    const verses: PassageVerse[] = [{ chapter: 1, verse: 1, text: 'Alpha beta gamma; delta epsilon zeta.' }]
    const slides = passageToSlides(
      verses,
      { book: 'GEN', chapter: 1, verseStart: 1 },
      { ...opts, maxChars: 25 }
    )
    expect(slides.map((s) => s.lines[0])).toEqual(['Alpha beta gamma;', 'delta epsilon zeta.'])
  })

  it('falls back to commas and then spaces for very long sentences', () => {
    const verses: PassageVerse[] = [
      { chapter: 1, verse: 1, text: 'aaaa bbbb cccc, dddd eeee ffff, gggg hhhh iiii jjjj kkkk llll mmmm.' }
    ]
    const slides = passageToSlides(
      verses,
      { book: 'GEN', chapter: 1, verseStart: 1 },
      { ...opts, maxChars: 20 }
    )
    const lines = slides.map((s) => s.lines[0]!)
    expect(lines.slice(0, 2)).toEqual(['aaaa bbbb cccc,', 'dddd eeee ffff,'])
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20)
    expect(lines.join(' ')).toBe(verses[0]!.text)
  })

  it('cuts a single word longer than the limit instead of looping forever', () => {
    const verses: PassageVerse[] = [{ chapter: 1, verse: 1, text: 'x'.repeat(45) }]
    const slides = passageToSlides(
      verses,
      { book: 'GEN', chapter: 1, verseStart: 1 },
      { ...opts, maxChars: 20 }
    )
    expect(slides.map((s) => s.lines[0]!.length)).toEqual([20, 20, 5])
  })

  it('includes the verse number in the length of a split verse', () => {
    const verses: PassageVerse[] = [
      { chapter: 3, verse: 16, text: 'First sentence is here. Second one is here too!' },
      { chapter: 3, verse: 17, text: 'Short.' }
    ]
    const ref = { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 17 }
    const slides = passageToSlides(verses, ref, { ...opts, maxChars: 30, verseNumbers: true })
    expect(slides.map((s) => s.lines[0])).toEqual([
      '16 First sentence is here.',
      'Second one is here too!',
      '17 Short.'
    ])
    expect(slides.map((s) => s.footer)).toEqual(['Jan 3,16 (BKR)', 'Jan 3,16 (BKR)', 'Jan 3,17 (BKR)'])
  })

  it('returns no slides for no verses', () => {
    expect(passageToSlides([], { book: 'JHN', chapter: 3 }, opts)).toEqual([])
  })
})
