import { directiveToSectionType, nextSectionId, SECTION_PREFIX, sectionTypeFromId } from './sections'
import { SECTION_TYPES } from './model'

describe('SECTION_PREFIX', () => {
  it('has a unique prefix for every section type', () => {
    const prefixes = SECTION_TYPES.map((t) => SECTION_PREFIX[t])
    expect(new Set(prefixes).size).toBe(SECTION_TYPES.length)
    expect(SECTION_PREFIX.verse).toBe('V')
    expect(SECTION_PREFIX.chorus).toBe('C')
    expect(SECTION_PREFIX.prechorus).toBe('P')
    expect(SECTION_PREFIX.bridge).toBe('B')
    expect(SECTION_PREFIX.interlude).toBe('M')
  })
})

describe('nextSectionId', () => {
  it('numbers verses from 1 using the first free number', () => {
    expect(nextSectionId('verse', [])).toBe('V1')
    expect(nextSectionId('verse', ['V1', 'C'])).toBe('V2')
    expect(nextSectionId('verse', ['V1', 'V3'])).toBe('V2')
  })
  it('uses a bare prefix first for other types', () => {
    expect(nextSectionId('chorus', [])).toBe('C')
    expect(nextSectionId('chorus', ['C'])).toBe('C2')
    expect(nextSectionId('chorus', ['C', 'C2'])).toBe('C3')
    expect(nextSectionId('bridge', ['C'])).toBe('B')
    expect(nextSectionId('prechorus', [])).toBe('P')
    expect(nextSectionId('intro', [])).toBe('I')
    expect(nextSectionId('interlude', [])).toBe('M')
    expect(nextSectionId('outro', [])).toBe('O')
    expect(nextSectionId('tag', [])).toBe('T')
    expect(nextSectionId('ending', ['E'])).toBe('E2')
  })
})

describe('sectionTypeFromId', () => {
  it('maps ids to types by prefix', () => {
    expect(sectionTypeFromId('V3')).toBe('verse')
    expect(sectionTypeFromId('C2')).toBe('chorus')
    expect(sectionTypeFromId('C')).toBe('chorus')
    expect(sectionTypeFromId('M')).toBe('interlude')
    expect(sectionTypeFromId('B')).toBe('bridge')
    expect(sectionTypeFromId('P1')).toBe('prechorus')
  })
  it('returns null for unknown ids', () => {
    expect(sectionTypeFromId('X')).toBeNull()
    expect(sectionTypeFromId('')).toBeNull()
    expect(sectionTypeFromId('V1a')).toBeNull()
  })
})

describe('directiveToSectionType', () => {
  it('understands long and short environment names', () => {
    expect(directiveToSectionType('verse')).toBe('verse')
    expect(directiveToSectionType('sov')).toBe('verse')
    expect(directiveToSectionType('chorus')).toBe('chorus')
    expect(directiveToSectionType('soc')).toBe('chorus')
    expect(directiveToSectionType('bridge')).toBe('bridge')
    expect(directiveToSectionType('sob')).toBe('bridge')
    expect(directiveToSectionType('prechorus')).toBe('prechorus')
    expect(directiveToSectionType('pre_chorus')).toBe('prechorus')
    expect(directiveToSectionType('pre-chorus')).toBe('prechorus')
    expect(directiveToSectionType('intro')).toBe('intro')
    expect(directiveToSectionType('interlude')).toBe('interlude')
    expect(directiveToSectionType('outro')).toBe('outro')
    expect(directiveToSectionType('tag')).toBe('tag')
    expect(directiveToSectionType('ending')).toBe('ending')
  })
  it('is case-insensitive', () => {
    expect(directiveToSectionType('Chorus')).toBe('chorus')
  })
  it('returns null for non-lyric environments', () => {
    expect(directiveToSectionType('tab')).toBeNull()
    expect(directiveToSectionType('grid')).toBeNull()
    expect(directiveToSectionType('abc')).toBeNull()
  })
})
