# Rozhodnutí (DECISIONS)

Rozhodnutí, která jsem udělal sám, protože je zadání neurčovalo. Každé 1–3 věty: co a proč.

## Obecné

- **Název zůstává „Promítač".** Je česky srozumitelný, popisuje přesně, co aplikace dělá, a netechnický dobrovolník hned ví, co spustit. Jiné názvy (např. „Světlo", „Žalm") by byly víc „značka" než nástroj.
- **Verze nástrojů:** Electron 44 (o verzi starší než nejnovější 45, která vyšla teprve před týdnem – stabilita při bohoslužbě je víc než novinky), electron-vite 6, Vite 8, React 19, TypeScript 5.9 (typescript-eslint zatím nepodporuje TS 6/7), Tailwind 4, Vitest 5, Playwright 1.63.0 (shoda s Chromiem předinstalovaným v cloudu).
- **shadcn/ui komponenty píšu ručně ve stylu shadcn nad balíčkem `radix-ui`** (CLI shadcn stahuje z internetu; výsledek je stejný – zdrojáky komponent v repu).
- **Vlastní protokol `app://` místo `file://`.** Tesseract.js i pdf.js načítají soubory přes `fetch`, což s `file://` v Chromiu nefunguje; `app://` navíc umí HTTP Range pro přehrávání videí na pozadí.
- **Main proces je ESM bundle (`out/main/index.js`), preload je CJS (`index.cjs`)**, protože sandboxovaný preload ESM nepodporuje.

## Formát písní (ChordPro)

- **Identita písně je uvnitř souboru** jako vlastní direktivy `{x_id: …}` a `{x_updated: …}` (další: `{x_lines_per_slide}`, `{x_theme}`). Soubor tak zůstává čitelný pro jiné programy (neznámé `x_` direktivy ignorují) a při přejmenování/zkopírování se neztratí vazba na plány a synchronizaci. Soubor přidaný ručně bez `x_id` dostane id při načtení.
- **Název souboru** = `slug(název).chordpro`, při kolizi `-2`, `-3`; při změně názvu písně se soubor přejmenuje. Smazaná píseň se přesune do `library/trash/` (lze ji ručně vrátit) a zapíše se „tombstone" kvůli synchronizaci.
- **Prázdný řádek uvnitř sekce = vynucený konec slajdu.** Umožňuje ručně rozdělit sekci bez dalších značek. Řádky jen s akordy (předehra) se na plátno nepromítají.
- **Rozdělení na slajdy je vyvážené:** sekce s 5 řádky při limitu 4 → 3 + 2 (ne 4 + 1). Výchozí limit 4 řádky, nastavitelné globálně i u písně.
- **Opakované meta direktivy:** při opakování `{title}`, `{key}`, `{arrangement}`, `{x_id}` apod. platí první výskyt. Prázdná hodnota (`{artist: }`) znamená „nenastaveno". Neplatné `{x_lines_per_slide}` se nepoužije, ale zachová se v `meta.extra`.
- **Hodnota u začátku sekce:** hodnota, která není id (např. `{soc: Refrén}`), se bere jako popisek ve stylu ChordPro 6 a id se doplní automaticky; duplicitní id dostane další volné (C → C2).
- **Komentáře mimo sekce** se připojí k následující sekci, jinak k poslední; bez sekcí se uloží do `meta.extra`, aby se neztratily. Bloky `{start_of_tab}`/`{start_of_grid}` se zachovají doslovně (na konci souboru) a nikdy se nepromítají.
- **Notace akordů:** německá/česká notace se pozná podle `H`, německých posuvek (`Fis`, `Es`) nebo tóniny. V německé notaci se po transpozici píše `B` (= Bb) a `H`. Transpozice o oktávu vrací akordy beze změny.
- **Id slajdu** je `<sekce>#<výskyt>.<část>` (např. `C#1.0`) – podle něj Živě pozná začátky sekcí pro skoky klávesami.
- **Parser nikdy nevrací „prázdnou náhradu" při chybě** – kdyby se něco nečekaně rozbilo, soubor se v knihovně přeskočí (a nezmizí), místo aby se přepsal prázdnou písní.

## Živé promítání

- **Klávesa B = černá obrazovka** (běžná konvence presentérů, klikry posílají „B" nebo „."). Proto most (bridge) je **M** („most"), refrén **R**, předrefrén **P**, sloka **V + číslo** nebo jen číslo, předehra **I**, dohra **O**, závěr **E**, tag **T**. **C** = smazat text, **L** = logo, **Esc** = zrušit černou/logo/smazání.
- **Šipka dál na posledním slajdu** přejde na první slajd další položky plánu (a zpět na poslední slajd předchozí) – operátor nemusí sahat na myš.
- **„Promítnout hned"** z Písní/Bible přidá položku do aktuálního plánu za právě promítanou a pošle ji na plátno – plán tak odpovídá tomu, co se opravdu promítalo.
