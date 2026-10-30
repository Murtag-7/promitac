// Renders the import-assistant test fixtures from the song specs in tests/fixtures/ocr/*.json:
//   tests/fixtures/ocr/<name>.html + .png   songbook page (chords above syllables), Playwright Chromium
//   tests/fixtures/ocr/<name>.truth.txt     ground truth in the format wordsToText() produces
//   tests/fixtures/pdf/<name>.pdf           same page with a real text layer (specs with "pdf": true)
//   tests/fixtures/docx/<name>.docx         chords-over-text Word document (specs with "docx": true)
//   tests/fixtures/docx/<name>.expected.txt expected docxRawToText() output
// Usage: node scripts/render-fixtures.mjs   (re-runnable; overwrites the generated files)
// The song texts are invented for the tests – no copyrighted lyrics.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import { Document, Packer, Paragraph, Tab, TextRun } from 'docx'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ocrDir = join(root, 'tests/fixtures/ocr')
const pdfDir = join(root, 'tests/fixtures/pdf')
const docxDir = join(root, 'tests/fixtures/docx')

/** CSS page width; the screenshot is this × deviceScaleFactor pixels wide. */
const PAGE_WIDTH = 800
const MAX_PNG_BYTES = 1.5 * 1024 * 1024

const STYLES = {
  serif: {
    font: "'Liberation Serif', 'DejaVu Serif', serif",
    size: 21,
    scale: 1.75,
    color: '#151515',
    paper: '#ffffff'
  },
  sans: {
    font: "'DejaVu Sans', 'Liberation Sans', sans-serif",
    size: 17,
    scale: 1.75,
    color: '#111111',
    paper: '#ffffff'
  },
  // A phone photo of a printed page: rotated 2°, soft focus, uneven light, sensor noise.
  photo: {
    font: "'DejaVu Serif', 'Liberation Serif', serif",
    size: 18,
    scale: 1.75,
    color: '#262321',
    paper: 'radial-gradient(ellipse at 40% 35%, #f6f2e8 0%, #ebe5d8 55%, #d6cfbf 100%)',
    rotate: 2,
    blur: 0.45,
    noise: 7
  }
}

/** "[G]Ráno když…" → { text: 'Ráno když…', chords: [{ index: 0, chord: 'G' }] } */
function parseLine(src) {
  let text = ''
  const chords = []
  for (const m of src.matchAll(/\[([^\]]+)\]|([^[]+)/g)) {
    if (m[1] !== undefined) chords.push({ index: text.length, chord: m[1] })
    else text += m[2]
  }
  for (const { index, chord } of chords) {
    if (index < text.length && text[index] === ' ')
      throw new Error(`chord ${chord} anchored on a space in "${src}"`)
  }
  return { text, chords }
}

/** Ground-truth line: inline chords; chords past the end are appended after a space. */
function truthLine(marker, { text, chords }) {
  let out = ''
  let pos = 0
  const tail = []
  for (const { index, chord } of chords) {
    if (index >= text.length) {
      tail.push(chord)
      continue
    }
    out += text.slice(pos, index) + `[${chord}]`
    pos = index
  }
  out += text.slice(pos)
  for (const chord of tail) out += ` [${chord}]`
  return marker ? `${marker} ${out}` : out
}

