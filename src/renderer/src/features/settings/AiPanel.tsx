import { useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/ui/tooltip'
import { cs } from '@/i18n/cs'
import { cn } from '@/lib/cn'
import { useSettings } from '@/store/settings'
import { SettingsGroup, SettingsPage, SettingsRow } from './layout'

const t = cs.settings.ai
const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'
const MIN_KEY_LENGTH = 20

/** Only the last 4 characters are ever shown. */
function maskKey(key: string): string {
  const tail = key.slice(-4)
  return `${'•'.repeat(Math.max(4, Math.min(12, key.length - 4)))}${tail}`
}

export function AiPanel() {
  const stored = useSettings((s) => s.settings.aiApiKey)
  const [draft, setDraft] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hasKey = Boolean(stored)

  const saveKey = async (): Promise<void> => {
    const key = draft.trim()
    if (key.length < MIN_KEY_LENGTH || /\s/.test(key)) {
      setError(t.tooShort)
      return
    }
    setBusy(true)
    try {
      await useSettings.getState().update({ aiApiKey: key, aiProvider: 'gemini' })
      setDraft('')
      setVisible(false)
      setError(null)
      toast.success(t.keySaved)
    } catch {
      toast.error(cs.common.error)
    } finally {
      setBusy(false)
    }
  }

  const removeKey = async (): Promise<void> => {
    setBusy(true)
    try {
      await useSettings.getState().update({ aiApiKey: undefined, aiProvider: undefined })
      toast.success(t.removed)
    } catch {
      toast.error(cs.common.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsPage title={t.title} hint={t.hint}>
      <SettingsGroup>
        <SettingsRow label={t.status} hint={hasKey && stored ? t.storedKey(maskKey(stored)) : undefined}>
          <span className="flex items-center gap-2 text-body text-ink-2" data-testid="ai-status">
            <span aria-hidden className={cn('size-2 rounded-full', hasKey ? 'bg-light' : 'bg-ink-3/60')} />
            {hasKey ? t.statusOn : t.statusOff}
          </span>
          {hasKey ? (
            <Button variant="danger" size="sm" onClick={() => void removeKey()} disabled={busy}>
              <Trash2 aria-hidden />
              {t.remove}
            </Button>
          ) : null}
        </SettingsRow>
        <form
          className="flex flex-col gap-2 px-4 py-3.5"
          onSubmit={(e) => {
            e.preventDefault()
            void saveKey()
          }}
        >
          <div className="flex min-h-8 items-center justify-between gap-4">
            <label htmlFor="ai-key" className="text-body font-[550] text-ink">
              {hasKey ? t.replaceKey : t.key}
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="-mr-3"
              onClick={() => void api().app.openExternal(AI_STUDIO_URL)}
            >
              {t.getKey}
              <ExternalLink aria-hidden />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id="ai-key"
                type={visible ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder={t.keyPlaceholder}
                value={draft}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'ai-key-error' : 'ai-key-privacy'}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (error) setError(null)
                }}
                className={cn(
                  'pr-10 text-small',
                  draft && 'font-mono',
                  error && 'ring-danger/70 hover:ring-danger'
                )}
              />
              <Tip label={visible ? t.hide : t.show}>
                <button
                  type="button"
                  aria-label={visible ? t.hide : t.show}
                  aria-pressed={visible}
                  onClick={() => setVisible((v) => !v)}
                  className="press absolute right-0.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-ink-2 hover:bg-raised-2 hover:text-ink"
                >
                  {visible ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </Tip>
            </div>
            <Button type="submit" variant="primary" disabled={busy || draft.trim() === ''}>
              <KeyRound aria-hidden />
              {cs.common.save}
            </Button>
          </div>
          {error ? (
            <p id="ai-key-error" role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
          <p id="ai-key-privacy" className="text-small text-ink-2">
            {t.privacy}
          </p>
        </form>
      </SettingsGroup>
    </SettingsPage>
  )
}
