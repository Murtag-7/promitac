/** Remove combining marks after NFD decomposition ("Žehnej" → "Zehnej"). */
export function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/\p{M}+/gu, '')
}

/**
 * Normalise text coming from paste, files, PDF or OCR without changing its content:
 * BOM removed, line endings → \n, exotic spaces → regular space, zero-width chars dropped, NFC.
 */
export function normalizeInputText(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .normalize('NFC')
}

/** Expand tab characters to spaces using fixed tab stops (keeps chord columns aligned). */
export function expandTabs(line: string, tabSize = 8): string {
  if (!line.includes('\t')) return line
  let out = ''
  for (const ch of line) {
    if (ch === '\t') {
      const spaces = tabSize - (out.length % tabSize)
      out += ' '.repeat(spaces)
    } else {
      out += ch
    }
  }
  return out
}

/**
 * Czech typesetting for projected prose: a one-letter preposition or conjunction (k, s, v, z, o, u,
 * a, i) never ends a line, and – with `lastWord` – the last line is never a single word. Only spaces
 * become no-break spaces; the words themselves are untouched.
 */
export function czechNoBreaks(text: string, opts: { lastWord?: boolean } = {}): string {
  let out = text.replace(/(^|[\s(„"'])([ksvzouaiKSVZOUAI]) (?=\S)/gu, '$1$2 ')
  // A second pass catches neighbours like "a v Bohu", where the first match consumed the space.
  out = out.replace(/(^|[\s(„"'])([ksvzouaiKSVZOUAI]) (?=\S)/gu, '$1$2 ')
  if (opts.lastWord) out = out.replace(/ (\S+)\s*$/u, ' $1')
  return out
}
