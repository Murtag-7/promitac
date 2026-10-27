import { glyphWeight, splitByGlyphWidth } from './glyphWidths'

describe('glyphWeight', () => {
  it('ranks narrow < normal < capital < wide letters, diacritics like their base letter', () => {
    expect(glyphWeight('i')).toBeLessThan(glyphWeight('a'))
    expect(glyphWeight('a')).toBeLessThan(glyphWeight('A'))
    expect(glyphWeight('A')).toBeLessThan(glyphWeight('m'))
    expect(glyphWeight('í')).toBe(glyphWeight('i'))
    expect(glyphWeight('Ž')).toBe(glyphWeight('Z'))
  })
})

describe('splitByGlyphWidth', () => {
  it('covers the box exactly with contiguous ranges', () => {
    const r = splitByGlyphWidth('milí', 10, 50)
    expect(r).toHaveLength(4)
    expect(r[0]![0]).toBe(10)
    expect(r[3]![1]).toBe(50)
    for (let i = 1; i < r.length; i++) expect(r[i]![0]).toBeCloseTo(r[i - 1]![1], 9)
    expect(r[0]![1] - r[0]![0]).toBeCloseTo(20, 5)
  })

  it('returns nothing for empty text', () => {
    expect(splitByGlyphWidth('', 0, 10)).toEqual([])
  })
})
