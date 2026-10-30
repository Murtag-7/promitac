import { serializeChordPro } from '../chordpro/serialize'
import { importText } from './importText'

const BOM = String.fromCharCode(0xfeff)
const NBSP = String.fromCharCode(0xa0)
const ZWSP = String.fromCharCode(0x200b)

const CLEAN = [
  'Žehnej, duše má',
  '',
  'G       D',
  '1. Řekni mi, kde je tvůj dům,',
  'Emi     C',
  'světlo v okně září',
  '',
  'R: Pojď, Duchu, sestup níž',
  '',
  'R:'
].join('\n')

const cp = (text: string): string => serializeChordPro(importText(text).song, { includeAppMeta: false })

describe('importText', () => {
  it('normalizes CRLF/NBSP/NFD/BOM/zero-width characters to the same result as clean text', () => {
    const dirty =
      BOM +
      CLEAN.replace('Řekni mi', `Řekni${NBSP}mi`)
        .replace('Emi     C', 'Emi\tC')
        .normalize('NFD')
        .replace(/\n/g, '\r\n') +
      ZWSP
    expect(dirty).toContain(NBSP)
    expect(dirty).toContain('\r\n')
    expect(dirty).not.toContain('Ř')
    expect(dirty).not.toBe(CLEAN)
    expect(cp(dirty)).toBe(cp(CLEAN))
    expect(importText(dirty).song.meta.title).toBe('Žehnej, duše má')
  })

  it('expands tabs before aligning chords', () => {
    expect(cp('Píseň\n\nG\tD\nSlovo\tdruhé')).toBe(cp('Píseň\n\nG       D\nSlovo   druhé'))
  })

  it('reports the detected format', () => {
    expect(importText(CLEAN).format).toBe('chords-over-text')
    expect(importText('Píseň\n\n[G]Text [D]dál').format).toBe('inline-chords')
    expect(importText('Píseň\n\nText\ndál').format).toBe('plain')
    expect(importText('{title: Píseň}\n[G]Text').format).toBe('chordpro')
  })

  it('passes ChordPro through the ChordPro parser', () => {
    const text =
      '{title: Píseň}\n{x_id: abc}\n{x_updated: 2026-01-01T00:00:00.000Z}\n\n{start_of_chorus}\n[G]Text\n{end_of_chorus}'
    const result = importText(text)
    expect(result.song.meta.title).toBe('Píseň')
    expect(result.song.sections.map((s) => s.id)).toEqual(['C'])
    expect(result.warnings).toEqual([])
  })

  it('leaves id and updatedAt for the caller', () => {
    const result = importText('{title: Píseň}\n{x_id: abc}\n{x_updated: 2026-01-01T00:00:00.000Z}\nText')
    expect(result.song.id).toBe('')
    expect(result.song.updatedAt).toBe('')
    expect(importText('Píseň\n\nText').song.id).toBe('')
  })

  it('takes the title of title-less ChordPro from its first lyric line', () => {
    const result = importText('{start_of_verse}\n[G]Ó Pane, [D]slyš,\n{end_of_verse}')
    expect(result.song.meta.title).toBe('Ó Pane, slyš')
    expect(result.warnings).toEqual([{ code: 'titleFromFirstLine' }])
  })

  it('warns about empty input', () => {
    expect(importText('').warnings.map((w) => w.code)).toEqual(['missingTitle', 'emptySection'])
    expect(importText('{title: Jen název}').warnings.map((w) => w.code)).toEqual(['emptySection'])
  })

  it('passes uncertain OCR words through', () => {
    const uncertain = [{ text: 'svetlo', confidence: 41, sourceLine: 5 }]
    expect(importText(CLEAN, { uncertain }).uncertain).toEqual(uncertain)
    expect(importText(CLEAN).uncertain).toEqual([])
  })

  it('keeps source line numbers relative to the normalised input', () => {
    const song = importText(CLEAN.replace(/\n/g, '\r\n')).song
    expect(song.sections[0]?.lines.map((l) => (l.kind === 'lyrics' ? l.source : null))).toEqual([3, 5])
  })
})
