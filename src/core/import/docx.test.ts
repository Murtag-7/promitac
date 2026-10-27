import { docxRawToText } from './docx'

describe('docxRawToText', () => {
  it('turns mammoth paragraphs (each followed by a blank line) into one line each', () => {
    expect(docxRawToText('Název\n\nPrvní řádek\n\nDruhý řádek\n\n')).toBe('Název\nPrvní řádek\nDruhý řádek')
  })

  it('keeps empty paragraphs as blank lines', () => {
    expect(docxRawToText('Název\n\n\n\nSloka jedna\n\n\n\nSloka dva\n\n')).toBe(
      'Název\n\nSloka jedna\n\nSloka dva'
    )
  })

  it('keeps leading and inner spaces so chord columns survive', () => {
    const raw = '   G       D\n\n1. Text první sloky\n\n'
    expect(docxRawToText(raw)).toBe('   G       D\n1. Text první sloky')
  })

  it('keeps tabs and drops trailing whitespace', () => {
    expect(docxRawToText('Předehra:\tG  C   \n\nText\t\n\n')).toBe('Předehra:\tG  C\nText')
  })

  it('keeps soft line breaks inside a paragraph', () => {
    expect(docxRawToText('Řádek jedna\nŘádek dva\n\nDalší\n\n')).toBe('Řádek jedna\nŘádek dva\nDalší')
  })

  it('normalises exotic spaces, CRLF and decomposed diacritics', () => {
    const raw = '\uFEFFG\u00A0\u00A0D\r\n\r\nZe\u0301me\u030C\r\n\r\n'
    expect(docxRawToText(raw)).toBe('G  D\nZémě')
  })

  it('drops leading and trailing empty paragraphs', () => {
    expect(docxRawToText('\n\n\n\nText\n\n\n\n\n\n')).toBe('Text')
  })

  it('returns an empty string for an empty document', () => {
    expect(docxRawToText('')).toBe('')
  })
})
