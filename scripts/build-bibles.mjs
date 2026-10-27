#!/usr/bin/env node
/**
 * Builds the bundled public-domain Bible translations in resources/bibles/ from the JSON exports of
 * the scrollmapper/bible_databases project (texts derived from CrossWire SWORD modules):
 *
 *   cs-bkr.json.gz  ← formats/json/CzeBKR.json  (sources/cs/CzeBKR/README.md: "License: Public Domain")
 *   en-kjv.json.gz  ← formats/json/KJVPCE.json  (sources/en/KJVPCE/README.md: "License: Public Domain")
 *   index.json      ← BibleTranslationInfo[] of the files above
 *
 * Usage: node scripts/build-bibles.mjs [--bkr=<path|url>] [--kjv=<path|url>] [--out=<dir>]
 * Without arguments the sources are downloaded from GitHub. Output is gzip (level 9) JSON in the
 * BibleData shape of src/core/bible/model.ts: books[i].chapters[c - 1][v - 1] = verse text.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'https://github.com/scrollmapper/bible_databases'
const RAW = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/'

// Canonical order and KJV chapter counts; must match BOOKS in src/core/bible/books.ts
// (src/core/bible/bundled.test.ts checks the generated files against BOOKS).
const BOOK_IDS =
  'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(
    ' '
  )
// prettier-ignore
const CHAPTERS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14,
  3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5,
  1, 1, 1, 22
]
const EXPECTED_VERSES = 31102

/** Markup that must never reach the projector. */
function cleanCommon(text) {
  return text
    .replace(/<[^>]*>/g, ' ') // stray XML/HTML tags
    .replace(/\s*\{[^}]*\}/g, '') // {…} alternative readings (BKR: "kněží {biskupové}")
    .replace(/¶\s*/g, '') // paragraph marks (KJV)
    .replace(/\s+/g, ' ')
    .trim()
}

// Words that stay capitalised when the drop-cap word follows "O", "I" or "A" ("O LORD" → "O Lord").
const PROPER_AFTER_INTERJECTION = new Set(['LORD', 'GOD', 'ISRAEL'])

/**
 * KJVPCE prints the first word of every chapter in capitals (a drop-cap convention, "IN the beginning",
 * "A Psalm of David. THE Lord is my shepherd"). Turn that word back into normal case; all other
 * capitals (inscriptions like "MENE, MENE, TEKEL, UPHARSIN") are left alone.
 */
export function fixDropCap(text) {
  const match = /\b([A-Z][A-Z’]+)\b/.exec(text)
  if (!match) return text
  const word = match[1]
  const before = text.slice(0, match.index)
  const afterInterjection = /(^|\s)[AIO] $/.test(before)
  const fixed =
    afterInterjection && !PROPER_AFTER_INTERJECTION.has(word)
      ? word.toLowerCase()
      : word[0] + word.slice(1).toLowerCase()
  return before + fixed + text.slice(match.index + word.length)
}

/** Verses that are empty in KJVPCE.json; standard KJV (1769) text, public domain. */
const KJV_MISSING = {
  'JOS 15:1':
    'This then was the lot of the tribe of the children of Judah by their families; even to the border of Edom the wilderness of Zin southward was the uttermost part of the south coast.',
  'JOB 7:1':
    'Is there not an appointed time to man upon earth? are not his days also like the days of an hireling?',
  'HOS 8:1':
    'Set the trumpet to thy mouth. He shall come as an eagle against the house of the Lord, because they have transgressed my covenant, and trespassed against my law.',
  'ROM 8:1':
    'There is therefore now no condemnation to them which are in Christ Jesus, who walk not after the flesh, but after the Spirit.'
}

const TRANSLATIONS = [
  {
    arg: 'bkr',
    file: 'CzeBKR.json',
    info: {
      id: 'cs-bkr',
      name: 'Bible kralická (1613)',
      abbreviation: 'BKR',
      language: 'cs',
      license: 'Public Domain',
      source: `${REPO} (formats/json/CzeBKR.json, SWORD module CzeBKR)`
    },
    clean: (text) => cleanCommon(text),
    missing: {}
  },
  {
    arg: 'kjv',
    file: 'KJVPCE.json',
    info: {
      id: 'en-kjv',
      name: 'King James Version (1769, Pure Cambridge Edition)',
      abbreviation: 'KJV',
      language: 'en',
      license: 'Public Domain',
      source: `${REPO} (formats/json/KJVPCE.json, SWORD module KJVPCE)`
    },
    clean: (text, verse) => {
      const cleaned = cleanCommon(text)
      return verse === 1 ? fixDropCap(cleaned) : cleaned
    },
    missing: KJV_MISSING
  }
]

