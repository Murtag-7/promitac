import { normalizeInputText } from '../util/text'

/**
 * Convert mammoth's `extractRawText` output to plain song text, one paragraph per line.
 *
 * mammoth terminates every paragraph with "\n\n" (soft line breaks inside a paragraph are a single
 * "\n"), so an empty paragraph shows up as an extra "\n\n". Leading and inner spaces and tabs are
 * kept – chord lines aligned with spaces must survive; trailing whitespace is dropped.
 */
export function docxRawToText(raw: string): string {
  const text = normalizeInputText(raw)
  const body = text.endsWith('\n\n') ? text.slice(0, -2) : text
  const lines = body
    .split('\n\n')
    .flatMap((paragraph) => paragraph.split('\n'))
    .map((line) => line.trimEnd())
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}
