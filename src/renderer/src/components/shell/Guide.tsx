import { Marked } from 'marked'
import { useMemo } from 'react'
import guideSource from '../../../../../docs/NAVOD.md?raw'
import { api } from '@/api/client'

const marked = new Marked({
  gfm: true,
  renderer: {
    // Links to other repository documents make no sense inside the app – keep their text only.
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens)
      return /^https?:\/\//.test(href) ? `<a href="${href}">${text}</a>` : text
    }
  }
})

/** The full operator guide (docs/NAVOD.md), bundled at build time so it works offline. */
export default function Guide() {
  const html = useMemo(() => marked.parse(guideSource, { async: false }), [])
  return (
    <div
      className="guide"
      data-testid="guide"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (!a) return
        e.preventDefault()
        void api().app.openExternal(a.href)
      }}
      // The source is our own documentation shipped with the app, not user input.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
