import { importText, type ImportResult } from './importText'

/**
 * Optional (P2, off by default) AI transcription of song photos with Google Gemini. The prompt
 * insists on a verbatim transcription; the answer is ChordPro that goes through the same parser
 * as every other import, so the user reviews it exactly like an OCR result.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

export const AI_PROMPT = [
  'Jsi přepisovač zpěvníků. Na obrázcích je jedna píseň (více obrázků = po sobě jdoucí stránky).',
  'Přepiš ji DOSLOVNĚ do formátu ChordPro:',
  '- Text písně opiš přesně znak po znaku. Neopravuj pravopis ani interpunkci, nepřekládej, nic nedoplňuj, nic nevynechávej, neměň pořadí řádků.',
  '- Akordy zapiš do hranatých závorek přímo před slabiku, nad kterou na obrázku stojí, např. [G]Text pr[D]vní sloky. Akordy opiš tak, jak jsou (H, B, Ami, Emi, Fis…).',
  '- Sekce označ direktivami {start_of_verse: V1} … {end_of_verse}, {start_of_chorus: C} … {end_of_chorus}, {start_of_bridge: B} … {end_of_bridge}, {start_of_prechorus: P} … {end_of_prechorus}. Značky jako „1.“, „R:“ nebo „Ref.“ nahraď těmito direktivami.',
  '- Když je refrén na obrázku jen odkazem (např. samotné „R:“), text nekopíruj a pořadí zapiš do {arrangement: V1 C V2 C}.',
  '- Název písně dej do {title: …} a autora, pokud je uveden, do {artist: …}.',
  '- Vrať pouze ChordPro text, bez vysvětlování a bez markdownu.'
].join('\n')

/** Minimal fetch shape (src/core has no DOM types; Node, Electron and browsers all provide fetch). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface GeminiOptions {
  apiKey: string
  model?: string
  fetchImpl?: FetchLike
}

export function stripCodeFences(text: string): string {
  const t = text.trim()
  const m = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(t)
  return (m ? (m[1] ?? '') : t).trim()
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

export async function extractWithGemini(
  images: Array<{ mime: string; base64: string }>,
  opts: GeminiOptions
): Promise<ImportResult> {
  const doFetch = opts.fetchImpl ?? ((globalThis as unknown as { fetch: FetchLike }).fetch as FetchLike)
  const model = opts.model ?? DEFAULT_GEMINI_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: AI_PROMPT },
          ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.base64 } }))
        ]
      }
    ],
    generationConfig: { temperature: 0, topP: 0.1 }
  }
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    throw new Error('AI převod potřebuje internet – zkuste to znovu, nebo použijte převod bez AI.')
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error('AI odmítla požadavek – zkontrolujte API klíč v Nastavení → Asistent importu.')
  }
  if (!res.ok) throw new Error(`AI převod se nepovedl (HTTP ${res.status}).`)
  const json = (await res.json()) as GeminiResponse
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text.trim()) throw new Error('AI nevrátila žádný text.')
  return importText(stripCodeFences(text))
}
