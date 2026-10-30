import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BibleFormatError, detectBibleFormat, parseBibleXml } from './index'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/bible/${name}`, import.meta.url)), 'utf8')

describe('detectBibleFormat', () => {
  it.each([
    ['zefania-kjv.xml', 'zefania'],
    ['osis-kjv.xml', 'osis'],
    ['osis-milestone-bkr.xml', 'osis'],
    ['usfx-bkr.xml', 'usfx']
  ])('detects %s as %s', (file, format) => {
    expect(detectBibleFormat(fixture(file))).toBe(format)
  })

  it('looks past the BOM, declaration, comments and doctype', () => {
    const xml = `${String.fromCharCode(0xfeff)}<?xml version="1.0"?>\n<!-- comment <osis> -->\n<!DOCTYPE XMLBIBLE>\n<XMLBIBLE/>`
    expect(detectBibleFormat(xml)).toBe('zefania')
    expect(detectBibleFormat('<osis:osis xmlns:osis="x"/>')).toBe('osis')
  })

  it('returns null for anything else', () => {
    expect(detectBibleFormat('')).toBeNull()
    expect(detectBibleFormat('hello')).toBeNull()
    expect(detectBibleFormat('<html><body/></html>')).toBeNull()
  })
})

describe('parseBibleXml', () => {
  it('dispatches to the right parser', () => {
    expect(parseBibleXml('kjv.xml', fixture('zefania-kjv.xml')).name).toBe('King James Version')
    expect(parseBibleXml('kjv.osis.xml', fixture('osis-kjv.xml')).id).toBe('en-kjv')
    expect(parseBibleXml('bkr.xml', fixture('usfx-bkr.xml')).language).toBe('cs')
  })

  it('uses the file name when the file has no title', () => {
    const xml = '<usfx><book id="GEN"><c id="1"/><v id="1"/>Na počátku.<ve/></book></usfx>'
    const data = parseBibleXml('C:\\Bible\\Moje Bible.usfx.xml', xml)
    expect(data.name).toBe('Moje Bible')
    expect(data.abbreviation).toBe('MB')
  })

  it('rejects unknown formats with a descriptive error', () => {
    expect(() => parseBibleXml('page.html', '<html/>')).toThrow(BibleFormatError)
    expect(() => parseBibleXml('page.html', '<html/>')).toThrow(
      expect.objectContaining({ code: 'unknown-format' })
    )
  })
})
