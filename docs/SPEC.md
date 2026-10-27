# Promítač – produktová specifikace

Desktopová aplikace pro promítače v církvi (Mac + Windows). Vzorem je **Presenter od WorshipTools**
(https://www.worshiptools.com/en-us/presenter, přehledové video https://www.youtube.com/watch?v=RfNXVBG8Bc0).
Funkčně i strukturou se mu má podobat, navíc má **asistenta importu písní** a **sdílenou knihovnu přes účty**.

Pracovní název „Promítač" – smíš navrhnout lepší český název, rozhodnutí zapiš do `docs/DECISIONS.md`.

## 1. Pro koho a jaké principy

- Uživatelé: dobrovolníci v církvi, často netechničtí, pracují pod tlakem během bohoslužby v tmavé místnosti.
- **Jednoduchost nade vše.** Každá hlavní akce na 1–2 kliknutí. Žádné skryté režimy. Srozumitelné české popisky.
- **Spolehlivost při živém promítání.** Živé promítání nikdy nesmí záviset na internetu (offline-first).
  Pád synchronizace nebo přihlášení nesmí shodit ani zpomalit výstup na plátno.
- **Estetický design** – klidný, prémiový, moderní. Žádný kýč (vitráže, kříže jako dekorace, Comic Sans).
- UI **jen česky** (texty v jednom souboru `cs.ts`, ať se dají snadno upravit). Kód a komentáře anglicky.

## 2. Rozhodnutá architektura

| Oblast | Rozhodnutí |
|---|---|
| Platforma | **Electron + Vite + React + TypeScript** (electron-vite nebo ekvivalent). Tailwind + shadcn/ui (Radix). |
| Proč ne Tauri | Cross-build Mac/Win přes GitHub Actions je s Electronem nejjednodušší a multi-monitor API je zralé. |
| Struktura kódu | Čistá logika (formát písní, parser, slajdy, sync) v samostatném modulu bez závislosti na Electronu → testovatelné ve Vitestu. Renderer musí jít spustit i v obyčejném prohlížeči s mockovaným IPC (kvůli testům a screenshotům v cloudu). |
| Lokální úložiště | Knihovna písní = **složka souborů `.chordpro`** v datové složce aplikace (čitelné, zálohovatelné, přenositelné). Plány bohoslužeb, motivy, metadata médií = JSON. Fulltext index v paměti (např. MiniSearch), vyhledávání **bez ohledu na diakritiku** („zehnej" najde „Žehnej"). Vyhni se nativním modulům, pokud nejsou nutné. |
| Účty + sync | **Supabase** (free tier): Auth (e-mail + heslo), Postgres, Storage. Uživatel ho připojí až po buildu (viz §9). Bez připojení app plně funguje v **lokálním režimu**. |
| Build | electron-builder. GitHub Actions: lint + testy na Ubuntu; build `.dmg` (arm64 + x64) na `macos-latest` a `.exe` (NSIS) na `windows-latest`, ručně (`workflow_dispatch`) a na tag `v*`. Artefakty nahrát do Actions/Releases. |
| Podpis | Bez placeného certifikátu. macOS ad-hoc podpis (aby šlo spustit na Apple Silicon), návod na obejití Gatekeeperu / SmartScreenu v `docs/INSTALL.md`. |

## 3. Jednotný formát písně = ChordPro

Všechny vstupy (fotka, text s akordy, text bez akordů, PDF…) se převádí do **ChordPro** (`.chordpro`).
To je „jeden a stejný formát", který promítání čte.

```
{title: Název písně}
{artist: Autor}
{key: G}
{ccli: 1234567}            (volitelné)
{tags: chvály, advent}     (volitelné)
{arrangement: V1 C V2 C B C}

{start_of_verse: V1}
[G]Text první [D]sloky
{end_of_verse}

{start_of_chorus: C}
[C]Text re[G]frénu
{end_of_chorus}

{start_of_bridge: B}
...
{end_of_bridge}
```

- Typy sekcí: sloka (V1…), refrén (C), předrefrén (P), most/bridge (B), intro, mezihra, outro/dohra, tag, ending.
- `arrangement` = pořadí sekcí při promítání (opakování refrénu bez kopírování textu). Editovatelné drag & drop.
- Akordy se ukládají vždy (pro budoucí stage display / zpěvníky), **na plátno pro diváky se akordy nikdy nepromítají**.
- Akordová notace musí zvládat i českou/německou: `H`, `B`, `Ami`, `Emi`, `Hmi`, `C7`, `Dsus4`, `G/H`, `Cmaj7`, `F#m`, `Bb`, `(G)`.
- Generování slajdů: nastavitelný počet řádků na slajd (výchozí 2–4, globálně i per píseň), dlouhé řádky se nezalamují nesmyslně, auto-fit velikosti písma.
- Import/export: `.chordpro`/`.cho`, prostý text, OpenLyrics XML (import z jiných programů), ZIP záloha celé knihovny.

## 4. Asistent importu písní („chatbot") – BEZ placené AI

Panel ve stylu chatu: uživatel vloží text / přetáhne fotku(y) / soubor → asistent odpoví kartou písně
(název, sekce, akordy, náhled slajdů) s tlačítky **Upravit** a **Přidat do knihovny**.

**Zásadní požadavek: text se nemění.** Vstup už je ve finální podobě, asistent pouze převádí formát
(rozpozná sekce, akordy, strukturu). Žádné opravy, překlady, doplňování.

### Pipeline (deterministická, offline)
1. **Detekce typu vstupu**: ChordPro / inline akordy `[C]` / akordy nad textem / jen text / obrázek / PDF / DOCX / TXT.
2. **Text**:
   - řádek s akordy = řádek, kde většina tokenů odpovídá regexu akordu → akordy se podle **pozice znaku** vloží do následujícího řádku textu jako inline `[C]`;
   - sekce podle značek: `R:`, `R.`, `Ref.`, `Refrén`, `Chorus`, `1.`, `1)`, `Sloka 1`, `Verse`, `Bridge`, `Most`, `Předrefrén`, `Pre-chorus`, `Intro`, `Předehra`, `Mezihra`, `Outro`, `Dohra`, `Tag`, `Coda`; jinak podle prázdných řádků;
   - značky opakování (`R:` samotné na řádku, `(2x)`, `Ref. 2×`) → položky v `arrangement`, ne kopie textu;
   - název = první řádek / řádek před textem, autor podle běžných vzorů, jinak prázdné k doplnění.
3. **Fotka / scan**: předzpracování (stupně šedi, kontrast, zvětšení, prahování, narovnání) → **Tesseract.js** s jazyky `ces` + `eng`, traineddata **přibalená v aplikaci** (offline). Z OCR se berou slova **s bounding boxy** → rekonstrukce řádků a zarovnání akordů ke slabikám podle x-souřadnice (ne podle mezer). Pak stejný parser jako u textu. Více fotek = stránky jedné písně.
4. **PDF**: text vrstva přes pdf.js **s pozicemi** (stejné zarovnání akordů jako u OCR); naskenované PDF → vyrenderovat a OCR.
5. **DOCX**: převod na text (mammoth) → parser.
6. **Výsledek**: náhled vedle sebe (zdroj ↔ ChordPro ↔ slajdy), **místa s nízkou jistotou OCR zvýrazněná** k ruční kontrole, detekce duplicit v knihovně, jedno kliknutí uloží.

### Volitelná AI (P2, vypnutá ve výchozím stavu)
Rozhraní `SongExtractor` s poskytovatelem `local` (výchozí) a připraveným slotem pro AI
(Google Gemini – free tier klíč z AI Studia; nebo Claude). Když uživatel v Nastavení vloží klíč, u fotek se objeví
volba „Přesnější převod pomocí AI". Prompt musí vynutit doslovný přepis. Implementuj až po všem ostatním.

## 5. Struktura aplikace (navigace jako Presenter)

Hlavní záložky: **Živě · Plán · Písně · Bible · Média · Nastavení** (+ tlačítko/panel **Import písně**).

### Živě (hlavní obrazovka během bohoslužby)
- Vlevo: plán bohoslužby (cue list) – položky písní, veršů, médií, textových slajdů.
- Uprostřed: mřížka slajdů aktuální položky, štítky sekcí barevně (Sloka/Refrén/Most), klik = poslat na plátno.
- Vpravo: náhled **Další** a **Živě** (co je právě na plátně), stav výstupů, ovládání.
- Rychlá tlačítka: **Černá obrazovka**, **Smazat text** (pozadí zůstane), **Logo**, **Pozadí**.
- Klávesy: šipky/mezerník/PageUp/PageDown (další/předchozí), `B` černá, `C` smazat text, `L` logo,
  písmena sekcí (`V`+číslo, `R` refrén, `B` most…) přeskočí na sekci, `Esc` zrušit. Funguje i s presentérem (klikrem).
- Upozornění/oznámení přes plátno (např. „Rodiče dítěte č. 12…") a odpočet (timer) před začátkem.

### Plán
- Bohoslužby podle data, položky drag & drop: píseň, pasáž Bible, médium, vlastní text/oznámení, prázdný slajd.
- Šablony plánů (např. „Neděle"). Duplikace minulého plánu.

### Písně
- Knihovna se seznamem, rychlým vyhledáváním (název, první řádek, text, autor, štítky), filtry.
- Editor: ChordPro s barevným zvýrazněním + živý náhled slajdů, úprava arrangementu, počtu řádků na slajd, motivu.
- Transpozice akordů (pro uložení), historie změn nemusí být.

### Bible
- Zobrazení podle odkazu (`J 3,16`, `Jan 3:16-18`, `Ž 23`) i výběrem kniha/kapitola/verš, české zkratky knih.
- Přibalené **public domain** překlady: **Bible kralická** (1613) + anglická KJV/WEB. Ověř licenci zdroje dat a zapiš ji do `docs/DECISIONS.md`.
- ČEP, B21 apod. jsou chráněné → nepřibalovat; umožnit **import vlastního překladu** (Zefania XML / OSIS / USFX), pokud ho sbor má licencovaný.
- Delší pasáž se rozdělí na slajdy, odkaz se zobrazí na slajdu.

### Média
- Obrázky (JPG/PNG/WebP), videa (MP4/WebM/MOV kde to Chromium umí), použitelné jako slajd nebo jako pozadí (i video smyčka).
- Oznámení = obrázek nebo textový slajd. Logo sboru.
- Synchronizace médií přes Supabase Storage s limitem velikosti (free tier = 1 GB); velká videa mohou zůstat jen lokálně (příznak „jen na tomto počítači").

### Nastavení
- **Výstupy**: seznam monitorů (Electron `screen`), přiřazení výstupu k monitoru, fullscreen bez rámečku, test obrazu,
  náhled. Podpora více výstupů, každý s vlastním motivem/rozložením. Když se monitor odpojí/připojí, app se zotaví.
- **Motivy**: pozadí (barva/obrázek/video), písmo (přibalená písma s plnou českou diakritikou), velikost/auto-fit, stín/obrys, zarovnání, bezpečné okraje, pozice odkazu u Bible. Výchozí motiv musí být čitelný ze zadní řady.
- **Účet a synchronizace** (viz §6), **Import/Export/Záloha**, volitelný AI klíč (P2).

## 6. Účty a více počítačů

- Model: **Sbor (organizace)** → členové. Každý má vlastní účet (e-mail + heslo). Role: `admin` (spravuje členy, nastavení sboru) a `member` (vše ostatní).
- První uživatel vytvoří sbor; další se připojí **pozvánkovým kódem** (nebo e-mailovou pozvánkou).
- Supabase: tabulky s `org_id`, **RLS politiky** (člověk vidí jen data svého sboru). SQL migrace v `supabase/migrations/`.
- Synchronizace: lokální data jsou zdroj pravdy pro práci; každá entita má `id` (UUID), `updated_at`, `deleted`.
  Push/pull na pozadí, last-write-wins; při konfliktu u písně ponechat kopii („konflikt – verze z počítače X").
  Realtime odběr změn je bonus. Stav sync v UI (synchronizováno / offline / chyba) – nenápadně.
- Připojení: v Nastavení se zadá Supabase URL + anon key (nebo jsou zapečené při buildu přes env). Anon key je veřejný, service key **nikdy** do aplikace.
- Supabase free projekt se po týdnu nečinnosti uspí → přidej GitHub Actions workflow „keepalive" (denní ping), který se spustí jen když existují secrets.

## 7. Design

- Ovládací UI: **tmavý režim výchozí** (tmavá místnost), světlý volitelný. Klidná neutrální paleta + jeden akcent.
  Jasný, ale ne křiklavý indikátor **ŽIVĚ**. Velké klikací plochy, výrazný stav „co je teď na plátně".
- Typografie: moderní sans (Inter/Geist apod., přibalené offline, plná diakritika).
- Jemné, rychlé animace (bez zdržování operátora). Prázdné stavy s nápovědou, co udělat dál.
- Rozložení Živě musí fungovat od 1280×720 po 4K.
- Projekce: maximální čitelnost, auto-fit, žádné useknuté řádky, plynulé přechody (fade) slajdů, nastavitelné.
- Před koncem udělej design review (skill `impeccable` – critique/polish/audit) a zapracuj ho.

## 8. Priority

- **P0 (jádro)**: knihovna písní + ChordPro + editor, plán bohoslužby, Živě + výstup na 2. monitor, motivy, asistent importu (text + fotka + PDF), lokální režim, buildy Mac/Win.
- **P1**: Bible, média, účty + sync přes Supabase, upozornění/timer, OpenLyrics import, záloha.
- **P2**: volitelná AI pro import, více výstupů s různými motivy, auto-update.
- Mimo rozsah v1: stage display pro hudebníky, ovládání z mobilu, CCLI reporting, NDI/MIDI.

## 9. Co dodat na konci (kromě kódu)

- `docs/INSTALL.md` – instalace na Mac a Windows krok za krokem česky, včetně obejití varování nepodepsané aplikace.
- `docs/SUPABASE_SETUP.md` – pro netechnického člověka: založit Supabase projekt, spustit migrace, zapnout e-mail auth, vložit URL + klíč do aplikace, nastavit GitHub secrets pro keepalive.
- `docs/NAVOD.md` – krátký uživatelský manuál pro promítače (příprava plánu, promítání, import písně).
- `docs/DECISIONS.md` – všechna rozhodnutí, která jsi udělal sám.
- `docs/STATUS.md` – co je hotové, co ověřené (jak), co neověřené / známé chyby / co musí udělat člověk.
- `docs/screenshots/` – screenshoty hlavních obrazovek a ukázka výstupu na plátno.
