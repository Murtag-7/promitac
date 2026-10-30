import { fold } from './normalize'

describe('fold', () => {
  it('lowercases and strips Czech diacritics', () => {
    expect(fold('Žehnej, duše má')).toBe('zehnej, duse ma')
    expect(fold('PŘÍLIŠ ŽLUŤOUČKÝ KŮŇ ÚPĚL ĎÁBELSKÉ ÓDY')).toBe('prilis zlutoucky kun upel dabelske ody')
  })
  it('gives the same result for NFC and NFD input', () => {
    const nfc = 'Hospodine, smiluj se'
    expect(fold(nfc.normalize('NFD'))).toBe(fold(nfc))
    expect(fold('Žehnej'.normalize('NFD'))).toBe('zehnej')
  })
  it('leaves plain ASCII alone apart from case', () => {
    expect(fold('Amazing Grace')).toBe('amazing grace')
    expect(fold('')).toBe('')
  })
})
