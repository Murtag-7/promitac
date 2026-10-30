import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importText } from './importText'
import { localExtractor } from './extractor'

const OPENLYRICS = fileURLToPath(new URL('../../../tests/fixtures/openlyrics', import.meta.url))
const TEXT = 'Píseň\n\nG       D\n1. Text první sloky\n\nR: Refrén zní'

describe('localExtractor', () => {
  it('is the local extractor', () => {
    expect(localExtractor.id).toBe('local')
  })

  it.each(['text', 'chordpro', 'image', 'pdf', 'docx'] as const)(
    'wraps importText for %s sources',
    async (source) => {
      const uncertain = [{ text: 'Refrén', confidence: 50, sourceLine: 5 }]
      await expect(localExtractor.extract({ text: TEXT, source, uncertain })).resolves.toEqual(
        importText(TEXT, { uncertain })
      )
    }
  )

  it('parses OpenLyrics XML', async () => {
    const xml = readFileSync(join(OPENLYRICS, 'ranni-zpev-0.8.xml'), 'utf8')
    const result = await localExtractor.extract({ text: xml, source: 'openlyrics' })
    expect(result.format).toBe('openlyrics')
    expect(result.song.meta.title).toBe('Ranní zpěv')
    expect(result.song.sections).toHaveLength(4)
    expect(result.warnings).toEqual([])
    expect(result.uncertain).toEqual([])
  })

  it('recognises OpenLyrics XML pasted as text', async () => {
    const xml = readFileSync(join(OPENLYRICS, 'vecerni-modlitba-0.9.xml'), 'utf8')
    const result = await localExtractor.extract({ text: xml, source: 'text' })
    expect(result.format).toBe('openlyrics')
    expect(result.song.meta.title).toBe('Večerní modlitba')
  })

  it('adds title warnings for OpenLyrics without a title', async () => {
    const xml =
      '<song xmlns="http://openlyrics.info/namespace/2009/song"><properties/><lyrics><verse name="v1"><lines>Ó Pane,<br/>slyš</lines></verse></lyrics></song>'
    const result = await localExtractor.extract({ text: xml, source: 'openlyrics' })
    expect(result.song.meta.title).toBe('Ó Pane')
    expect(result.warnings).toEqual([{ code: 'titleFromFirstLine' }])
  })

  it('rejects broken OpenLyrics files', async () => {
    await expect(localExtractor.extract({ text: '<song>', source: 'openlyrics' })).rejects.toThrow(
      /OpenLyrics/
    )
  })
})
