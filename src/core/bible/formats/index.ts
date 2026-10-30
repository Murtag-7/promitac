import type { BibleData } from '../model'
import { BibleFormatError, type BibleFormat } from './common'
import { parseOsis } from './osis'
import { parseUsfx } from './usfx'
import { parseZefania } from './zefania'

export {
  BibleFormatError,
  type BibleFormat,
  type BibleFormatErrorCode,
  type ParseBibleOptions
} from './common'
export { parseOsis, osisBookToUsfm } from './osis'
export { parseUsfx } from './usfx'
export { parseZefania } from './zefania'

/** Detect the Bible XML dialect from the name of the root element (cheap, no full parse). */
export function detectBibleFormat(xml: string): BibleFormat | null {
  let head = xml.slice(0, 64 * 1024)
  if (head.charCodeAt(0) === 0xfeff) head = head.slice(1)
  head = head
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, '')
  const match = /<([A-Za-z_][\w.:-]*)/.exec(head)
  if (!match) return null
  const root = match[1]!.replace(/^.*:/, '').toLowerCase()
  if (root === 'xmlbible') return 'zefania'
  if (root === 'osis' || root === 'osistext') return 'osis'
  if (root === 'usfx') return 'usfx'
  return null
}

/** "C:\Bible\Moje Bible.usfx.xml" → "Moje Bible". */
function nameFromFileName(fileName: string): string {
  let base = fileName.split(/[\\/]/).pop() ?? ''
  while (/\.(xml|usfx|osis|zef|zefania)$/i.test(base)) base = base.replace(/\.[^.]+$/, '')
  return base.trim()
}

/** Parse a Zefania, OSIS or USFX file; the file name is the fallback translation name. */
export function parseBibleXml(fileName: string, xml: string): BibleData {
  const opts = { fallbackName: nameFromFileName(fileName) || undefined }
  switch (detectBibleFormat(xml)) {
    case 'zefania':
      return parseZefania(xml, opts)
    case 'osis':
      return parseOsis(xml, opts)
    case 'usfx':
      return parseUsfx(xml, opts)
    default:
      throw new BibleFormatError('unknown-format', `"${fileName}" is not a Zefania, OSIS or USFX Bible file.`)
  }
}
