import { wordsToText } from './layout'
import type { OcrWord } from './ocrTypes'

/** Monospace-like fake word: `cw` px per character (with symbol boxes), `h` px tall. */
function w(
  text: string,
  x0: number,
  y0: number,
  opts: { cw?: number; h?: number; conf?: number; symbols?: boolean } = {}
): OcrWord {
  const cw = opts.cw ?? 10
  const h = opts.h ?? 20
  const word: OcrWord = {
    text,
    confidence: opts.conf ?? 95,
    bbox: { x0, y0, x1: x0 + text.length * cw, y1: y0 + h }
  }
  if (opts.symbols !== false) {
    word.symbols = [...text].map((ch, i) => ({ text: ch, x0: x0 + i * cw, x1: x0 + (i + 1) * cw }))
  }
  return word
}

/** Lay out a sentence starting at x0 with single-space gaps (one space = one character). */
function sentence(text: string, x0: number, y0: number, opts: { cw?: number; h?: number } = {}): OcrWord[] {
  const cw = opts.cw ?? 10
  const out: OcrWord[] = []
  let x = x0
  for (const t of text.split(' ')) {
    out.push(w(t, x, y0, opts))
    x += (t.length + 1) * cw
  }
  return out
}

/** Chord word: smaller and bold-ish, sitting one line above the lyric line at y. */
const chord = (text: string, x0: number, y: number, conf = 95): OcrWord =>
  w(text, x0, y - 26, { cw: 11, h: 15, conf })

