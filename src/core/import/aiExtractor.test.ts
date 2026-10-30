import { AI_PROMPT, extractWithGemini, stripCodeFences, type FetchLike } from './aiExtractor'

const CHORDPRO = '{title: Píseň z fotky}\n\n{start_of_verse: V1}\n[G]Text první [D]sloky\n{end_of_verse}\n'

function fakeFetch(text: string, status = 200) {
  const calls: Array<{ url: string; body: unknown }> = []
  const fn = (async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: JSON.parse(init?.body ?? '{}') })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
      text: async () => text
    }
  }) as unknown as FetchLike
  return { fn, calls }
}

describe('extractWithGemini', () => {
  it('sends the images with a verbatim-transcription prompt and parses the ChordPro answer', async () => {
    const { fn, calls } = fakeFetch('```chordpro\n' + CHORDPRO + '```')
    const result = await extractWithGemini([{ mime: 'image/png', base64: 'AAAA' }], {
      apiKey: 'test-key',
      model: 'gemini-test',
      fetchImpl: fn
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toContain('models/gemini-test:generateContent')
    expect(calls[0]?.url).toContain('key=test-key')
    const body = calls[0]?.body as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>
      generationConfig: { temperature: number }
    }
    expect(body.generationConfig.temperature).toBe(0)
    expect(JSON.stringify(body)).toContain('inline_data')
    expect(body.contents[0]?.parts[0]?.text).toBe(AI_PROMPT)
    expect(result.song.meta.title).toBe('Píseň z fotky')
    expect(result.song.sections[0]?.lines[0]).toMatchObject({ kind: 'lyrics' })
  })

  it('the prompt forbids changing the text', () => {
    expect(AI_PROMPT).toMatch(/DOSLOVNĚ/)
    expect(AI_PROMPT).toMatch(/neopravuj/i)
  })

  it('reports HTTP errors with a Czech message', async () => {
    const { fn } = fakeFetch('denied', 403)
    await expect(
      extractWithGemini([{ mime: 'image/png', base64: 'A' }], { apiKey: 'x', fetchImpl: fn })
    ).rejects.toThrow(/klíč/)
  })

  it('strips markdown code fences', () => {
    expect(stripCodeFences('```\nabc\n```')).toBe('abc')
    expect(stripCodeFences('abc')).toBe('abc')
  })
})
