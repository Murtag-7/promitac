import { expandTabs, normalizeInputText } from './text'

describe('normalizeInputText', () => {
  it('removes BOM, CRLF and non-breaking spaces', () => {
    expect(normalizeInputText('\uFEFFa\r\nb\u00A0c\rd')).toBe('a\nb c\nd')
  })
  it('composes NFD diacritics to NFC', () => {
    const nfd = 'Z\u030Cehnej'
    expect(normalizeInputText(nfd)).toBe('Žehnej')
  })
  it('replaces other exotic spaces and zero-width characters', () => {
    expect(normalizeInputText('a\u2009b\u200Bc\u202Fd')).toBe('a bc d')
  })
})

describe('expandTabs', () => {
  it('expands to the next tab stop', () => {
    expect(expandTabs('a\tb', 8)).toBe('a       b')
    expect(expandTabs('\tx', 4)).toBe('    x')
    expect(expandTabs('abcd\te', 4)).toBe('abcd    e')
  })
})
