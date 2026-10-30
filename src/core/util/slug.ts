import { stripDiacritics } from './text'

/** URL/file friendly slug: lowercase ASCII, dashes, max 80 chars. */
export function slugify(input: string): string {
  const slug = stripDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug || 'bez-nazvu'
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

/** Make a file name safe on Windows, macOS and Linux (keeps diacritics). */
export function safeFileName(input: string): string {
  // eslint-disable-next-line no-control-regex
  let name = input.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim()
  name = name.replace(/[. ]+$/g, '')
  if (!name) return 'soubor'
  if (RESERVED.test(name)) name = `_${name}`
  return name.slice(0, 120)
}
