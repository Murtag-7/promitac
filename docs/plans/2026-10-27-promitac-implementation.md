# Promítač – implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktopová promítací aplikace pro církve (Mac + Windows) podle `docs/SPEC.md`: knihovna písní v ChordPro, plán bohoslužby, živé promítání na druhý monitor, motivy, Bible, média, účty se sdílenou knihovnou (Supabase) a offline asistent importu písní (text, fotka, PDF, DOCX).

**Architecture:** Electron (main + preload + renderer) postavený electron-vite. Veškerá čistá logika žije v `src/core` (bez DOM, bez Node, bez Electronu) a je testovaná Vitestem. Main proces vlastní soubory na disku, okna výstupů a synchronizaci; renderer komunikuje jen přes typované rozhraní `PromitacApi` (preload), které má i prohlížečovou mock implementaci – renderer tak jde spustit v obyčejném prohlížeči pro Playwright testy a screenshoty.

**Tech Stack:** Electron 44, electron-vite 7, Vite 8, React 19, TypeScript 5.9 (strict), Tailwind 4 + vlastní shadcn-style komponenty nad `radix-ui`, zustand, MiniSearch, CodeMirror 6, dnd-kit, Tesseract.js 7 (+ `@tesseract.js-data/ces|eng` best_int), pdfjs-dist, mammoth, @xmldom/xmldom, fflate, @supabase/supabase-js, Vitest 5, Playwright 1.63.0 (shoda s předinstalovaným Chromiem), electron-builder 26.

**Spec:** `docs/SPEC.md` (+ pravidla v `CLAUDE.md`)

## Global Constraints

- UI jen česky; všechny texty v `src/renderer/src/i18n/cs.ts` (jediný zdroj). Kód, identifikátory a komentáře anglicky.
- TypeScript `strict: true`. `src/core/**` nesmí importovat `electron`, `node:*`, `react` ani používat DOM typy (vynucuje `tsconfig.core.json` + ESLint `no-restricted-imports`).
- Živé promítání nesmí čekat na síť ani na sync; sync běží v main procesu asynchronně a jeho chyba nesmí ovlivnit výstup.
- Knihovna písní = složka `.chordpro` souborů v datové složce aplikace; plány, motivy, metadata médií, nastavení = JSON.
- Vyhledávání bez ohledu na diakritiku („zehnej" najde „Žehnej").
- Asistent importu **nemění text** – jen převádí formát. Odstranit se smí pouze značky sekcí, značky opakování, řádky akordů (převedené na inline akordy) a hlavička (název/autor).
- Akordy se ukládají vždy, na plátno pro diváky se nikdy nepromítají.
- Akordová notace: `H`, `B`, `Ami`, `Emi`, `Hmi`, `C7`, `Dsus4`, `G/H`, `Cmaj7`, `F#m`, `Bb`, `(G)`.
- OCR: Tesseract.js, jazyky `ces` + `eng`, traineddata přibalená v aplikaci (offline), slova s bounding boxy, zarovnání akordů podle x-souřadnice.
- Bible: přibalit jen public domain (Bible kralická 1613 + KJV Pure Cambridge Edition); import vlastního překladu Zefania XML / OSIS / USFX.
- Žádné tajné klíče v repu (`.env.example` ano). Service key Supabase nikdy do aplikace.
- Fixtures písní jen public domain nebo vymyšlené texty.
- Build: electron-builder; `.dmg` arm64 + x64 na `macos-latest`, `.exe` NSIS na `windows-latest`, `workflow_dispatch` + tag `v*`; macOS ad-hoc podpis.
- Rozložení Živě funguje od 1280×720 po 4K; ovládací UI tmavé ve výchozím stavu.
- Rozhodnutí udělaná bez zadání → `docs/DECISIONS.md`; stav → `docs/STATUS.md`.

## Review Focus

1. **Text z jiných zdrojů má „špinavé" znaky** – CRLF, tabulátory, nedělitelné mezery, NFD diakritika (vložení z macOS/PDF), BOM. Import i vyhledávání musí dát stejný výsledek jako pro čisté NFC/LF. → test `importText normalizes CRLF/NBSP/NFD/BOM` (Task 4.2) a `search finds NFD-stored text` (Task 2.3).
2. **Monitor se odpojí/připojí uprostřed bohoslužby, nebo je jen jeden monitor** – výstup se nesmí pokusit otevřít přes ovládací okno, po připojení se má sám obnovit s posledním snímkem. → testy `resolveOutputDisplay` (Task 3.2).
3. **Extrémně dlouhé řádky / mnoho řádků v sekci / prázdné sekce** – nic se neusekne, auto-fit zmenší písmo, slajdy se dělí vyváženě. → testy `fitFontSize` a `splitLinesBalanced` (Tasks 2.2, 3.4).
4. **Poškozené nebo cizí soubory** – ChordPro s neznámými direktivami, neuzavřenou sekcí, prázdný soubor, rozbitý JSON plánu, soubor bez `{x_id}`. Aplikace musí naběhnout, poškozený soubor přeskočit a zachovat (nepřepsat). → testy repozitářů (Task 2.4) a parseru (Task 2.1).
5. **Supabase nedostupné / špatné údaje / posun hodin mezi počítači** – sync ukáže chybu, nic nespadne, nevyhozená promise neshodí main, konflikt u písně vytvoří kopii. → testy `SyncEngine` s padajícím remote a s konfliktem (Task 6.2).

---

## Struktura souborů

