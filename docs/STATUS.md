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
| 7 | Design polish + přístupnost + screenshoty | ⏳ |
| 8 | Buildy Mac/Win v CI + dokumentace | ⏳ workflow hotový, běh v Actions ověřit |
| 9 | P2 – volitelná AI pro import | ✅ (Gemini, vypnuto ve výchozím stavu, test s mockovaným fetch) |

## Ověřeno (jak)

- **Unit testy (Vitest):** `npm test` → 61 souborů, 1245 testů zelených (ChordPro parser/serializer včetně round-tripu a fuzz testu, transpozice, slajdy, auto-fit, vyhledávání, import textu se 14 golden fixtures a kontrolou neměnnosti textu, OpenLyrics, Bible odkazy/pasáže/XML formáty a přibalená data, sync engine, sync přes souborové repozitáře mezi dvěma simulovanými počítači včetně konfliktních kopií, úložiště, záloha/obnova včetně zip-slip, live stavový automat a klávesy, výpočet monitoru výstupu).
- **OCR přesnost:** `npm run test:ocr` (Tesseract.js v Node, stejné traineddata a stejný postup jako v aplikaci) na fixtures vyrenderovaných Playwrightem:

  | Fixture | Text (znaky) | Akordy na správné slabice |
  |---|---|---|
  | chleb-a-vino (simulovaná fotka: 2° natočení, rozmazání, šum) | 99,73 % | 100 % (26) |
  | pisen-poutnika (DejaVu Sans) | 100 % | 100 % (29) |
  | svetlo-nad-udolim (Liberation Serif) | 100 % | 100 % (36) |

  Cíl ze zadání (≥ 97 % / ≥ 90 %) splněn. Navíc PDF s textovou vrstvou i DOCX dávají přesně ground truth.
- **Supabase migrace + RLS:** `bash scripts/test-migrations.sh` na lokálním PostgreSQL 16 se stubem schémat `auth`/`storage`; 13 kontrol (izolace sborů, role, pozvánky, poslední správce, anon jen keepalive, storage politiky). Migrace se aplikuje 2× (idempotence).
- **UI v prohlížeči (Playwright, mock API):** `npm run test:e2e` → 52 testů (Živě, Plán, Písně, Import včetně OCR fotky v prohlížeči, PDF a DOCX, Bible, Média, Nastavení – výstupy, motivy, obecné, záloha, AI, účet).
- **Electron e2e:** `npm run test:electron` (Playwright `_electron` pod `xvfb-run`): aplikace startuje, první spuštění vytvoří knihovnu jako `.chordpro` soubory, výstupní okno (režim „v okně", xvfb má jeden monitor) dostane slajd přes IPC, `B` zatemní výstup.

## Neověřeno / známé limity

- **Reálný Supabase projekt** – nemám přístup; ověřeno jen lokálně (SQL + RLS na Postgresu, klient proti falešnému `fetch`, sync engine proti paměťovému serveru). Přihlášení, e-mailové potvrzení a Storage upload proti skutečnému Supabase neproběhly.
- **Dva fyzické monitory** – v cloudu je jen virtuální obrazovka; logika výběru monitoru a obnovy po odpojení je pokryta unit testy, skutečné připojení/odpojení projektoru neověřeno.
- **Buildy .dmg/.exe** – workflow připravený; výsledek běhu v GitHub Actions doplním níže.
- **AI převod (Gemini)** – ověřeno jen s mockovaným API (bez klíče).
- **„I" vs „|"** – v písmu DejaVu Sans OCR čte samostatné „I" jako „|".

## Co musí udělat člověk

1. Stáhnout buildy z GitHub Actions (viz `docs/INSTALL.md`).
2. Pro sdílenou knihovnu založit Supabase projekt a spustit migraci (`docs/SUPABASE_SETUP.md`), volitelně nastavit GitHub secrets pro keepalive.
3. Vyzkoušet promítání na skutečném projektoru.
