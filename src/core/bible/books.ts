import { stripDiacritics } from '../util/text'
import type { BookId } from './model'

export interface BookInfo {
  /** USFM book code ("GEN", "1CO", "REV"). */
  id: BookId
  /** 1-based position in the Protestant canon. */
  order: number
  testament: 'OT' | 'NT'
  /** Name as used by the Czech ecumenical Bible (ČEP). */
  nameCs: string
  /** ČEP-style abbreviation ("J", "1K", "Ž"). */
  abbrCs: string
  nameEn: string
  /** SBL-style abbreviation ("John", "1 Cor", "Ps"). */
  abbrEn: string
  /** Further spellings accepted by findBook (Kralice names, common abbreviations, English variants). */
  aliases: string[]
  /** Number of chapters in the KJV versification. */
  chapters: number
}

type BookRow = [
  id: BookId,
  chapters: number,
  nameCs: string,
  abbrCs: string,
  nameEn: string,
  abbrEn: string,
  aliases: string[]
]

// prettier-ignore
const ROWS: BookRow[] = [
  ['GEN', 50, 'Genesis', 'Gn', 'Genesis', 'Gen', ['1. Mojžíšova', 'Ge']],
  ['EXO', 40, 'Exodus', 'Ex', 'Exodus', 'Exod', ['2. Mojžíšova', 'Exo']],
  ['LEV', 27, 'Leviticus', 'Lv', 'Leviticus', 'Lev', ['3. Mojžíšova', 'Le']],
  ['NUM', 36, 'Numeri', 'Nu', 'Numbers', 'Num', ['4. Mojžíšova', 'Nm', 'Nb']],
  ['DEU', 34, 'Deuteronomium', 'Dt', 'Deuteronomy', 'Deut', ['5. Mojžíšova', 'Deu']],
  ['JOS', 24, 'Jozue', 'Joz', 'Joshua', 'Josh', ['Jos']],
  ['JDG', 21, 'Soudců', 'Sd', 'Judges', 'Judg', ['Soudci', 'Jdg', 'Jg']],
  ['RUT', 4, 'Rút', 'Rt', 'Ruth', 'Ruth', ['Ru']],
  ['1SA', 31, '1. Samuelova', '1S', '1 Samuel', '1 Sam', ['1 Sa', '1 Sm']],
  ['2SA', 24, '2. Samuelova', '2S', '2 Samuel', '2 Sam', ['2 Sa', '2 Sm']],
  ['1KI', 22, '1. Královská', '1Kr', '1 Kings', '1 Kgs', ['1 Král', '1 Ki']],
  ['2KI', 25, '2. Královská', '2Kr', '2 Kings', '2 Kgs', ['2 Král', '2 Ki']],
  ['1CH', 29, '1. Paralipomenon', '1Pa', '1 Chronicles', '1 Chr', ['1 Par', '1. Letopisů', '1 Kronik', '1 Ch', '1 Chron']],
  ['2CH', 36, '2. Paralipomenon', '2Pa', '2 Chronicles', '2 Chr', ['2 Par', '2. Letopisů', '2 Kronik', '2 Ch', '2 Chron']],
  ['EZR', 10, 'Ezdráš', 'Ezd', 'Ezra', 'Ezra', ['Ezdr', 'Ezr']],
  ['NEH', 13, 'Nehemjáš', 'Neh', 'Nehemiah', 'Neh', ['Nehemiáš', 'Ne']],
  ['EST', 10, 'Ester', 'Est', 'Esther', 'Esth', ['Es']],
  ['JOB', 42, 'Jób', 'Jb', 'Job', 'Job', []],
  ['PSA', 150, 'Žalmy', 'Ž', 'Psalms', 'Ps', ['Žalm', 'Žl', 'Žaltář', 'Psalm', 'Psa', 'Pss']],
  ['PRO', 31, 'Přísloví', 'Př', 'Proverbs', 'Prov', ['Přísl', 'Prv']],
  ['ECC', 12, 'Kazatel', 'Kaz', 'Ecclesiastes', 'Eccl', ['Kohelet', 'Ecc', 'Ec', 'Qoh']],
  ['SNG', 8, 'Píseň písní', 'Pís', 'Song of Solomon', 'Song', ['Píseň Šalomounova', 'Song of Songs', 'Sg', 'SoS', 'Canticles']],
  ['ISA', 66, 'Izajáš', 'Iz', 'Isaiah', 'Isa', ['Izaiáš', 'Is']],
  ['JER', 52, 'Jeremjáš', 'Jr', 'Jeremiah', 'Jer', ['Jeremiáš', 'Je']],
  ['LAM', 5, 'Pláč', 'Pl', 'Lamentations', 'Lam', ['Pláč Jeremiášův', 'La']],
  ['EZK', 48, 'Ezechiel', 'Ez', 'Ezekiel', 'Ezek', ['Eze', 'Ezk']],
  ['DAN', 12, 'Daniel', 'Da', 'Daniel', 'Dan', ['Dn']],
  ['HOS', 14, 'Ozeáš', 'Oz', 'Hosea', 'Hos', ['Ho']],
  ['JOL', 3, 'Jóel', 'Jl', 'Joel', 'Joel', []],
  ['AMO', 9, 'Ámos', 'Am', 'Amos', 'Amos', []],
  ['OBA', 1, 'Abdijáš', 'Abd', 'Obadiah', 'Obad', ['Abdiáš', 'Ob']],
  ['JON', 4, 'Jonáš', 'Jon', 'Jonah', 'Jonah', ['Jnh']],
  ['MIC', 7, 'Micheáš', 'Mi', 'Micah', 'Mic', ['Mich']],
  ['NAM', 3, 'Nahum', 'Na', 'Nahum', 'Nah', []],
  ['HAB', 3, 'Abakuk', 'Abk', 'Habakkuk', 'Hab', ['Abak', 'Hb']],
  ['ZEP', 3, 'Sofonjáš', 'Sf', 'Zephaniah', 'Zeph', ['Sofoniáš', 'Sof', 'Zep']],
  ['HAG', 2, 'Ageus', 'Ag', 'Haggai', 'Hag', ['Aggeus', 'Hg']],
  ['ZEC', 14, 'Zacharjáš', 'Za', 'Zechariah', 'Zech', ['Zachariáš', 'Zach', 'Zec']],
  ['MAL', 4, 'Malachiáš', 'Mal', 'Malachi', 'Mal', ['Ml']],
  ['MAT', 28, 'Matouš', 'Mt', 'Matthew', 'Matt', ['Mat', 'Evangelium podle Matouše']],
  ['MRK', 16, 'Marek', 'Mk', 'Mark', 'Mark', ['Mar', 'Mr', 'Evangelium podle Marka']],
  ['LUK', 24, 'Lukáš', 'L', 'Luke', 'Luke', ['Luk', 'Lk', 'Evangelium podle Lukáše']],
  ['JHN', 21, 'Jan', 'J', 'John', 'John', ['Jn', 'Joh', 'Janovo evangelium', 'Evangelium podle Jana']],
  ['ACT', 28, 'Skutky apoštolů', 'Sk', 'Acts', 'Acts', ['Skutky', 'Skutky apoštolské', 'Ac']],
  ['ROM', 16, 'Římanům', 'Ř', 'Romans', 'Rom', ['Řím', 'Ro', 'Rm']],
  ['1CO', 16, '1. Korintským', '1K', '1 Corinthians', '1 Cor', ['1 Kor', '1. Korinťanům', '1 Co']],
  ['2CO', 13, '2. Korintským', '2K', '2 Corinthians', '2 Cor', ['2 Kor', '2. Korinťanům', '2 Co']],
  ['GAL', 6, 'Galatským', 'Ga', 'Galatians', 'Gal', []],
  ['EPH', 6, 'Efezským', 'Ef', 'Ephesians', 'Eph', ['Efeským', 'Efez']],
  ['PHP', 4, 'Filipským', 'Fp', 'Philippians', 'Phil', ['Filipenským', 'Fil', 'Flp']],
  ['COL', 4, 'Koloským', 'Ko', 'Colossians', 'Col', ['Kol']],
  ['1TH', 5, '1. Tesalonickým', '1Te', '1 Thessalonians', '1 Thess', ['1. Tesalonicenským', '1. Soluňským', '1 Tes', '1 Th']],
  ['2TH', 3, '2. Tesalonickým', '2Te', '2 Thessalonians', '2 Thess', ['2. Tesalonicenským', '2. Soluňským', '2 Tes', '2 Th']],
  ['1TI', 6, '1. Timoteovi', '1Tm', '1 Timothy', '1 Tim', ['1 Ti']],
  ['2TI', 4, '2. Timoteovi', '2Tm', '2 Timothy', '2 Tim', ['2 Ti']],
  ['TIT', 3, 'Titovi', 'Tt', 'Titus', 'Titus', ['Tit']],
  ['PHM', 1, 'Filemonovi', 'Fm', 'Philemon', 'Phlm', ['Filemon', 'Flm', 'Phm']],
  ['HEB', 13, 'Židům', 'Žd', 'Hebrews', 'Heb', ['Žid', 'He']],
  ['JAS', 5, 'Jakubův', 'Jk', 'James', 'Jas', ['Jakub', 'Jakubova', 'Jak', 'Jm']],
  ['1PE', 5, '1. Petrův', '1P', '1 Peter', '1 Pet', ['1. Petrova', '1 Petr', '1 Pt']],
  ['2PE', 3, '2. Petrův', '2P', '2 Peter', '2 Pet', ['2. Petrova', '2 Petr', '2 Pt']],
  ['1JN', 5, '1. Janův', '1J', '1 John', '1 John', ['1. Janova', '1 Jan', '1 Jn', '1 Jo']],
  ['2JN', 1, '2. Janův', '2J', '2 John', '2 John', ['2. Janova', '2 Jan', '2 Jn', '2 Jo']],
  ['3JN', 1, '3. Janův', '3J', '3 John', '3 John', ['3. Janova', '3 Jan', '3 Jn', '3 Jo']],
  ['JUD', 1, 'Judův', 'Ju', 'Jude', 'Jude', ['Judova', 'Juda', 'Jud', 'Jd']],
  ['REV', 22, 'Zjevení Janovo', 'Zj', 'Revelation', 'Rev', ['Zjevení', 'Zjev', 'Apokalypsa', 'Revelation of John', 'Rv', 'Apoc']]
]