```
electron.vite.config.ts        # main/preload/renderer build
vite.web.config.ts             # renderer v prohlížeči (mode "web", mock API)
config/renderer.shared.ts      # sdílená renderer konfigurace (aliasy, pluginy)
tsconfig.json / tsconfig.node.json / tsconfig.web.json / tsconfig.core.json
vitest.config.ts               # unit testy (node), projekt "ocr" zvlášť
playwright.config.ts           # UI testy v prohlížeči + screenshoty
playwright.electron.config.ts  # Electron e2e pod xvfb
electron-builder.yml
build/                         # ikony, entitlements, afterPack (ad-hoc podpis)
resources/bibles/*.json.gz     # přibalené překlady (generuje scripts/build-bibles.mjs)
scripts/prepare-assets.mjs     # kopíruje tesseract core + traineddata do src/renderer/public/ocr (gitignored)
scripts/build-bibles.mjs
scripts/render-fixtures.mjs    # HTML → PNG/PDF fixtures (Playwright)
supabase/migrations/*.sql, supabase/tests/*.sql, scripts/test-migrations.sh
src/core/
  chordpro/ model.ts chords.ts parse.ts serialize.ts transpose.ts sections.ts
  slides/ generate.ts fit.ts
  search/ normalize.ts songIndex.ts
  import/ detect.ts chordLine.ts markers.ts textToSong.ts importText.ts layout.ts pdfWords.ts docx.ts openlyrics.ts plaintext.ts extractor.ts
  ocr/ image.ts preprocess.ts
  bible/ books.ts reference.ts passage.ts formats/{zefania,osis,usfx}.ts model.ts
  plan/ model.ts templates.ts
  theme/ model.ts defaults.ts
  media/ model.ts
  live/ state.ts keymap.ts frame.ts
  settings/ model.ts
  sync/ model.ts merge.ts engine.ts
  util/ id.ts slug.ts text.ts
src/shared/ api.ts (PromitacApi + typy přenášené přes IPC), ipcChannels.ts
src/main/ index.ts paths.ts protocol.ts ipc.ts displays.ts outputWindows.ts controlWindow.ts
  storage/ jsonFile.ts songsRepo.ts collectionRepo.ts mediaRepo.ts bibleRepo.ts settingsRepo.ts backup.ts seed.ts
  sync/ supabaseRemote.ts syncService.ts authStorage.ts
src/preload/ index.ts
src/renderer/ index.html
  src/ main.tsx App.tsx output/OutputApp.tsx
    i18n/cs.ts
    api/ client.ts mock/{index.ts,seed.ts,bus.ts}
    store/ library.ts plans.ts themes.ts media.ts settings.ts live.ts sync.ts ui.ts
    components/ui/*            # Button, Input, Dialog, Popover, Select, Tabs, Tooltip, Switch, Slider, ScrollArea, DropdownMenu, Kbd, Badge
    components/ ProjectionView.tsx SlideThumb.tsx SectionBadge.tsx EmptyState.tsx AppShell.tsx SyncIndicator.tsx
    features/ live/ plan/ songs/ bible/ media/ settings/ import/
tests/fixtures/ songs/ import/ ocr/ pdf/ docx/ openlyrics/ bible/
tests/e2e/*.spec.ts            # Playwright (prohlížeč, mock API)
tests/electron/*.spec.ts       # Playwright _electron
.github/workflows/ ci.yml build.yml supabase-keepalive.yml
```

## Klíčové typy (definuje Task 1.2, ostatní je jen používají)

```ts
// src/core/chordpro/model.ts
export type SectionType = 'verse'|'chorus'|'prechorus'|'bridge'|'intro'|'interlude'|'outro'|'tag'|'ending';
export interface Segment { chord: string | null; text: string }           // akord stojí před textem
export type SongLine = { kind: 'lyrics'; segments: Segment[]; source?: number } | { kind: 'comment'; text: string };
export interface SongSection { id: string /* "V1","C","B","P","I","M","O","T","E" */; type: SectionType; label?: string; lines: SongLine[] }
export interface SongMeta { title: string; artist?: string; key?: string; ccli?: string; copyright?: string; tags: string[]; extra: Array<[string, string]> /* neznámé direktivy, zachovat */ }
export interface Song { id: string; meta: SongMeta; sections: SongSection[]; arrangement: string[]; linesPerSlide?: number; themeId?: string; updatedAt: string; }
// Vlastní direktivy aplikace v souboru: {x_id}, {x_updated}, {x_lines_per_slide}, {x_theme}

// src/core/slides/generate.ts
export type SlideKind = 'song'|'bible'|'text'|'media'|'blank';
export interface Slide { id: string; kind: SlideKind; lines: string[]; sectionId?: string; sectionType?: SectionType; footer?: string; title?: string; mediaId?: string; }

// src/core/theme/model.ts
export interface Theme { id; name; builtIn?: boolean;
  background: { kind:'color'; color: string } | { kind:'gradient'; from: string; to: string; angle: number } | { kind:'image'|'video'; mediaId: string; fallbackColor: string };
  dim: number;  // 0–0.9 ztmavení pozadí
  text: { font: FontId; weight: number; color: string; maxSize: number; minSize: number; autoFit: boolean; lineHeight: number; uppercase: boolean; align: 'left'|'center'|'right'; vAlign: 'top'|'center'|'bottom'; shadow: number; outline: number; outlineColor: string };
  safeMargin: number;   // % z šířky/výšky
  footer: { position: 'top'|'bottom'; size: number };
  transition: { kind: 'fade'|'none'; durationMs: number }; updatedAt: string }
// velikosti v px vůči virtuálnímu plátnu 1920×1080

// src/core/plan/model.ts
export type PlanItem =
  | { id; type:'song'; songId: string; arrangement?: string[] }
  | { id; type:'bible'; reference: string; translationId: string }
  | { id; type:'media'; mediaId: string }
  | { id; type:'text'; title: string; body: string }
  | { id; type:'blank' };
export interface ServicePlan { id; title: string; date: string /* YYYY-MM-DD */; isTemplate: boolean; items: PlanItem[]; updatedAt: string }

// src/core/live/frame.ts – co dostane okno výstupu
export interface OutputFrame { slide: Slide | null; theme: Theme; overlay: 'none'|'black'|'clear'|'logo'; logoMediaId?: string;
  backgroundOverride?: Theme['background']; alert: { text: string } | null; timer: { endsAt: number; label: string } | null; seq: number }
```

