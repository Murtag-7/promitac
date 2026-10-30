/**
 * Conflict copies of songs: when two computers edited the same song, the losing version is kept
 * as a new song "<title> (konflikt – verze z počítače X)". The ChordPro text is rewritten with
 * plain regular expressions (no parser) so nothing else in the file changes.
 */

const UNKNOWN_COMPUTER = 'neznámý'
const UNTITLED = 'Bez názvu'

export function conflictCopyTitle(title: string, computer: string): string {
  const base = title.trim() || UNTITLED
  const who = computer.trim() || UNKNOWN_COMPUTER
  return `${base} (konflikt – verze z počítače ${who})`
}

/** `{name: value}` on its own line; group 1 = the value. The line ending (\r) is left alone. */
function directiveRe(names: string): RegExp {
  // The name must be followed by ':', whitespace or '}' so `{t:}` does not match `{tags: …}`.
  return new RegExp(
    `^[ \\t]*\\{[ \\t]*(?:${names})(?:[ \\t]*:[ \\t]*|[ \\t]+|(?=\\}))([^}\\r\\n]*?)[ \\t]*\\}[ \\t]*(?=\\r?$)`,
    'im'
  )
}

const TITLE_RE = directiveRe('title|t')
const ID_RE = directiveRe('x_id')
const UPDATED_RE = directiveRe('x_updated')

/** Directive values cannot contain braces or line breaks. */
function directiveValue(value: string): string {
  return value
    .replace(/[{}]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/**
 * Give a song a new identity: set `{title: newTitle}` and `{x_id: newId}` (replacing the first
 * existing directive or inserting it at the top), and `{x_updated: …}` when present and a
 * timestamp is given.
 */
export function renameSongContent(
  content: string,
  newId: string,
  newTitle: string,
  updatedAt?: string
): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const titleLine = `{title: ${directiveValue(newTitle)}}`
  const idLine = `{x_id: ${directiveValue(newId)}}`
  let out = content

  if (TITLE_RE.test(out)) out = out.replace(TITLE_RE, titleLine)
  else out = `${titleLine}${eol}${out}`

  if (ID_RE.test(out)) {
    out = out.replace(ID_RE, idLine)
  } else {
    // Insert right after the (first) title line.
    const m = TITLE_RE.exec(out)
    const end = m ? m.index + m[0].length : 0
    const lineEnd = out.indexOf('\n', end)
    if (lineEnd === -1) out = `${out}${eol}${idLine}`
    else out = `${out.slice(0, lineEnd + 1)}${idLine}${eol}${out.slice(lineEnd + 1)}`
  }

  if (updatedAt !== undefined && UPDATED_RE.test(out)) {
    out = out.replace(UPDATED_RE, `{x_updated: ${directiveValue(updatedAt)}}`)
  }
  return out
}