function parseArgs(argv) {
  const args = {}
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg)
    if (!match)
      throw new Error(`Unknown argument "${arg}". Usage: --bkr=<path|url> --kjv=<path|url> --out=<dir>`)
    args[match[1]] = match[2]
  }
  return args
}

async function loadJson(location) {
  if (!/^https?:\/\//.test(location)) return JSON.parse(readFileSync(resolve(location), 'utf8'))
  console.log(`  downloading ${location}`)
  let response
  try {
    response = await fetch(location)
  } catch (error) {
    throw new Error(
      `Download failed (${error.cause?.code ?? error.message}). Behind a TLS-intercepting proxy set ` +
        `NODE_EXTRA_CA_CERTS, or download the file manually and pass its path.`
    )
  }
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${location}`)
  return response.json()
}

function convert(source, translation) {
  if (!Array.isArray(source?.books) || source.books.length !== 66) {
    throw new Error(`${translation.file}: expected 66 books, found ${source?.books?.length ?? 'none'}`)
  }
  const problems = []
  let verseCount = 0
  const books = source.books.map((srcBook, i) => {
    const id = BOOK_IDS[i]
    if (srcBook.chapters.length !== CHAPTERS[i]) {
      problems.push(`${id} (${srcBook.name}): ${srcBook.chapters.length} chapters, expected ${CHAPTERS[i]}`)
    }
    const chapters = []
    for (const srcChapter of srcBook.chapters) {
      const verses = []
      for (const { verse, text } of srcChapter.verses) {
        const ref = `${id} ${srcChapter.chapter}:${verse}`
        const cleaned = translation.clean(String(text ?? ''), verse) || translation.missing[ref] || ''
        verses[verse - 1] = cleaned
      }
      chapters[srcChapter.chapter - 1] = Array.from(verses, (v) => v ?? '')
    }
    const dense = Array.from(chapters, (c) => c ?? [])
    dense.forEach((verses, c) =>
      verses.forEach((text, v) => {
        verseCount++
        const ref = `${id} ${c + 1}:${v + 1}`
        if (!text) problems.push(`${ref}: empty verse`)
        else if (/[<>{}¶\d]|\s{2}|^\s|\s$/.test(text)) problems.push(`${ref}: leftover markup: ${text}`)
      })
    )
    return { id, chapters: dense }
  })
  if (verseCount !== EXPECTED_VERSES) problems.push(`${verseCount} verses, expected ${EXPECTED_VERSES}`)
  if (problems.length > 0) {
    throw new Error(`${translation.file} failed validation:\n  ${problems.slice(0, 20).join('\n  ')}`)
  }
  return { data: { ...translation.info, books }, verseCount }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outDir = resolve(args.out ?? join(ROOT, 'resources', 'bibles'))
  mkdirSync(outDir, { recursive: true })
  const index = []
  for (const translation of TRANSLATIONS) {
    console.log(`${translation.info.abbreviation}:`)
    const source = await loadJson(args[translation.arg] ?? RAW + translation.file)
    const { data, verseCount } = convert(source, translation)
    const json = Buffer.from(JSON.stringify(data), 'utf8')
    const gz = gzipSync(json, { level: 9 })
    const file = join(outDir, `${translation.info.id}.json.gz`)
    writeFileSync(file, gz)
    const sample = (b, c, v) => data.books[b].chapters[c - 1][v - 1]
    console.log(
      `  ${verseCount} verses, ${(json.length / 1e6).toFixed(2)} MB JSON → ${(gz.length / 1e6).toFixed(2)} MB gzip`
    )
    console.log(`  Gen 1:1   ${sample(0, 1, 1)}`)
    console.log(`  Ps 23:1   ${sample(18, 23, 1)}`)
    console.log(`  John 3:16 ${sample(42, 3, 16)}`)
    console.log(`  → ${file}`)
    index.push({ ...translation.info, builtIn: true })
  }
  const order = ['id', 'name', 'abbreviation', 'language', 'builtIn', 'license', 'source']
  const sorted = index.map((info) => Object.fromEntries(order.map((key) => [key, info[key]])))
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(sorted, null, 2)}\n`)
  console.log(`index → ${join(outDir, 'index.json')}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