`PromitacApi` (src/shared/api.ts) – jmenné prostory: `songs` (list/save/remove nad `SongFile {id, content, updatedAt}`), `plans`, `themes` (list/save/remove), `media` (list/importPaths/remove/url), `settings` (get/update), `displays` (list/onChange), `output` (setFrame/onFrame/onStatus/identify/setWindowed), `bible` (listTranslations/load/importFile), `backup` (exportZip/importZip), `sync` (getStatus/onStatus/configure/signUp/signIn/signOut/createOrg/joinOrg/getOrg/syncNow), `app` (version/platform/openDataFolder/getPathForFile). Mock (`api/mock`) implementuje totéž v paměti + `localStorage`, výstup přes `BroadcastChannel`.

---

## Milník 1 – Kostra

### Task 1.1: Projekt, build, lint, testy, CI

**Files:** `package.json`, `electron.vite.config.ts`, `vite.web.config.ts`, `config/renderer.shared.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `vitest.config.ts`, `playwright.config.ts`, `playwright.electron.config.ts`, `electron-builder.yml`, `build/afterPack.cjs`, `.github/workflows/ci.yml`, `.env.example`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/{main.tsx,App.tsx,styles.css}`, `src/renderer/src/i18n/cs.ts`, `scripts/prepare-assets.mjs`, `tests/e2e/smoke.spec.ts`, `tests/electron/smoke.spec.ts`, `src/core/util/id.test.ts`

- [ ] Nainstalovat závislosti (verze ze Tech Stack; `@playwright/test@1.63.0` přesně). Skripty: `dev`, `dev:web`, `build`, `build:web`, `typecheck` (node+web+core), `lint` (eslint + prettier --check), `test` (vitest run), `test:ocr`, `test:e2e` (playwright web), `test:electron` (xvfb-run playwright electron), `dist:mac`, `dist:win`, `prepare-assets` (spouští se v `predev`, `prebuild`, `pretest:e2e`).
- [ ] Minimální main (okno 1440×900, min 1280×720, tmavé pozadí `#0d0e10`), preload s `contextBridge.exposeInMainWorld('promitac', api)`, renderer „Promítač" shell.
- [ ] Test `tests/e2e/smoke.spec.ts`: web build načte stránku, `getByRole('navigation')` obsahuje „Živě", „Plán", „Písně", „Bible", „Média", „Nastavení".
- [ ] Test `tests/electron/smoke.spec.ts`: `_electron.launch` → první okno má titulek „Promítač".
- [ ] Ověřit: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run test:electron` – vše zelené.
- [ ] CI `ci.yml` (push + PR): ubuntu, `npm ci`, typecheck, lint, test, test:ocr, `npx playwright install --with-deps chromium`, test:e2e, test:electron.
- [ ] Commit `chore: scaffold electron-vite app with lint, tests and CI`, push.

### Task 1.2: Core typy a utility

**Files:** `src/core/{chordpro/model.ts,theme/model.ts,theme/defaults.ts,plan/model.ts,media/model.ts,settings/model.ts,live/frame.ts}`, `src/core/util/{id.ts,slug.ts,text.ts}` + testy, `src/shared/api.ts`.

- [ ] Testy: `newId()` vrací UUID v4; `slugify('Žehnej, duše má?')` → `zehnej-duse-ma`; `safeFileName` odstraní `<>:"/\|?*` a rezervovaná jména Windows (`CON`, `NUL`…); `normalizeInputText('﻿a\r\nb c')` → `'a\nb c'` a převede NFD → NFC; `expandTabs('a\tb', 8)` → `'a       b'`.
- [ ] Implementovat, `defaults.ts` obsahuje 4 vestavěné motivy (`classic-dark`, `warm-light`, `night-blue` gradient, `stage-contrast`) – výchozí `classic-dark` (bílý Inter 600, stín, max 96 px, min 44 px na 1080p).
- [ ] Commit.

## Milník 2 – Písně

### Task 2.1: ChordPro akordy, parser, serializer, transpozice (TDD)

**Files:** `src/core/chordpro/{chords.ts,parse.ts,serialize.ts,transpose.ts,sections.ts}` + `*.test.ts`, `tests/fixtures/songs/*.chordpro`

**Interfaces – Produces:**
- `isChord(token: string): boolean`, `parseChord(s): ParsedChord | null` (`{ root, accidental, quality, bass?, optional: boolean }`)
- `parseChordPro(text: string): Song` (nikdy nehází; neznámé direktivy do `meta.extra`; neuzavřená sekce se uzavře na konci; text mimo sekce → sloky podle prázdných řádků)
- `serializeChordPro(song: Song): string`
- `transposeSong(song, semitones, notation?: 'german'|'english'): Song`, `detectNotation(song): 'german'|'english'` (german pokud se vyskytne kořen `H`)
- `sectionDefaults(type): { prefix: string }` a `nextSectionId(type, existing: string[]): string` (`V1`,`V2`…, `C`, `C2`, `B`, `P`, `I`, `M`, `O`, `T`, `E`)
- `stripChords(line: SongLine): string`, `songLyricsText(song): string` (pro index)

