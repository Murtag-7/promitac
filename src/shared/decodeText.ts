/**
 * Decode a text file: UTF-8 / UTF-16 with BOM, otherwise strict UTF-8, falling back to
 * Windows-1250 (older Czech files from Windows Notepad, Word "plain text" or old songbook tools).
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1250').decode(bytes)
  }
}
