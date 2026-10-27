# Stav projektu (STATUS)

Průběžně aktualizováno po každém milníku. Další session pokračuje odtud.

## Milníky

| # | Milník | Stav |
|---|---|---|
| 1 | Kostra (Electron + Vite + React + TS + Tailwind, lint, Vitest, Playwright, CI, electron-builder) | ✅ |
| 2 | Písně (ChordPro, slajdy, knihovna, vyhledávání bez diakritiky, editor s náhledem) | ✅ |
| 3 | Živé promítání (výstupní okna, plán, Živě, klávesy, černá/smazat/logo, motivy, přechody) | ✅ |
| 4 | Import asistent (text, OCR fotek, PDF, DOCX, OpenLyrics, náhled, nejistá místa) | ✅ |
| 5 | Bible + Média + záloha | ✅ |
| 6 | Účty + sync (Supabase, RLS, migrace, lokální režim, keepalive) | ✅ kód + lokální ověření, ⚠️ bez reálného Supabase |
| 7 | Design polish + přístupnost + screenshoty | ✅ (review 28/40 → opraveno, viz [design-review.md](design-review.md)) |
| 8 | Buildy Mac/Win v CI + dokumentace | ⏳ workflow hotový, běh v Actions ověřit |
| 9 | P2 – volitelná AI pro import | ✅ (Gemini, vypnuto ve výchozím stavu, test s mockovaným fetch) |

## Ověřeno (jak)

- **Unit testy (Vitest):** `npm test` → 64 souborů, 1283 testů zelených (ChordPro parser/serializer včetně round-tripu a fuzz testu, transpozice, slajdy, auto-fit, vyhledávání, import textu se 14 golden fixtures a kontrolou neměnnosti textu, OpenLyrics, Bible odkazy/pasáže/XML formáty a přibalená data, sync engine, sync přes souborové repozitáře mezi dvěma simulovanými počítači včetně konfliktních kopií, úložiště, záloha/obnova včetně zip-slip, live stavový automat a klávesy, výpočet monitoru výstupu).
- **OCR přesnost:** `npm run test:ocr` (Tesseract.js v Node, stejné traineddata a stejný postup jako v aplikaci) na fixtures vyrenderovaných Playwrightem:

  | Fixture | Text (znaky) | Akordy na správné slabice |
  |---|---|---|
  | chleb-a-vino (simulovaná fotka: 2° natočení, rozmazání, šum) | 99,73 % | 100 % (26) |
  | pisen-poutnika (DejaVu Sans) | 100 % | 100 % (29) |
  | svetlo-nad-udolim (Liberation Serif) | 100 % | 100 % (36) |

  Cíl ze zadání (≥ 97 % / ≥ 90 %) splněn. Navíc PDF s textovou vrstvou i DOCX dávají přesně ground truth.
- **Supabase migrace + RLS:** `bash scripts/test-migrations.sh` na lokálním PostgreSQL 16 se stubem schémat `auth`/`storage`; 13 kontrol (izolace sborů, role, pozvánky, poslední správce, anon jen keepalive, storage politiky). Migrace se aplikuje 2× (idempotence).
- **UI v prohlížeči (Playwright, mock API):** `npm run test:e2e` → 58 testů (Živě včetně klikru při psaní a Shift+šipek, Plán včetně „Vrátit" po odebrání, Písně, Import včetně OCR fotky v prohlížeči, PDF a DOCX, Bible, Média, Nápověda, Nastavení – výstupy, motivy, obecné, záloha, AI, sdílená knihovna s kódem připojení).
- **Electron e2e:** `npm run test:electron` (Playwright `_electron` pod `xvfb-run`) → 5 testů: aplikace startuje, první spuštění vytvoří knihovnu jako `.chordpro` soubory, výstupní okno (režim „v okně", xvfb má jeden monitor) dostane slajd přes IPC a `B` ho zatemní, OCR fotky přímo v Electronu (worker + wasm přes `app://`, ~4 s), média se kopírují do knihovny a servírují přes `app://media`, záloha ZIP a obnova (nativní dialogy nahrazené stubem).
- **Design review:** impeccable critique (dva nezávislí sub-agenti: design review + detektor/prohlížeč) → 28/40; všechny P1 a P2 nálezy opravené, kontrast a velikosti cílů upravené, screenshoty přegenerované. Podrobně v [design-review.md](design-review.md).
- **Code review celé větve** (nezávislý reviewer, čtení po vrstvách podle rizika, nálezy reprodukované testy): 1 kritický a 7 důležitých nálezů – všechny opravené a pokryté testy (ukázková data vs. připojení dalšího počítače, souběh skenu a uložení písně, souběžné synchronizace, mazání médií ve Storage a hlášení chyb nahrávání, obnova zálohy vs. kurzory, odpočet zakrývající slajd, sync nemění promítanou položku, slučování téměř stejných bloků při importu). Z drobných opraveno: CRLF soubory, Windows-1250 v knihovně i v importu, ruční úpravy souborů se synchronizují, editor převezme verzi z jiného počítače, navigační pojistky výstupních oken, „Automaticky" s projektorem jako hlavním monitorem, chyba uložení v importu.
- **CI (GitHub Actions):** workflow CI (typecheck, lint, unit, migrace na Postgresu, OCR, e2e v prohlížeči, Electron e2e) zelený na větvi `claude/adoring-curie-tju73s`.

## Neověřeno / známé limity

- **Reálný Supabase projekt** – nemám přístup; ověřeno jen lokálně (SQL + RLS na Postgresu, klient proti falešnému `fetch`, sync engine proti paměťovému serveru). Přihlášení, e-mailové potvrzení a Storage upload proti skutečnému Supabase neproběhly.
- **Dva fyzické monitory** – v cloudu je jen virtuální obrazovka; logika výběru monitoru a obnovy po odpojení je pokryta unit testy, skutečné připojení/odpojení projektoru neověřeno.
- **Buildy .dmg/.exe** – workflow připravený; výsledek běhu v GitHub Actions doplním níže.
- **AI převod (Gemini)** – ověřeno jen s mockovaným API (bez klíče).
- **„I" vs „|"** – v písmu DejaVu Sans OCR čte samostatné „I" jako „|".
- **Záloha s médii** se skládá v paměti (fflate `zipSync`); u knihovny s mnoha GB videí může být pomalá. Soubory nad 2 GB se do zálohy nevejdou. V této verzi neřešeno; běžnou zálohu (bez médií) to neovlivňuje.
- **Obnova zálohy** připraví vše ve skryté složce, ale samotná výměna souborů není atomická; při chybě uprostřed zůstává automatická záloha „před obnovou".
- **Píseň s neplatným `{x_id}`** (ne UUID, např. ručně vepsaným) se nesynchronizuje, dokud se `x_id` neodstraní (aplikace pak přidělí nové).
- **Texty chyb synchronizace** v main procesu jsou česky v `src/core/sync/errors.ts`, ne v `cs.ts` (main nemá přístup k rendereru).

## Co musí udělat člověk

1. Stáhnout buildy z GitHub Actions (viz `docs/INSTALL.md`).
2. Pro sdílenou knihovnu založit Supabase projekt a spustit migraci (`docs/SUPABASE_SETUP.md`), volitelně nastavit GitHub secrets pro keepalive.
3. Vyzkoušet promítání na skutečném projektoru.
