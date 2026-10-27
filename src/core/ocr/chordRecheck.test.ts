import type { OcrWord } from '../import/ocrTypes'
import { CHORD_CHAR_WHITELIST, chordRecheckCandidates, recheckChords, recheckRegion } from './chordRecheck'

function w(
  text: string,
  x0: number,
  y0: number,
  opts: { cw?: number; h?: number; conf?: number } = {}
): OcrWord {
  const cw = opts.cw ?? 10
  const h = opts.h ?? 20
  return { text, confidence: opts.conf ?? 90, bbox: { x0, y0, x1: x0 + text.length * cw, y1: y0 + h } }
}

/** Chord-line word 26 px above a lyric line at y. */
const c = (text: string, x0: number, y = 100): OcrWord => w(text, x0, y - 26, { cw: 11, h: 15 })

const lyric = (y = 100): OcrWord[] => [w('Text', 0, y), w('první', 50, y), w('sloky', 110, y)]

describe('chordRecheckCandidates', () => {
  it('picks misread tokens on chord lines ("Cc", "c", "[0")', () => {
    const words = [c('Emi', 0), c('Cc', 120), ...lyric(), c('c', 0, 200), c('D', 90, 200), ...lyric(200)]
    expect(chordRecheckCandidates(words).map((x) => x.text)).toEqual(['Cc', 'c'])
    expect(chordRecheckCandidates([c('G', 0), c('[0', 100), ...lyric()]).map((x) => x.text)).toEqual(['[0'])
  })

  it('checks a lone lowercase chord above the lyrics', () => {
    expect(chordRecheckCandidates([c('c', 30), ...lyric()]).map((x) => x.text)).toEqual(['c'])
  })

  it('never picks valid chords, labels or bar lines', () => {
    const words = [
      w('Předehra:', 0, 74, { h: 15 }),
      c('G', 110),
      c('|', 140),
      c('D', 160),
      c('Ami7', 200),
      ...lyric()
    ]
    expect(chordRecheckCandidates(words)).toEqual([])
  })

  it('never picks words of lyric lines', () => {
    const words = [
      ...[w('A', 0, 100), w('je', 20, 100), w('to', 50, 100), w('tak', 80, 100)],
      w('Amen.', 0, 140),
      ...[w('Haleluja', 0, 180), w('a', 90, 180)]
    ]
    expect(chordRecheckCandidates(words)).toEqual([])
  })
})

describe('recheckRegion', () => {
  it('pads the word box and clamps it to the image (integer pixels)', () => {
    const r = recheckRegion(w('Cc', 5, 40, { h: 20 }), 100, 55)
    expect(r).toEqual({ x0: 0, y0: 32, x1: 35, y1: 55 })
    const inner = recheckRegion(
      { text: 'G', confidence: 50, bbox: { x0: 50.4, y0: 50.6, x1: 60.2, y1: 70.1 } },
      500,
      500
    )
    expect(Number.isInteger(inner.x0) && Number.isInteger(inner.y1)).toBe(true)
    expect(inner.x0).toBeLessThan(50.4)
    expect(inner.x1).toBeGreaterThan(60.2)
  })

  it('keeps the padding clear of neighbouring words', () => {
    const word = w('c', 100, 40, { h: 20 })
    const r = recheckRegion(word, 500, 500, [w('Emi', 60, 40, { h: 20 }), w('D', 116, 40, { h: 20 })])
    // Neighbours end at 90 and start at 116: at most half of each gap is used.
    expect(r.x0).toBe(95)
    expect(r.x1).toBe(113)
  })
})

describe('recheckChords', () => {
  const SIZE = { width: 1000, height: 1000 }

  it('passes the padded region of each word to the reader', async () => {
    const regions: unknown[] = []
    await recheckChords([c('c', 30), ...lyric()], SIZE, async (word, region) => {
      regions.push(region)
      return null
    })
    expect(regions).toEqual([recheckRegion(c('c', 30), 1000, 1000)])
  })

  it('replaces a misread token only when the re-read is a valid chord', async () => {
    const words = [c('Emi', 0), c('Cc', 120), ...lyric(), c('c', 0, 200), c('D', 90, 200), ...lyric(200)]
    const seen: string[] = []
    const out = await recheckChords(words, SIZE, async (word) => {
      seen.push(word.text)
      return word.text === 'Cc' ? { text: 'C', confidence: 88 } : { text: 'aa', confidence: 90 }
    })
    expect(seen).toEqual(['Cc', 'c'])
    expect(out.map((x) => x.text)).toEqual(words.map((x) => (x.text === 'Cc' ? 'C' : x.text)))
    const fixed = out.find((x) => x.text === 'C')!
    expect(fixed.confidence).toBe(88)
    expect(fixed.bbox).toEqual(words[1]!.bbox)
    expect(fixed.symbols).toBeUndefined()
  })

  it('keeps the word when the re-read fails', async () => {
    const words = [c('c', 30), ...lyric()]
    const out = await recheckChords(words, SIZE, async () => null)
    expect(out).toEqual(words)
  })

  it('does not call the reader when nothing needs checking', async () => {
    let calls = 0
    await recheckChords([c('G', 0), ...lyric()], SIZE, async () => {
      calls++
      return null
    })
    expect(calls).toBe(0)
  })
})

describe('CHORD_CHAR_WHITELIST', () => {
  it('covers chord spellings but not the lowercase "c" that OCR confuses with "C"', () => {
    for (const ch of 'ABCDEFGHmiajsu#b/7') expect(CHORD_CHAR_WHITELIST).toContain(ch)
    expect(CHORD_CHAR_WHITELIST).not.toContain('c')
  })
})

describe('chordRecheckCandidates on misread suffixes', () => {
  it('re-reads a word-like misread between real chords ("G Arni D")', () => {
    const words = [c('G', 0), c('Arni', 70), c('D', 150), ...lyric()]
    expect(chordRecheckCandidates(words).map((x) => x.text)).toEqual(['Arni'])
  })
})
