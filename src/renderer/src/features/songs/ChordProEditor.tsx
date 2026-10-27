import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/** Tokenizer for ChordPro: directives `{…}`, chords `[…]`, `#` comments and section directives. */
const chordPro = StreamLanguage.define<{ inDirective: boolean }>({
  name: 'chordpro',
  startState: () => ({ inDirective: false }),
  token(stream) {
    if (stream.sol() && stream.match(/^\s*#.*/)) return 'comment'
    if (stream.match(/^\{\s*(start_of|end_of|so[cvb]|eo[cvb])[^}]*\}/i)) return 'heading'
    if (stream.match(/^\{\s*(comment|c|ci|cb|highlight)\s*:[^}]*\}/i)) return 'comment'
    if (stream.match(/^\{[^}]*\}?/)) return 'keyword'
    if (stream.match(/^\[[^\]]*\]?/)) return 'atom'
    stream.next()
    while (!stream.eol() && stream.peek() !== '[' && stream.peek() !== '{') stream.next()
    return null
  }
})

const highlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--sec-verse)', fontWeight: '600' },
  { tag: tags.keyword, color: 'var(--ink-2)' },
  { tag: tags.atom, color: 'var(--sec-chorus)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--ink-3)', fontStyle: 'italic' }
])

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: 'var(--ink)'
  },
  '.cm-scroller': {
    fontFamily: "'Inter Variable', system-ui, sans-serif",
    lineHeight: '1.65',
    fontFeatureSettings: "'tnum' 1"
  },
  '.cm-content': { padding: '14px 0', caretColor: 'var(--light)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ink-3)',
    border: 'none',
    fontSize: '12px'
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 12px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--raised) 70%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--light)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--light) 22%, transparent) !important'
  },
  '.cm-placeholder': { color: 'var(--ink-3)' }
})

/**
 * Plain controlled-ish CodeMirror: `value` updates replace the document only when they differ
 * from what the editor already holds (so typing never fights the parent state).
 */
export function ChordProEditor({
  value,
  onChange,
  onSave,
  ariaLabel,
  placeholderText
}: {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  ariaLabel: string
  placeholderText?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          chordPro,
          syntaxHighlighting(highlight),
          theme,
          placeholder(placeholderText ?? ''),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false' }),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                onSaveRef.current?.()
                return true
              }
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Created once; later value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  return <div ref={hostRef} className="selectable h-full min-h-0 overflow-hidden" data-testid="chordpro-editor" />
}
