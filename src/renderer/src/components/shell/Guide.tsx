import { Marked } from 'marked'
import { useMemo } from 'react'
import guideSource from '../../../../../docs/NAVOD.md?raw'
import { api } from '@/api/client'

/** Other documents the guide links to (e.g. the detailed guide) open on GitHub in the browser. */
const DOCS_URL = 'https://github.com/Murtag-7/promitac/blob/main/docs/'

const marked = new Marked({
  gfm: true,
  renderer: {
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens)
      if (/^https?:\/\//.test(href)) return `<a href="${href}">${text}</a>`
      if (/^[\w-]+\.md$/.test(href)) return `<a href="${DOCS_URL}${href}">${text}</a>`
      return text
    },
    // The screenshot explains the app to someone reading on GitHub; inside the app it is redundant.
    image() {
      return ''
    }
  }
})

/** The short operator guide (docs/NAVOD.md), bundled at build time so it works offline. */
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
