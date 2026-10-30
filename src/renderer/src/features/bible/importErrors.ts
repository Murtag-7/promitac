import { cs } from '@/i18n/cs'

/**
 * Czech message for a failed translation import. The mock API throws BibleFormatError (with
 * `code`); over Electron IPC only the message survives, so main encodes it as `bible-format/<code>`
 * (see src/main/ipcMediaBible.ts).
 */
export function bibleImportErrorMessage(err: unknown): string | undefined {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
      ? err.code
      : /bible-format\/([a-z-]+)/.exec(err instanceof Error ? err.message : String(err))?.[1]
  return code ? cs.bible.importErrors[code] : undefined
}
