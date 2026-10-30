// Copies offline OCR assets (Tesseract worker, wasm core, ces+eng traineddata) into the renderer public dir.
// The files are generated (gitignored) so the repo stays small; the app ships them so OCR works offline.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nm = (...p) => join(root, 'node_modules', ...p)
const out = join(root, 'src/renderer/public/ocr')

const files = [
  // [source, target relative to src/renderer/public/ocr]
  [nm('tesseract.js/dist/worker.min.js'), 'worker.min.js'],
  [nm('tesseract.js-core/tesseract-core-lstm.wasm.js'), 'core/tesseract-core-lstm.wasm.js'],
  [nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'), 'core/tesseract-core-simd-lstm.wasm.js'],
  [
    nm('tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js'),
    'core/tesseract-core-relaxedsimd-lstm.wasm.js'
  ],
  [nm('@tesseract.js-data/ces/4.0.0_best_int/ces.traineddata.gz'), 'lang/ces.traineddata.gz'],
  [nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), 'lang/eng.traineddata.gz']
]

// pdf.js decoders (JPX/JBIG2 scans) and standard fonts for rendering scanned PDFs offline.
for (const sub of ['wasm', 'standard_fonts']) {
  const dir = nm('pdfjs-dist', sub)
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir)) files.push([join(dir, f), `../pdfjs/${sub}/${f}`])
}

let copied = 0
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.error(`[prepare-assets] missing ${from} – run npm install`)
    process.exit(1)
  }
  const target = join(out, to)
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target) && statSync(target).size === statSync(from).size) continue
  copyFileSync(from, target)
  copied++
}
console.log(`[prepare-assets] OCR assets ready (${copied} copied)`)
