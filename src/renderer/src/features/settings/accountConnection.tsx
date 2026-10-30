import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cs } from '@/i18n/cs'
import { useSettings } from '@/store/settings'
import { InlineError } from './accountUi'
import { encodeConnectionCode } from './connectionCode'

const s = cs.sync

/**
 * The one line an administrator sends to the other projection computers: project address, public
 * key and (when in a church) the invite code. Hidden when the connection is built into the app.
 */
export function ShareCodeRow({ invite, builtIn }: { invite?: string | null; builtIn: boolean }) {
  const config = useSettings((st) => st.settings.supabase)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  if (builtIn || !config?.url || !config.anonKey) return null
  const code = encodeConnectionCode({ url: config.url, anonKey: config.anonKey, invite: invite ?? undefined })

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopyError(false)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="text-body font-[550] text-ink">{s.shareCodeTitle}</div>
          <div className="mt-0.5 text-small text-ink-2 [text-wrap:pretty]">
            {invite ? s.shareCodeHint : s.shareCodeHintNoOrg}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="selectable min-w-0 max-w-56 truncate rounded-control bg-raised px-3 py-1.5 font-mono text-small text-ink-2 ring-1 ring-inset ring-line"
            data-testid="connection-code"
            title={code}
          >
            {code}
          </span>
          <Button variant="secondary" onClick={() => void copy()} aria-live="polite">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? s.copied : s.copyConnectionCode}
          </Button>
        </div>
      </div>
      {copyError ? <InlineError>{s.copyFailed}</InlineError> : null}
    </div>
  )
}
