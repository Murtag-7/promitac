import { conflictCopyTitle, renameSongContent } from './songConflict'

describe('renameSongContent', () => {
  it('replaces an existing title and x_id directive', () => {
    const content =
      '{title: Milost}\n{key: G}\n{x_id: old-id}\n\n{start_of_verse: V1}\n[G]Text\n{end_of_verse}'
    const out = renameSongContent(content, 'new-id', 'Milost (kopie)')
    expect(out).toBe(
      '{title: Milost (kopie)}\n{key: G}\n{x_id: new-id}\n\n{start_of_verse: V1}\n[G]Text\n{end_of_verse}'
    )
  })

  it('accepts the short {t:} form and directives without a space after the colon', () => {
    const out = renameSongContent('{t:Old}\n{x_id:abc}\nText', 'n1', 'New')
    expect(out).toBe('{title: New}\n{x_id: n1}\nText')
  })

  it('tolerates whitespace and Windows line endings around directives', () => {
    const out = renameSongContent('  { title :  Old  }\r\n{ x_id : abc }\r\nText', 'n1', 'New')
    expect(out).toBe('{title: New}\r\n{x_id: n1}\r\nText')
  })

  it('inserts title and x_id at the top when missing', () => {
    expect(renameSongContent('[C]Jen text', 'n2', 'Bez názvu')).toBe(
      '{title: Bez názvu}\n{x_id: n2}\n[C]Jen text'
    )
  })

  it('inserts x_id right after the title line when only x_id is missing', () => {
    expect(renameSongContent('{title: A}\n{key: D}\nText', 'n3', 'B')).toBe(
      '{title: B}\n{x_id: n3}\n{key: D}\nText'
    )
  })

  it('only rewrites the first title directive and leaves lyrics untouched', () => {
    const content = '{title: A}\n{subtitle: title: nope}\n[G]title: lyrics stay\n{title: Second}'
    expect(renameSongContent(content, 'n4', 'B')).toBe(
      '{title: B}\n{x_id: n4}\n{subtitle: title: nope}\n[G]title: lyrics stay\n{title: Second}'
    )
  })

  it('updates x_updated when a timestamp is given and the directive exists', () => {
    const content = '{title: A}\n{x_id: a}\n{x_updated: 2026-01-01T00:00:00.000Z}\nText'
    expect(renameSongContent(content, 'b', 'B', '2026-10-27T10:00:00.000Z')).toBe(
      '{title: B}\n{x_id: b}\n{x_updated: 2026-10-27T10:00:00.000Z}\nText'
    )
  })

  it('strips braces and line breaks from the new title so the directive stays valid', () => {
    expect(renameSongContent('{title: A}', 'x', 'Na{z}ev\nnový')).toBe('{title: Nazev nový}\n{x_id: x}')
  })

  it('handles empty content', () => {
    expect(renameSongContent('', 'x', 'T')).toBe('{title: T}\n{x_id: x}\n')
  })
})

describe('conflictCopyTitle', () => {
  it('adds the conflict suffix with the computer name', () => {
    expect(conflictCopyTitle('Milost', 'Kancelář')).toBe('Milost (konflikt – verze z počítače Kancelář)')
  })

  it('uses a placeholder for unknown computers and untitled songs', () => {
    expect(conflictCopyTitle('', '')).toBe('Bez názvu (konflikt – verze z počítače neznámý)')
    expect(conflictCopyTitle('  A  ', '  ')).toBe('A (konflikt – verze z počítače neznámý)')
  })
})

describe('renameSongContent – directive names', () => {
  it('does not mistake {tags}, {time} or {tempo} for the short {t} title', () => {
    const out = renameSongContent('{tags: chvály}\n{time: 3/4}\n{tempo: 90}\nText', 'n5', 'Nová')
    expect(out).toBe('{title: Nová}\n{x_id: n5}\n{tags: chvály}\n{time: 3/4}\n{tempo: 90}\nText')
  })

  it('handles a value-less {title}', () => {
    expect(renameSongContent('{title}\nText', 'n6', 'X')).toBe('{title: X}\n{x_id: n6}\nText')
  })
})