function truthText(spec) {
  const blocks = [spec.title]
  if (spec.intro) blocks.push(`${spec.intro.label} ${spec.intro.chords.map((c) => `[${c}]`).join(' ')}`)
  for (const stanza of spec.stanzas) {
    blocks.push(stanza.lines.map((l, i) => truthLine(i === 0 ? stanza.marker : '', parseLine(l))).join('\n'))
  }
  return blocks.join('\n\n') + '\n'
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function lineHtml(marker, { text, chords }) {
  let html = ''
  let pos = 0
  for (const { index, chord } of chords) {
    const end = index >= text.length
    html += esc(text.slice(pos, Math.min(index, text.length)))
    html += `<span class="a${end ? ' end' : ''}"><b>${esc(chord)}</b></span>`
    pos = Math.min(index, text.length)
  }
  html += esc(text.slice(pos))
  const cls = chords.length ? 'l c' : 'l'
  return `<div class="${cls}"><span class="m">${esc(marker)}</span>${html}</div>`
}

function pageHtml(spec) {
  const st = STYLES[spec.style]
  if (!st) throw new Error(`unknown style ${spec.style}`)
  const stanzas = spec.stanzas
    .map(
      (s) =>
        `<div class="s">\n${s.lines.map((l, i) => lineHtml(i === 0 ? s.marker : '', parseLine(l))).join('\n')}\n</div>`
    )
    .join('\n')
  const intro = spec.intro
    ? `<div class="s intro"><span class="m"></span>${esc(spec.intro.label)}${spec.intro.chords
        .map((c) => `<b>${esc(c)}</b>`)
        .join('')}</div>\n`
    : ''
  const transform = st.rotate ? `transform: rotate(${st.rotate}deg); transform-origin: 50% 40%;` : ''
  const filter = st.blur ? `filter: blur(${st.blur}px);` : ''
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>${esc(spec.title)}</title>
<style>
  html, body { margin: 0; background: #fff; }
  .sheet { width: ${PAGE_WIDTH}px; overflow: hidden; background: ${st.paper}; }
  .page { box-sizing: border-box; width: ${PAGE_WIDTH}px; padding: 56px 64px 64px 72px;
    font-family: ${st.font}; font-size: ${st.size}px; color: ${st.color}; ${transform} ${filter} }
  h1 { font-size: 1.5em; font-weight: 700; margin: 0 0 1.4em; }
  .s { margin-bottom: 1.35em; }
  .l { position: relative; white-space: pre; line-height: 1.35; }
  .l.c { padding-top: 0.95em; }
  .m { display: inline-block; width: 2em; }
  .a { position: relative; }
  .a > b { position: absolute; left: 0; bottom: 1.2em; font-size: 0.86em; font-weight: 700; white-space: pre; }
  .a.end { margin-left: 0.5em; }
  .intro { line-height: 1.35; white-space: pre; }
  .intro b { font-size: 0.86em; font-weight: 700; margin-left: 1.3em; }
</style>
</head>
<body>
<div class="sheet"><div class="page">
<h1>${esc(spec.title)}</h1>
${intro}${stanzas}
</div></div>
</body>
</html>
`
}

/** Fails when two chords of one line overlap or touch – real songbooks never print them so. */
async function checkChordSpacing(page, name) {
  const problems = await page.evaluate(() => {
    const out = []
    for (const line of document.querySelectorAll('.l.c')) {
      const rects = [...line.querySelectorAll('.a > b')].map((b) => b.getBoundingClientRect())
      const em = parseFloat(getComputedStyle(line).fontSize)
      for (let i = 1; i < rects.length; i++) {
        if (rects[i].left - rects[i - 1].right < 0.25 * em) out.push(line.textContent)
      }
      const right = line.closest('.page').getBoundingClientRect().right
      for (const r of rects) if (r.right > right) out.push(`past the page: ${line.textContent}`)
    }
    return out
  })
  if (problems.length) throw new Error(`${name}: chords too close:\n  ${problems.join('\n  ')}`)
}

/** Deterministic Gaussian noise (seeded) – grayscale output keeps the PNG small. */
function photoPostprocess(buffer, sigma, seed = 42) {
  const png = PNG.sync.read(buffer)
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
  const out = new PNG({ width: png.width, height: png.height, colorType: 0, inputColorType: 0, bitDepth: 8 })
  const gray = Buffer.alloc(png.width * png.height)
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    const lum = 0.299 * png.data[p] + 0.587 * png.data[p + 1] + 0.114 * png.data[p + 2]
    gray[i] = Math.max(0, Math.min(255, Math.round(lum + sigma * gauss())))
  }
  out.data = gray
  return PNG.sync.write(out, { colorType: 0, inputColorType: 0, bitDepth: 8 })
}

/** Chords-over-text lines with monospace columns (marker + space prefix on the first line). */
function chordColumnLine(prefix, { text, chords }) {
  let s = ''
  for (const { index, chord } of chords) {
    const wanted = prefix.length + (index >= text.length ? text.length + 1 : index)
    const col = s.length ? Math.max(wanted, s.length + 1) : wanted
    s = s.padEnd(col) + chord
  }
  return s
}

async function writeDocx(name, spec) {
  const mono = 'Courier New'
  const run = (text, bold = false) => new TextRun({ text, font: mono, size: 22, bold })
  const children = [new Paragraph({ children: [new TextRun({ text: spec.title, bold: true, size: 32 })] })]
  const expected = [spec.title]
  children.push(new Paragraph({ children: [] }))
  expected.push('')
  if (spec.intro) {
    const chords = spec.intro.chords.join('   ')
    children.push(
      new Paragraph({
        children: [run(spec.intro.label), new TextRun({ children: [new Tab()] }), run(chords, true)]
      })
    )
    expected.push(`${spec.intro.label}\t${chords}`)
    children.push(new Paragraph({ children: [] }))
    expected.push('')
  }
  spec.stanzas.forEach((stanza, si) => {
    stanza.lines.forEach((src, li) => {
      const line = parseLine(src)
      const prefix = li === 0 && stanza.marker ? `${stanza.marker} ` : ''
      if (line.chords.length) {
        const chordLine = chordColumnLine(prefix, line)
        children.push(new Paragraph({ children: [run(chordLine, true)] }))
        expected.push(chordLine)
      }
      children.push(new Paragraph({ children: [run(prefix + line.text)] }))
      expected.push(prefix + line.text)
    })
    if (si < spec.stanzas.length - 1) {
      children.push(new Paragraph({ children: [] }))
      expected.push('')
    }
  })
  const doc = new Document({
    creator: 'Promítač test fixtures',
    title: spec.title,
    sections: [{ children }]
  })
  writeFileSync(join(docxDir, `${name}.docx`), await Packer.toBuffer(doc))
  writeFileSync(join(docxDir, `${name}.expected.txt`), expected.join('\n') + '\n')
}

async function main() {
  for (const dir of [ocrDir, pdfDir, docxDir]) mkdirSync(dir, { recursive: true })
  const specs = readdirSync(ocrDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f.replace(/\.json$/, ''), spec: JSON.parse(readFileSync(join(ocrDir, f), 'utf8')) }))
  const browser = await chromium.launch()
  try {
    for (const { name, spec } of specs) {
      const st = STYLES[spec.style]
      const html = pageHtml(spec)
      writeFileSync(join(ocrDir, `${name}.html`), html)
      writeFileSync(join(ocrDir, `${name}.truth.txt`), truthText(spec))

      const context = await browser.newContext({
        viewport: { width: PAGE_WIDTH, height: 600 },
        deviceScaleFactor: st.scale
      })
      const page = await context.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      await checkChordSpacing(page, name)
      let png = await page.screenshot({ fullPage: true, type: 'png' })
      if (st.noise) png = photoPostprocess(png, st.noise)
      if (png.length > MAX_PNG_BYTES) throw new Error(`${name}.png is ${png.length} bytes (> 1.5 MB)`)
      writeFileSync(join(ocrDir, `${name}.png`), png)

      if (spec.pdf) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        await page.pdf({
          path: join(pdfDir, `${name}.pdf`),
          width: `${PAGE_WIDTH}px`,
          height: `${height}px`,
          printBackground: true,
          margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
          pageRanges: '1'
        })
      }
      await context.close()
      if (spec.docx) await writeDocx(name, spec)

      const size = (p) => `${Math.round(statSync(p).size / 1024)} kB`
      console.log(`[render-fixtures] ${name}: png ${size(join(ocrDir, `${name}.png`))}`)
    }
  } finally {
    await browser.close()
  }
}

await main()
