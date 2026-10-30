import { czechNoBreaks, expandTabs, normalizeInputText } from './text'

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

describe('czechNoBreaks', () => {
  const NBSP = ' '
  it('keeps one-letter prepositions and conjunctions with the next word', () => {
    expect(czechNoBreaks('pase mne, k vodám tichým')).toBe(`pase mne, k${NBSP}vodám tichým`)
    expect(czechNoBreaks('V počátku a v Bohu i s námi')).toBe(
      `V${NBSP}počátku a${NBSP}v${NBSP}Bohu i${NBSP}s${NBSP}námi`
    )
    expect(czechNoBreaks('(z nebe) u nás o nás')).toBe(`(z${NBSP}nebe) u${NBSP}nás o${NBSP}nás`)
  })

  it('leaves other words and the last word alone', () => {
    expect(czechNoBreaks('Hospodin jest můj pastýř')).toBe('Hospodin jest můj pastýř')
    expect(czechNoBreaks('to je k')).toBe('to je k')
  })

  it('can also glue the last two words so the last line is never a single word', () => {
    expect(czechNoBreaks('pro jméno své.', { lastWord: true })).toBe(`pro jméno${NBSP}své.`)
    expect(czechNoBreaks('slovo', { lastWord: true })).toBe('slovo')
  })
})