export const BOOKS: BookInfo[] = ROWS.map(([id, chapters, nameCs, abbrCs, nameEn, abbrEn, aliases], i) => ({
  id,
  order: i + 1,
  testament: i < 39 ? 'OT' : 'NT',
  nameCs,
  abbrCs,
  nameEn,
  abbrEn,
  aliases,
  chapters
}))

const BY_ID = new Map(BOOKS.map((book) => [book.id, book]))

export function getBook(id: BookId): BookInfo | undefined {
  return BY_ID.get(id)
}

interface BookKey {
  /** "1"…"5" (books of Moses) or "" */
  num: string
  /** Lowercase ASCII letters without spaces or dots ("korintskym"). */
  name: string
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5' }

/**
 * Normalise a book query: no diacritics, lowercase, dots and spaces removed, the book number
 * ("1", "1.", "I", "II.", "V") separated from the name. Returns null when nothing usable is left.
 */
function bookKey(query: string): BookKey | null {
  let s = stripDiacritics(query)
    .toLowerCase()
    .replace(/[\s.]+/g, ' ')
    .trim()
  let num = ''
  const arabic = /^([1-5]) ?(?=\p{L})/u.exec(s)
  const roman = /^(iii|ii|iv|i|v) (?=\p{L})/u.exec(s)
  if (arabic) {
    num = arabic[1]!
    s = s.slice(arabic[0].length)
  } else if (roman) {
    num = ROMAN[roman[1]!]!
    s = s.slice(roman[0].length)
  }
  const name = s.replace(/ /g, '')
  if (!/^\p{L}+$/u.test(name)) return null
  return { num, name }
}

const EXACT = new Map<string, BookInfo>()
const PREFIX_CANDIDATES: Array<{ key: string; book: BookInfo }> = []

for (const book of BOOKS) {
  for (const variant of [book.id, book.nameCs, book.abbrCs, book.nameEn, book.abbrEn, ...book.aliases]) {
    const key = bookKey(variant)
    if (!key) continue
    const full = key.num + key.name
    const existing = EXACT.get(full)
    if (existing && existing !== book) {
      throw new Error(`Book alias "${variant}" is ambiguous (${existing.id}, ${book.id})`)
    }
    EXACT.set(full, book)
    PREFIX_CANDIDATES.push({ key: full, book })
  }
}

/**
 * Find a book by Czech or English name, abbreviation or alias. Case, diacritics, dots and
 * spaces between the number and the name are ignored ("1 K", "1.K", "I K" → 1. Korintským).
 * Exact matches win; otherwise a prefix of at least three letters must identify a single book.
 */
export function findBook(query: string): BookInfo | null {
  const key = bookKey(query)
  if (!key) return null
  const full = key.num + key.name
  const exact = EXACT.get(full)
  if (exact) return exact
  if (key.name.length < 3) return null
  let found: BookInfo | null = null
  for (const candidate of PREFIX_CANDIDATES) {
    if (!candidate.key.startsWith(full)) continue
    if (found && found !== candidate.book) return null
    found = candidate.book
  }
  return found
}