describe('wordsToText', () => {
  it('returns empty output for no words', () => {
    expect(wordsToText([])).toEqual({ text: '', uncertain: [] })
  })

  it('joins words of a line with single spaces, regardless of the gap width', () => {
    const words = [w('Text', 0, 100), w('první', 200, 100), w('sloky', 400, 101)]
    expect(wordsToText(words).text).toBe('Text první sloky')
  })

  it('ignores empty words and trims whitespace', () => {
    const words = [w(' Text ', 0, 100), w('', 60, 100), w('  ', 80, 100), w('první', 100, 100)]
    expect(wordsToText(words).text).toBe('Text první')
  })

  it('orders lines top to bottom and words left to right whatever the input order', () => {
    const words = [w('sloky', 110, 140), w('první', 50, 100), w('Druhý', 0, 140), w('Text', 0, 100)]
    expect(wordsToText(words).text).toBe('Text první\nDruhý sloky')
  })

  it('inserts a chord in front of the syllable below its left edge (interpolated widths)', () => {
    // "Text první": T0 e10 x20 t30 _40 p50 r60 v70 n80 í90
    const words = [...sentence('Text první', 0, 100), chord('G', 70, 100)]
    expect(wordsToText(words).text).toBe('Text pr[G]vní')
  })

  it('uses per-character symbol boxes when present (proportional fonts)', () => {
    const mili: OcrWord = {
      text: 'mili',
      confidence: 95,
      bbox: { x0: 0, y0: 100, x1: 35, y1: 120 },
      symbols: [
        { text: 'm', x0: 0, x1: 20 },
        { text: 'i', x0: 20, x1: 25 },
        { text: 'l', x0: 25, x1: 30 },
        { text: 'i', x0: 30, x1: 35 }
      ]
    }
    // Interpolation would put x=21 into "l" (8.75 px per char); the symbols say it is the "i".
    expect(wordsToText([mili, chord('G', 21, 100)]).text).toBe('m[G]ili')
  })

  it('interpolates by typical glyph widths when there are no symbol boxes', () => {
    // "milí" in a proportional font: the wide "m" takes half of the word (0–20), i 20–27, l 27–33.
    // An even split (10 px per letter) would put both chords one letter further right.
    const mili = w('milí', 0, 100, { symbols: false })
    expect(wordsToText([mili, chord('G', 21, 100)]).text).toBe('m[G]ilí')
    expect(wordsToText([mili, chord('G', 27, 100)]).text).toBe('mi[G]lí')
  })

  it('ignores inconsistent (overlapping) OCR symbol boxes', () => {
    // Real Tesseract output: the boxes after "e" drift left; the font says "b" starts at ≈ 681.
    const nebojí: OcrWord = {
      text: 'nebojí,',
      confidence: 96,
      bbox: { x0: 632, y0: 1201, x1: 772, y1: 1249 },
      symbols: [
        { text: 'n', x0: 632, x1: 657 },
        { text: 'e', x0: 659, x1: 679 },
        { text: 'b', x0: 671, x1: 693 },
        { text: 'o', x0: 682, x1: 705 },
        { text: 'j', x0: 709, x1: 731 },
        { text: 'í', x0: 731, x1: 743 },
        { text: ',', x0: 749, x1: 772 }
      ]
    }
    const emi: OcrWord = { text: 'Emi', confidence: 96, bbox: { x0: 681, y0: 1149, x1: 760, y1: 1180 } }
    expect(wordsToText([nebojí, emi]).text).toBe('ne[Emi]bojí,')
  })

  it('falls back to interpolation when symbols do not match the word text', () => {
    const word: OcrWord = {
      ...w('první', 0, 100),
      symbols: [{ text: 'x', x0: 0, x1: 50 }]
    }
    expect(wordsToText([word, chord('D', 21, 100)]).text).toBe('pr[D]vní')
  })

  it('puts a chord standing over the gap between words in front of the next word', () => {
    const words = [...sentence('Text první', 0, 100), chord('G', 41, 100)]
    expect(wordsToText(words).text).toBe('Text [G]první')
  })

  it('puts a chord left of the text at the line start', () => {
    const words = [...sentence('Text první', 100, 100), chord('C', 80, 100)]
    expect(wordsToText(words).text).toBe('[C]Text první')
  })

  it('appends a chord past the end of the text', () => {
    const words = [...sentence('Text první', 0, 100), chord('G', 0, 100), chord('D7', 140, 100)]
    expect(wordsToText(words).text).toBe('[G]Text první [D7]')
  })

  it('places several chords and keeps the lyrics untouched', () => {
    const lyric = '1. Pane můj, ty jsi světlo'
    const words = [
      ...sentence(lyric, 0, 100),
      chord('G', 30, 100), // "P" of "Pane"
      chord('Emi', 100, 100), // "j" of "můj,"
      chord('D', 230, 100) // "t" of "světlo"
    ]
    const { text } = wordsToText(words)
    expect(text.replace(/\[[^\]]*\]/g, '')).toBe(lyric)
    expect(text).toBe('1. [G]Pane mů[Emi]j, ty jsi svě[D]tlo')
  })

  it('anchors a wide chord at the nearest letter start, also before a narrow letter', () => {
    const words = [...sentence('jiný', 0, 100), w('Emaj7', 14, 74, { cw: 11, h: 15 })]
    expect(wordsToText(words).text).toBe('j[Emaj7]iný')
  })

  it('does not skip a narrow letter whose ink box is much thinner than its advance', () => {
    // OCR symbol boxes are ink boxes: the "i" is 4 px wide, the chord starts 1 px after it.
    const i: OcrWord = {
      text: 'i',
      confidence: 95,
      bbox: { x0: 100, y0: 100, x1: 104, y1: 120 },
      symbols: [{ text: 'i', x0: 100, x1: 104 }]
    }
    const kdyz = w('když', 112, 100)
    expect(wordsToText([i, kdyz, w('Emi', 101, 74, { cw: 11, h: 15 })]).text).toBe('[Emi]i když')
  })

  it('anchors a chord slightly left of the syllable to that syllable', () => {
    const words = [...sentence('Text první', 0, 100), chord('G', 67, 100)]
    expect(wordsToText(words).text).toBe('Text pr[G]vní')
  })

  it('never attaches a chord standing in a gap to the previous word', () => {
    // Wide gap after the one-letter word "a": the chord is closer to "a" but stands after it.
    const words = [w('a', 0, 100), w('celé', 80, 100), chord('C', 30, 100)]
    expect(wordsToText(words).text).toBe('a [C]celé')
  })

  it('writes a chord line without lyrics below as an instrumental line', () => {
    const words = [
      chord('G', 0, 100),
      chord('D', 60, 100),
      chord('Emi', 120, 100),
      ...sentence('Text', 0, 300)
    ]
    expect(wordsToText(words).text).toBe('[G] [D] [Emi]\n\nText')
  })

  it('treats a chord line followed by another chord line as instrumental', () => {
    const words = [chord('G', 0, 70), chord('C', 40, 70), chord('D', 0, 100), ...sentence('Text', 0, 100)]
    expect(wordsToText(words).text).toBe('[G] [C]\n[D]Text')
  })

  it('keeps non-chord text of an instrumental line and drops bar lines', () => {
    const words = [
      w('Intro:', 0, 74, { h: 15 }),
      chord('G', 80, 100),
      w('|', 110, 74, { h: 15 }),
      chord('D', 130, 100)
    ]
    expect(wordsToText(words).text).toBe('Intro: [G] [D]')
  })

  it('separates stanzas by a blank line when the vertical gap is large', () => {
    const words = [
      ...sentence('První sloka řádek jedna', 0, 100),
      ...sentence('První sloka řádek dva', 0, 130),
      ...sentence('Druhá sloka řádek jedna', 0, 200),
      ...sentence('Druhá sloka řádek dva', 0, 230)
    ]
    expect(wordsToText(words).text).toBe(
      'První sloka řádek jedna\nPrvní sloka řádek dva\n\nDruhá sloka řádek jedna\nDruhá sloka řádek dva'
    )
  })

  it('measures stanza gaps on chord+lyric units, not on the chord line alone', () => {
    // Units are 60 px apart (chord line 26 px above each lyric line) – no blank lines inside.
    const unit = (text: string, y: number): OcrWord[] => [...sentence(text, 0, y), chord('G', 0, y)]
    const words = [
      ...unit('Raz dva', 100),
      ...unit('Tři čtyři', 160),
      ...unit('Pět šest', 280),
      ...unit('Sedm', 340)
    ]
    expect(wordsToText(words).text).toBe('[G]Raz dva\n[G]Tři čtyři\n\n[G]Pět šest\n[G]Sedm')
  })

  it('does not split a stanza because of small spacing differences', () => {
    const words = [
      ...sentence('Řádek jedna', 0, 100),
      ...sentence('Řádek dva', 0, 128),
      ...sentence('Řádek tři', 0, 160),
      ...sentence('Řádek čtyři', 0, 189)
    ]
    expect(wordsToText(words).text).toBe('Řádek jedna\nŘádek dva\nŘádek tři\nŘádek čtyři')
  })

  it('groups slightly skewed lines correctly', () => {
    // Each line descends by 3 px per word (≈ 1.5° skew); lines are 30 px apart.
    const line = (texts: string[], y: number): OcrWord[] => texts.map((t, i) => w(t, i * 80, y + i * 3))
    const words = [
      ...line(['Ach', 'Pane', 'slyš', 'nás', 'dnes'], 100),
      ...line(['když', 'k', 'tobě', 'voláme', 'zas'], 130),
      ...line(['ty', 'jsi', 'světlo', 'naše', 'tmy'], 160)
    ]
    expect(wordsToText(words).text).toBe(
      'Ach Pane slyš nás dnes\nkdyž k tobě voláme zas\nty jsi světlo naše tmy'
    )
  })

  it('keeps words with overlapping OCR boxes on one line (real scan boxes)', () => {
    const word = (text: string, conf: number, x0: number, y0: number, x1: number, y1: number): OcrWord => ({
      text,
      confidence: conf,
      bbox: { x0, y0, x1, y1 }
    })
    const words = [
      word('G', 96, 297, 828, 327, 859),
      word('D', 90, 582, 828, 613, 858),
      word('R:', 96, 209, 874, 251, 908),
      word('Buď', 21, 299, 872, 423, 909),
      word('s', 21, 390, 867, 417, 919),
      word('námi,', 93, 441, 871, 562, 913),
      word('Pane,', 96, 583, 874, 701, 913),
      word('u', 96, 721, 883, 747, 908),
      word('stolu,', 96, 765, 872, 885, 913)
    ]
    expect(wordsToText(words).text).toBe('R: [G]Buď s námi, [D]Pane, u stolu,')
  })

  it('follows a row that drifts more than the tolerance end to end (via the middle word)', () => {
    // Centres 110 → 115.5 → 121: the ends alone are 11 px apart (> 0.5 × 20 px).
    const words = [w('jedna', 0, 100), w('dva', 300, 111), w('tři', 150, 105.5)]
    expect(wordsToText(words).text).toBe('jedna tři dva')
  })

  it('reports low-confidence words with the output line they ended up on', () => {
    const words = [
      ...sentence('Nadpis', 0, 20),
      ...sentence('Text první', 0, 100),
      chord('G', 70, 100, 30),
      w('sloky', 110, 100, { conf: 40 }),
      ...sentence('Další řádek', 0, 130)
    ]
    const { text, uncertain } = wordsToText(words)
    expect(text).toBe('Nadpis\n\nText pr[G]vní sloky\nDalší řádek')
    expect(uncertain).toEqual([
      { text: 'G', confidence: 30, sourceLine: 2 },
      { text: 'sloky', confidence: 40, sourceLine: 2 }
    ])
  })

  it('honours a custom lowConfidence threshold', () => {
    const words = [w('Haleluja', 0, 100, { conf: 80 })]
    expect(wordsToText(words).uncertain).toEqual([])
    expect(wordsToText(words, { lowConfidence: 90 }).uncertain).toEqual([
      { text: 'Haleluja', confidence: 80, sourceLine: 0 }
    ])
  })

  it('keeps misread tokens of a chord line as chords and flags them for review', () => {
    const words = [
      ...sentence('Text první sloky', 0, 100),
      chord('G', 0, 100),
      chord('Arni', 70, 100),
      chord('D', 110, 100)
    ]
    const { text, uncertain } = wordsToText(words)
    expect(text).toBe('[G]Text pr[Arni]vní [D]sloky')
    expect(uncertain).toEqual([{ text: 'Arni', confidence: 95, sourceLine: 0 }])
  })

  it('does not treat a lyric line starting with a chord-like word as chords', () => {
    const words = [...sentence('A je to tak', 0, 100), ...sentence('Haleluja', 0, 130)]
    expect(wordsToText(words).text).toBe('A je to tak\nHaleluja')
  })
})