- [ ] Testy `chords.test.ts`: platné `H B Ami Emi Hmi C7 Dsus4 G/H Cmaj7 F#m Bb (G) Am7 D/F# Asus2 Cadd9 Hm7b5 E7/G# C#mi Ebm A7sus4 Cdim Caug G6 D9 Fis Cis N.C.`; neplatné `Ahoj Bůh Hle Amen Do Emil já x Haleluja Be Ach Den Cesta A, Hej`.
- [ ] Testy `parse.test.ts`: příklad ze SPEC §3 (meta, sekce V1/C/B, `arrangement` = `['V1','C','V2','C','B','C']`, segmenty `[{chord:'G',text:'Text první '},{chord:'D',text:'sloky'}]`); krátké tvary `{soc}`/`{eoc}`/`{t:}`; `{start_of_verse: label="Sloka 1"}`; vlastní `{start_of_prechorus}`; prázdný soubor → píseň bez sekcí, název `''`; neuzavřená sekce; `{comment: …}` → řádek `comment`; CRLF/BOM vstup = stejný výsledek.
- [ ] Testy `serialize.test.ts`: round-trip `parse(serialize(parse(x))) == parse(x)` pro každý fixture v `tests/fixtures/songs`; `serialize` zachová `meta.extra` a direktivy `x_*`.
- [ ] Testy `transpose.test.ts`: `+2`: `G→A`, `H→C#` (german), `Bb→C`, `G/H→A/C#`, `Ami→Hmi`; `-1` v english: `C→B`, preferuje `b` pro tóniny s béčky (`F→E`, `Bb→A`).
- [ ] Implementovat, vše zelené, commit.

### Task 2.2: Generování slajdů (TDD)

**Files:** `src/core/slides/generate.ts` + test

**Interfaces – Produces:** `songToSlides(song: Song, opts: { linesPerSlide: number; arrangement?: string[] }): Slide[]`, `splitLinesBalanced(lines: string[], max: number): string[][]`, `textToSlides(title: string, body: string, linesPerSlide: number): Slide[]`, `DEFAULT_LINES_PER_SLIDE = 4`.

- [ ] Testy: `splitLinesBalanced` 5/4 → `[3,2]`, 6/4 → `[3,3]`, 7/4 → `[4,3]`, 9/4 → `[3,3,3]`, 1/4 → `[1]`, 0 → `[]`; `songToSlides` respektuje arrangement (refrén 3× → 3 sady slajdů se stejným obsahem, unikátní `id`), neexistující id v arrangementu ignoruje, prázdný arrangement = pořadí sekcí, akordy a komentáře nejsou v `lines`, řádky jsou `trimEnd`, prázdné sekce nevytvoří slajd.
- [ ] Implementovat, commit.

### Task 2.3: Vyhledávání bez diakritiky (TDD)

**Files:** `src/core/search/{normalize.ts,songIndex.ts}` + testy

**Interfaces – Produces:** `fold(s: string): string`; `class SongIndex { setAll(songs: Song[]); upsert(song: Song); remove(id: string); search(q: string, limit?: number): Array<{ id: string; score: number }> }`.

- [ ] Testy: „zehnej" najde „Žehnej, duše má"; hledání podle prvního řádku, textu, autora, štítku; prefix („hosp" → „Hospodine"); překlep („halelja" → „Haleluja"); NFD uložený text; prázdný dotaz → `[]` (UI pak řadí abecedně `localeCompare('cs')`).
- [ ] Implementovat (MiniSearch, `processTerm = fold`, boost title 3 / firstLine 2), commit.

### Task 2.4: Úložiště v main procesu

**Files:** `src/main/storage/{jsonFile.ts,songsRepo.ts,collectionRepo.ts,settingsRepo.ts,seed.ts}`, `src/main/paths.ts`, `src/main/ipc.ts`, `src/preload/index.ts` + testy `src/main/storage/*.test.ts` (Vitest, temp dir)

