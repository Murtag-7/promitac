/**
 * Word document → mammoth raw text → song text, on a chords-over-text .docx generated with the
 * `docx` package (scripts/render-fixtures.mjs): monospace chord lines aligned with spaces, an
 * intro line with a tab, stanzas separated by empty paragraphs.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import mammoth from 'mammoth'
import { docxRawToText } from './docx'

const DIR = join(resolve(import.meta.dirname, '../../..'), 'tests/fixtures/docx')
const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith('.docx'))
  .map((f) => f.replace(/\.docx$/, ''))

describe('DOCX import', () => {
  it('has fixtures', () => expect(fixtures.length).toBeGreaterThan(0))

  it.each(fixtures)('%s: keeps paragraphs, blank lines, chord columns and tabs', async (name) => {
    const { value } = await mammoth.extractRawText({ path: join(DIR, `${name}.docx`) })
    const expected = readFileSync(join(DIR, `${name}.expected.txt`), 'utf8').replace(/\n$/, '')
    expect(docxRawToText(value)).toBe(expected)
  })
})
