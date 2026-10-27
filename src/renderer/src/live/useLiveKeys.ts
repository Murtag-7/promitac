import { useEffect, useRef } from 'react'
import { resolveKey } from '@core/live/keymap'
import { useLive } from '@/store/live'
import { useUi } from '@/store/ui'

const CLICKER_KEYS = new Set(['PageDown', 'PageUp'])

function isTextEntry(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true
  if (tag !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(type)
}

function isInteractive(el: HTMLElement): boolean {
  return Boolean(
    el.closest(
      'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="checkbox"], [role="tab"], [role="slider"], [role="option"], [role="menuitem"], summary'
    )
  )
}

/**
 * Keyboard and presentation-clicker control of the live output, active in the whole app.
 * - PageUp/PageDown (what clickers send) always work on the Živě screen – even while typing an
 *   announcement or with the import panel open. Elsewhere they work only once something is on
 *   screen and not inside a text editor, so PageDown in the song editor still scrolls the editor
 *   and a PageDown while preparing a plan never starts projecting by surprise.
 * - All other keys work on the Živě screen when focus is not in a text field, menu or dialog.
 * - Space/Enter on a focused button press that button instead of advancing.
 */
export function useLiveKeys(): void {
  const pendingTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.defaultPrevented) return
      const target = e.target instanceof HTMLElement ? e.target : document.body
      const live = useLive.getState()
      const onLiveView = useUi.getState().view === 'live'

      if (CLICKER_KEYS.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!onLiveView && (!live.live.itemId || isTextEntry(target))) return
        e.preventDefault()
        live.dispatch({
          type: e.key === 'PageDown' ? (e.shiftKey ? 'nextItem' : 'next') : e.shiftKey ? 'prevItem' : 'prev'
        })
        return
      }

      if (!onLiveView) return
      if (
        isTextEntry(target) ||
        target.closest('[role="dialog"], [role="menu"], [role="listbox"], [role="alertdialog"]')
      )
        return
      if ((e.key === ' ' || e.key === 'Enter') && isInteractive(target)) return
      if (
        e.key.startsWith('Arrow') &&
        target.closest('[role="slider"], [role="radiogroup"], [role="tablist"], [aria-roledescription]')
      )
        return

      const res = resolveKey(
        { key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey },
        live.pending
      )
      if (!res.action && !res.pending && !live.pending) return
      e.preventDefault()
      window.clearTimeout(pendingTimer.current)
      live.setPending(res.pending)
      if (res.pending) {
        pendingTimer.current = window.setTimeout(() => {
          // "V" alone → next verse
          if (useLive.getState().pending === 'v')
            useLive.getState().dispatch({ type: 'gotoSection', sectionType: 'verse' })
          useLive.getState().setPending(null)
        }, 1200)
      }
      if (res.action) live.dispatch(res.action)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(pendingTimer.current)
    }
  }, [])
}
