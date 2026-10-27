/**
 * Minimal text-level access to single-line ChordPro directives. Used where a full parse is not
 * needed (storage, sync) so files are rewritten with the smallest possible change.
 */

function directiveRe(name: string, flags = 'im'): RegExp {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `^[ \\t]*\\{[ \\t]*${n}[ \\t]*(?::[ \\t]*|[ \\t]+|(?=\\}))([^}\\n]*?)[ \\t]*\\}[ \\t]*$`,
    flags
  )
}

/** Value of the first `{name: value}` directive, or null. */
export function readDirective(content: string, name: string): string | null {
  const m = directiveRe(name).exec(content)
  return m ? (m[1] ?? '') : null
}

/**
 * Set (replace or insert) a directive. New directives are inserted after the leading block of
 * directives (meta header) so the file stays tidy.
 */
export function setDirective(content: string, name: string, value: string): string {
  const line = `{${name}: ${value}}`
  if (directiveRe(name).test(content)) return content.replace(directiveRe(name), line)
  const lines = content.split('\n')
  let insertAt = 0
  while (
    insertAt < lines.length &&
    /^\s*\{[^}]*\}\s*$/.test(lines[insertAt] ?? '') &&
    !/start_of|^\s*\{so[cvb]\}/i.test(lines[insertAt] ?? '')
  ) {
    insertAt++
  }
  lines.splice(insertAt, 0, line)
  return lines.join('\n')
}

export function removeDirective(content: string, name: string): string {
  return content.replace(new RegExp(directiveRe(name).source + '\\n?', 'gim'), '')
}

/** Title from `{title}` or `{t}`. */
export function readTitle(content: string): string {
  return (readDirective(content, 'title') ?? readDirective(content, 't') ?? '').trim()
}