**Interfaces – Produces:** `SongsRepo { list(): Promise<SongFile[]>; save(f: SongFile): Promise<void>; remove(id): Promise<void> }` (soubor `<slug>.chordpro`, při změně názvu přejmenovat, kolize → `-2`; soubor bez `{x_id}` dostane id a přepíše se; smazání → přesun do `library/trash/` + tombstone v `library/tombstones.json`); `CollectionRepo<T extends {id}>` pro plány/motivy (jeden JSON na položku v `library/plans/`, `library/themes/`); atomický zápis (tmp + rename); poškozený JSON se přeskočí a přejmenuje na `*.corrupt` (nepřepsat).
- [ ] Testy: uložení/načtení, přejmenování, kolize názvů, poškozený soubor přeskočen a zachován, soubor bez `x_id`, smazání → tombstone, Windows-nepovolené znaky v názvu.
- [ ] První spuštění: `seed.ts` vloží ukázkové písně (vymyšlená „Ukázková píseň", PD „Amazing Grace", PD „Hospodine, pomiluj ny") a šablonu plánu „Neděle".
- [ ] Commit.

### Task 2.5: Design systém, shell, knihovna písní a editor (UI)

Před začátkem načíst skilly `frontend-design`, `impeccable` (shape), `emil-design-eng`.

**Files:** `src/renderer/src/styles.css` (tokeny), `components/ui/*`, `components/{AppShell,EmptyState,SectionBadge}.tsx`, `store/{library,settings,ui}.ts`, `api/{client.ts,mock/*}`, `features/songs/{SongsScreen,SongList,SongEditor,ChordProEditor,ArrangementEditor,SlidePreviewGrid}.tsx`, `tests/e2e/songs.spec.ts`

- [ ] Tokeny: tmavý (výchozí) a světlý režim, jedna akcentní barva, barvy sekcí (Sloka/Refrén/Předrefrén/Most/ostatní), Inter Variable offline (`@fontsource-variable/inter`).
- [ ] Knihovna: seznam + vyhledávání (fokus `Ctrl/Cmd+F`), filtry štítků, prázdný stav. Editor: CodeMirror 6 s ChordPro zvýrazněním (direktivy, akordy, značky sekcí), živý náhled slajdů, arrangement drag & drop (dnd-kit), počet řádků na slajd, motiv, transpozice ±, uložení (`Ctrl/Cmd+S`), smazání s potvrzením, export `.chordpro`/text.
- [ ] Test `songs.spec.ts`: vyhledání „zehnej" najde seed píseň „Žehnej…" (mock seed); úprava textu v editoru se projeví v náhledu; změna arrangementu přesunutím; uložení přežije reload (localStorage mock).
- [ ] Commit, push, aktualizovat `docs/STATUS.md`.

## Milník 3 – Živé promítání

### Task 3.1: Živý stav a klávesy (TDD)

**Files:** `src/core/live/{state.ts,keymap.ts}` + testy

**Interfaces – Produces:**
- `liveReducer(state: LiveState, action: LiveAction, ctx: { items: Array<{ id: string; slides: Slide[] }> }): LiveState` kde `LiveState = { itemId: string|null; slideIndex: number; overlay: 'none'|'black'|'clear'|'logo' }` a akce `goto {itemId, slideIndex}`, `next`, `prev`, `toggleOverlay {overlay}`, `cancel`, `gotoSection {type, number?}`.
- `resolveKey(e: { key: string; ctrl: boolean; meta: boolean; alt: boolean }, pending: string | null): { action: LiveAction | null; pending: string | null }`.
- [ ] Testy: `next` na posledním slajdu položky → první slajd další položky; `prev` na prvním → poslední slajd předchozí; na konci plánu zůstane; klávesy `ArrowRight`, `ArrowDown`, `PageDown`, ` ` → next; `ArrowLeft`, `ArrowUp`, `PageUp` → prev; `b`/`.` → black, `c` → clear, `l` → logo, `Escape` → cancel; `v` pak `2` → sloka 2; samotná číslice `3` → sloka 3; `r` → refrén, `m` → most, `p` → předrefrén, `i` intro, `o` dohra, `e` závěr, `t` tag; s Ctrl/Meta se nic nespouští; `gotoSection` skočí na další výskyt sekce v arrangementu za aktuální pozicí (jinak první).
- [ ] Commit.

### Task 3.2: Výstupní okna a monitory

**Files:** `src/main/{displays.ts,outputWindows.ts,protocol.ts}` + `displays.test.ts`

**Interfaces – Produces:** `resolveOutputDisplay(config: OutputConfig, displays: DisplayInfo[], controlDisplayId: number): DisplayInfo | null` (`displayId: 'auto'` = první nepřimární; zvolený monitor chybí → `null`; nikdy nevrátí monitor ovládacího okna, pokud není `windowed`); `OutputManager` (otevře okno bez rámečku přes celý monitor, posílá poslední `OutputFrame`, reaguje na `display-added/removed/metrics-changed`, po pádu rendereru okno obnoví, `powerSaveBlocker` když je výstup aktivní); protokol `app://` (renderer soubory, `app://media/<file>` s podporou HTTP Range pro video).
- [ ] Testy `resolveOutputDisplay`: jeden monitor → `null` (bez windowed); dva → externí; zvolený odpojen → `null`; po připojení stejné id → vrátí ho; `auto` při třech monitorech → první nepřimární.
- [ ] Commit.

### Task 3.3: Plán bohoslužby (core + UI)

**Files:** `src/core/plan/{model.ts,templates.ts}` + test, `store/plans.ts`, `features/plan/*`, `tests/e2e/plan.spec.ts`

**Interfaces – Produces:** `createPlan(date, title?)`, `planFromTemplate(tpl, date)`, `duplicatePlan(plan, date)` (nová id položek), `moveItem(plan, from, to)`.
- [ ] Testy core: duplikace mění všechna id, šablona → `isTemplate:false`, `moveItem`.
- [ ] UI: seznam plánů podle data (nadcházející nahoře), editor položek s drag & drop, přidání písně (vyhledání), pasáže Bible, média, textu/oznámení, prázdného slajdu; šablony; „Duplikovat"; „Promítat" → Živě.
- [ ] Test e2e: vytvořit plán, přidat 2 písně a oznámení, přetáhnout pořadí, otevřít v Živě.
- [ ] Commit.

### Task 3.4: Živě obrazovka, ProjectionView, motivy, přechody

**Files:** `src/core/slides/fit.ts` + test, `components/ProjectionView.tsx`, `output/OutputApp.tsx`, `store/live.ts`, `features/live/*`, `features/settings/{ThemesPanel,OutputsPanel}.tsx`, `tests/e2e/live.spec.ts`

**Interfaces – Produces:** `fitFontSize({ lineWidthsAt1px: number[]; lineHeight: number; availWidth: number; availHeight: number; min: number; max: number }): { size: number; wrap: boolean }`.
- [ ] Testy `fitFontSize`: krátký text → `max`; dlouhý řádek → menší než max, `wrap:false`; když by byl pod `min` → `wrap:true` a `size === min`; výška limituje při 8 řádcích.
- [ ] ProjectionView: virtuální plátno 1920×1080 škálované, auto-fit přes canvas `measureText` po `document.fonts.ready`, crossfade dvou vrstev (`transition.durationMs`), overlay černá/smazat/logo, upozornění (pás dole), odpočet, reference u Bible.
- [ ] Živě: vlevo plán, uprostřed mřížka slajdů s barevnými štítky sekcí, vpravo Další/Živě náhled + stav výstupů, tlačítka Černá / Smazat text / Logo / Pozadí, upozornění a odpočet; klávesy z Task 3.1; indikátor ŽIVĚ.
- [ ] Nastavení: výstupy (monitory, test obrazu, okno místo fullscreenu), motivy (editor s náhledem, písma `Inter`, `Source Sans 3`, `Montserrat`, `Lora`, `Source Serif 4` přibalená).
- [ ] Test e2e: klik na slajd → náhled Živě ukazuje jeho text; `ArrowRight` posune; `b` zčerná (`data-overlay="black"`); mock výstupní okno (`?output=main` v druhé stránce) dostane stejný snímek přes BroadcastChannel; akordy se na výstupu neobjeví.
- [ ] Electron e2e: výstup v režimu okna dostane snímek přes IPC.
- [ ] Commit, push, STATUS.

## Milník 4 – Asistent importu

### Task 4.1: Akordové řádky, značky sekcí (TDD)

**Files:** `src/core/import/{chordLine.ts,markers.ts}` + testy

**Interfaces – Produces:** `isChordLine(line: string): boolean` (> 50 % tokenů jsou akordy, ignoruje `| / - – . x2 2x (2x) % |: :|`); `mergeChordLine(chords: string, lyrics: string): string` (vloží `[X]` na index znaku podle sloupce; za koncem textu doplní mezery a akord); `chordOnlyLine(chords: string): string`; `parseMarker(line: string): { type: SectionType; number?: number; rest: string; repeat?: number } | null`.
- [ ] Testy `mergeChordLine`: `('G       D', 'Text první sloky')` → `'[G]Text pr[D]vní sloky'`; akord uprostřed slova; akord za koncem; po odstranění akordů je text identický (`trimEnd`).
- [ ] Testy `parseMarker`: `R:`, `R.`, `Ref.`, `Ref:`, `Refrén`, `Chorus`, `1.`, `1)`, `Sloka 1`, `Verse 2`, `Bridge`, `Most`, `Předrefrén`, `Pre-chorus`, `Intro`, `Předehra`, `Mezihra`, `Outro`, `Dohra`, `Tag`, `Coda`; `R: Text refrénu` → `rest:'Text refrénu'`; `Ref. 2×` → `repeat:2`; `R (2x)`; běžný řádek textu → `null`; „Refrén je krásný" není značka (značka musí končit `:`/`.`/`)`/koncem řádku nebo číslem).
- [ ] Commit.

### Task 4.2: Text → Song (TDD, golden fixtures)

**Files:** `src/core/import/{detect.ts,textToSong.ts,importText.ts,plaintext.ts,extractor.ts}` + testy, `tests/fixtures/import/*.txt` + `*.expected.chordpro`

**Interfaces – Produces:** `detectTextFormat(text): 'chordpro'|'inline-chords'|'chords-over-text'|'plain'`; `importText(text: string, opts?: { uncertainWords?: UncertainWord[] }): ImportResult` kde `ImportResult = { song: Song; format; warnings: ImportWarning[]; uncertain: UncertainWord[] }`, `UncertainWord = { text: string; confidence: number; sourceLine: number }`; `songToPlainText(song): string`; `interface SongExtractor { id: 'local'|'ai'; extract(input: ExtractInput): Promise<ImportResult> }`.
- [ ] Golden fixtures (vymyšlené texty): akordy nad textem s `R:` referencí, inline `[C]`, čistý text bez akordů jen s prázdnými řádky, číslované sloky `1.`/`2.`, `Ref. 2×`, předrefrén a most, hlavička s `Autor:` / `Text a hudba:`, `Tónina: G`, ChordPro vstup (průchod), duplicitní blok = opakování refrénu.
- [ ] Testy: každý fixture → `serializeChordPro(result.song)` === expected (bez `x_id`/`x_updated`); **invariant textu**: množina řádků textu výsledku (bez akordů) = řádky vstupu bez značek, akordových řádků a hlavičky; normalizace CRLF/NBSP/NFD/BOM dá stejný výsledek; neznámý název → `warnings` obsahuje `missingTitle`.
- [ ] Commit.

### Task 4.3: OCR předzpracování a rekonstrukce rozložení (TDD)

**Files:** `src/core/ocr/{image.ts,preprocess.ts}`, `src/core/import/{layout.ts,pdfWords.ts,docx.ts}` + testy

**Interfaces – Produces:** `type Gray = { width; height; data: Uint8Array }`; `toGray(rgba: { width; height; data: Uint8ClampedArray }): Gray`, `upscale(g, factor)`, `stretchContrast(g)`, `otsuThreshold(g): number`, `binarize(g, t)`, `estimateSkew(g): number /* stupně */`, `rotate(g, deg)`, `preprocessForOcr(rgba): { width; height; data: Uint8ClampedArray }`; `OcrWord = { text; confidence; bbox: {x0,y0,x1,y1}; symbols?: Array<{ text; x0; x1 }> }`; `wordsToText(words: OcrWord[], opts?: { lowConfidence?: number }): { text: string; uncertain: UncertainWord[] }` (shlukuje řádky podle svislého překryvu, rozpozná akordové řádky, zarovná akord na znak textu podle x – symboly nebo lineární interpolace, mezery mezi slokami podle mezery > 1,6× medián výšky řádku); `pdfItemsToWords(items: PdfTextItem[], pageHeight): OcrWord[]`; `docxRawToText(raw: string): string`.
- [ ] Testy: syntetický obraz otočený o 3° → `estimateSkew` ∈ [2.5, 3.5]; Otsu na bimodálním histogramu; `wordsToText` s ručně sestavenými slovy (akord „G" nad x slabiky „vní") → `[G]` vložen před „vní"; dvě strofy s velkou mezerou → prázdný řádek; slovo s confidence 40 → v `uncertain`.
- [ ] Commit.

### Task 4.4: OCR/PDF/DOCX integrace a přesnost

**Files:** `scripts/render-fixtures.mjs`, `tests/fixtures/ocr/*.{html,png,truth.chordpro}`, `tests/fixtures/pdf/*.pdf`, `tests/fixtures/docx/*.docx`, `src/core/import/ocr.accuracy.test.ts` (projekt `ocr`), `src/renderer/src/features/import/{ocrWorker.ts,pdf.ts,docx.ts}`

- [ ] Fixtures: 3 vymyšlené písně s akordy vyrenderované Playwrightem (serif i sans, 1 mírně natočená) + PDF z HTML (`page.pdf`) + DOCX (knihovna `docx`).
- [ ] Test přesnosti (Node tesseract.js, stejná traineddata): znaková přesnost textu ≥ 97 % (1 − Levenshtein/len), akordy na správné slabice ≥ 90 %. Výsledky zapsat do STATUS.
- [ ] Test PDF (pdfjs-dist legacy v Node): text vrstva → `pdfItemsToWords` → `wordsToText` → píseň shodná s ground truth.
- [ ] Test DOCX: mammoth → `docxRawToText` → `importText` → shodné s expected.
- [ ] Commit.

### Task 4.5: Import panel (UI) + OpenLyrics

**Files:** `src/core/import/openlyrics.ts` + test + `tests/fixtures/openlyrics/*.xml`, `features/import/{ImportPanel,ImportCard,ReviewView}.tsx`, `tests/e2e/import.spec.ts`

**Interfaces – Produces:** `parseOpenLyrics(xml: string): Song` (titles, authors, verses `v1/c/b/p/i/e`, `<chord name>` i `<chord root>`, `<br/>`, `verseOrder`).
- [ ] Panel ve stylu chatu: vložení textu / přetažení fotek, PDF, DOCX, TXT, ChordPro, OpenLyrics; odpověď = karta písně (název, sekce, akordy, náhled slajdů) s **Upravit** a **Přidat do knihovny**; průběh OCR; revize vedle sebe (zdroj ↔ ChordPro ↔ slajdy) se zvýrazněním nejistých slov; detekce duplicity (stejný složený název nebo první řádek) s volbou „Nahradit / Uložit jako novou".
- [ ] Test e2e: vložení textu s akordy → karta s názvem a 3 sekcemi → Přidat → píseň v knihovně; nahrání PNG fixture → karta (OCR v prohlížeči).
- [ ] Commit, push, STATUS.

## Milník 5 – Bible + Média

### Task 5.1: Bible core (TDD)

**Files:** `src/core/bible/{model.ts,books.ts,reference.ts,passage.ts,formats/{zefania,osis,usfx}.ts}` + testy, `tests/fixtures/bible/*`, `scripts/build-bibles.mjs`, `resources/bibles/{cs-bkr,en-kjv}.json.gz`

**Interfaces – Produces:** `BibleData = { id; name; abbreviation; language; books: Array<{ id: BookId; chapters: string[][] }> }`; `BOOKS: BookInfo[]` (66, `id` USFM kód `GEN…REV`, `nameCs`, `abbrCs`, `aliases`, `nameEn`, `chapters`); `findBook(q): BookInfo | null`; `parseReference(s): BibleRef | null` (`{ book; chapter; verseStart?; chapterEnd?; verseEnd? }`); `formatReference(ref, lang?): string`; `getVerses(data, ref)`; `passageToSlides(verses, ref, { maxChars: number; verseNumbers: boolean; label: string }): Slide[]`; `parseZefania(xml)`, `parseOsis(xml)`, `parseUsfx(xml): BibleData`.
- [ ] Testy: `J 3,16`, `Jan 3:16-18`, `Ž 23`, `1K 13,4-7`, `1 Kor 13:4–7`, `J 3,16-4,2`, `Mt 5`, `1. Mojžíšova 1,1`, `zalm 23` → správný `BibleRef`; nesmysl → `null`; `formatReference` → `Jan 3,16–18`; dlouhá pasáž se dělí podle `maxChars`, verš delší než limit se dělí na hranici věty; footer `Jan 3,16 (BKR)`; malé fixtures všech tří XML formátů.
- [ ] `build-bibles.mjs` převede scrollmapper JSON (CzeBKR – Public Domain, KJVPCE – Public Domain) na kompaktní gzip JSON; licence do DECISIONS.
- [ ] Commit.

### Task 5.2: Bible a Média UI + úložiště médií

**Files:** `src/main/storage/{bibleRepo.ts,mediaRepo.ts}`, `features/bible/*`, `features/media/*`, `store/media.ts`, `tests/e2e/{bible,media}.spec.ts`

- [ ] Bible: pole odkazu s okamžitým náhledem, výběr kniha/kapitola/verš, přepínání překladu, „Přidat do plánu", „Promítnout hned"; import vlastního překladu (Zefania/OSIS/USFX).
- [ ] Média: import obrázků (JPG/PNG/WebP) a videí (MP4/WebM/MOV), mřížka, použití jako slajd / pozadí (i video smyčka), logo sboru, příznak „jen na tomto počítači" (automaticky pro > 50 MB).
- [ ] Testy e2e: `J 3,16` ukáže text BKR; přidání do plánu; obrázek v mocku jako pozadí v náhledu.
- [ ] Commit, push, STATUS.

### Task 5.3: Import/Export/Záloha

**Files:** `src/main/storage/backup.ts` + test, `features/settings/BackupPanel.tsx`

**Interfaces – Produces:** `createBackupZip(dataDir, opts: { includeMedia: boolean }): Promise<Uint8Array>`, `restoreBackupZip(zip: Uint8Array, dataDir): Promise<{ songs: number; plans: number }>` (fflate; obnova nejdřív zazálohuje současný stav do `backups/`).
- [ ] Testy: záloha → obnova do prázdné složky dá stejné soubory; ZIP bez `manifest.json` se odmítne bez zásahu do dat.
- [ ] UI: export knihovny do ZIP, obnova ze ZIP, hromadný import `.chordpro`/`.cho`/`.txt`/OpenLyrics souborů, export písně jako `.chordpro` / text.
- [ ] Commit.

## Milník 6 – Účty + sync

### Task 6.1: Supabase schéma a RLS

**Files:** `supabase/migrations/20261027000001_init.sql`, `supabase/tests/stub_auth.sql`, `supabase/tests/rls.sql`, `scripts/test-migrations.sh`

- [ ] Tabulky `orgs`, `org_members (role admin|member)`, `songs`, `plans`, `themes`, `media` (`id uuid`, `org_id`, `data/content`, `updated_at`, `deleted`, `updated_by`, `server_updated_at` nastavované triggerem); funkce `is_org_member`, `is_org_admin` (security definer); RPC `create_org(name)`, `join_org(code)`, `rotate_invite_code(org)`, `leave_org`, `remove_member`, `keepalive()`; RLS na všech tabulkách; bucket `media` + politiky `storage.objects` podle první složky = `org_id`.
- [ ] `test-migrations.sh`: lokální Postgres 16 (initdb do temp), stub `auth`/`storage` schémat, migrace, `rls.sql` ověří: člen vidí jen svůj sbor, cizí `join_org` se špatným kódem selže, member nemůže `rotate_invite_code`.
- [ ] Commit.

### Task 6.2: Sync engine (TDD)

**Files:** `src/core/sync/{model.ts,merge.ts,engine.ts}` + testy

**Interfaces – Produces:** `SyncRecord = { id; table: 'songs'|'plans'|'themes'|'media'; updatedAt: string; deleted: boolean; data: unknown; updatedBy: string }`; `mergeRecords(local, remote, base): { push; applyLocal; conflicts }`; `interface RemoteStore { pull(table, cursor): Promise<{ records; cursor }>; push(table, records): Promise<void> }`; `interface LocalStore { listChanged(table, since): Promise<SyncRecord[]>; apply(table, records): Promise<void>; getState(); setState() }`; `class SyncEngine { syncOnce(): Promise<SyncResult> }` (nikdy nehází, vrací `{ status: 'synced'|'offline'|'error', error? }`).
- [ ] Testy: novější vyhrává (LWW); smazání se propaguje; konflikt u písně (obě strany změněny od posledního syncu) → vítěz podle `updatedAt` + kopie poraženého s názvem `… (konflikt – verze z počítače X)`; remote hází `TypeError: fetch failed` → `offline`, lokální data beze změny; 401 → `error`; idempotence druhého běhu.
- [ ] Commit.

### Task 6.3: Supabase v aplikaci

**Files:** `src/main/sync/{supabaseRemote.ts,syncService.ts,authStorage.ts}`, `features/settings/AccountPanel.tsx`, `components/SyncIndicator.tsx`, `.github/workflows/supabase-keepalive.yml`

- [ ] Nastavení → Účet: připojení (URL + anon key nebo zapečené `VITE_SUPABASE_URL/ANON_KEY` při buildu), registrace/přihlášení, založení sboru / připojení kódem, členové + role (admin), odhlášení. Sync každých 60 s + 5 s po lokální změně; média do Storage do 50 MB.
- [ ] Indikátor stavu (synchronizováno / offline / chyba / lokální režim) nenápadně v liště.
- [ ] Keepalive workflow: denně, běží jen když existují secrets `SUPABASE_URL` a `SUPABASE_ANON_KEY`, volá RPC `keepalive`.
- [ ] Commit, push, STATUS.

## Milník 7 – Design polish, přístupnost, výkon

### Task 7.1: Review a polish

- [ ] Skill `impeccable` (critique + audit + polish) nad screenshoty všech obrazovek v 1280×720 a 1920×1080, dark i light; `emil-design-eng`/`review-animations` nad přechody.
- [ ] Opravit nálezy (kontrast WCAG AA, fokus viditelný, klávesová navigace, `aria-*`, velikosti klikacích ploch ≥ 32 px, prázdné stavy, chybové stavy).
- [ ] Výkon: virtualizace seznamu písní při > 300 položkách, lazy načítání Bible/OCR.
- [ ] `tests/e2e/screenshots.spec.ts` → `docs/screenshots/*.png` (Živě, Plán, Písně + editor, Import, Bible, Média, Nastavení, výstup na plátno).
- [ ] Commit, push.

## Milník 8 – Buildy a dokumentace

### Task 8.1: Buildy Mac/Win

**Files:** `electron-builder.yml`, `build/{icon.png,entitlements.mac.plist,afterPack.cjs}`, `.github/workflows/build.yml`

- [ ] `build.yml`: `workflow_dispatch`, tag `v*`, PR do `main`; `macos-latest` → `.dmg` arm64 + x64 (ad-hoc podpis v afterPack `codesign --force --deep --sign -`), `windows-latest` → NSIS `.exe` x64; upload artefaktů; na tagu GitHub Release.
- [ ] Lokálně ověřit `electron-builder --linux dir` (konfigurace projde), zkontrolovat běh v Actions přes GitHub MCP.

### Task 8.2: Dokumentace

- [ ] `docs/INSTALL.md`, `docs/SUPABASE_SETUP.md`, `docs/NAVOD.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, `README.md`.
- [ ] Commit, push.

## Milník 9 – P2 volitelná AI (jen pokud zbyde čas)

- [ ] `GeminiExtractor implements SongExtractor` (klíč v Nastavení, prompt vynucující doslovný přepis, výstup ChordPro → `importText`), přepínač „Přesnější převod pomocí AI" u fotek; test s mockovaným `fetch`.

## Závěr

- [ ] Code review celé větve (`requesting-code-review`), zapracovat.
- [ ] `verification-before-completion`: všechny testy, build, screenshoty.
- [ ] PR do `main` se shrnutím (hotové / ověřené jak / co musí udělat uživatel).
