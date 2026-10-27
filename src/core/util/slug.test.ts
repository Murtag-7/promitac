import { safeFileName, slugify } from './slug'

describe('slugify', () => {
  it('folds Czech diacritics and punctuation', () => {
    expect(slugify('Žehnej, duše má?')).toBe('zehnej-duse-ma')
    expect(slugify('  Příliš žluťoučký kůň  ')).toBe('prilis-zlutoucky-kun')
  })
  it('falls back for empty input', () => {
    expect(slugify('???')).toBe('bez-nazvu')
  })
  it('limits the length', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(80)
  })
})

describe('safeFileName', () => {
  it('removes characters forbidden on Windows', () => {
    expect(safeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('abcdefghij')
  })
  it('avoids reserved Windows names', () => {
    expect(safeFileName('CON')).toBe('_CON')
    expect(safeFileName('nul')).toBe('_nul')
  })
  it('never returns an empty name', () => {
    expect(safeFileName('???')).toBe('soubor')
  })
})
