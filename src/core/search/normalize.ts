import { stripDiacritics } from '../util/text'

/** Search folding: NFC, diacritics removed, lowercase ("Žehnej" and "zehnej" both → "zehnej"). */
export function fold(s: string): string {
  return stripDiacritics(s.normalize('NFC')).toLowerCase()
}
