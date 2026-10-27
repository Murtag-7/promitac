# Rozhodnutí (DECISIONS)

Rozhodnutí, která jsem udělal sám, protože je zadání neurčovalo. Každé 1–3 věty: co a proč.

## Obecné

- **Název zůstává „Promítač".** Je česky srozumitelný, popisuje přesně, co aplikace dělá, a netechnický dobrovolník hned ví, co spustit. Jiné názvy (např. „Světlo", „Žalm") by byly víc „značka" než nástroj.
- **Verze nástrojů:** Electron 44 (o verzi starší než nejnovější 45, která vyšla teprve před týdnem – stabilita při bohoslužbě je víc než novinky), electron-vite 6, Vite 8, React 19, TypeScript 5.9 (typescript-eslint zatím nepodporuje TS 6/7), Tailwind 4, Vitest 5, Playwright 1.63.0 (shoda s Chromiem předinstalovaným v cloudu).
- **shadcn/ui komponenty píšu ručně ve stylu shadcn nad balíčkem `radix-ui`** (CLI shadcn stahuje z internetu; výsledek je stejný – zdrojáky komponent v repu).
- **Vlastní protokol `app://` místo `file://`.** Tesseract.js i pdf.js načítají soubory přes `fetch`, což s `file://` v Chromiu nefunguje; `app://` navíc umí HTTP Range pro přehrávání videí na pozadí.
- **Main proces je ESM bundle (`out/main/index.js`), preload je CJS (`index.cjs`)**, protože sandboxovaný preload ESM nepodporuje.
- **Nápověda v aplikaci** (tlačítko „?" v horní liště a F1): čtyři kroky bohoslužby a všechny klávesové zkratky. Podrobný návod zůstává v `docs/NAVOD.md`.

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

- **Klávesa B = černá obrazovka** (běžná konvence presentérů, klikry posílají „B" nebo „."). Proto most (bridge) je **M** („most"), refrén **R**, předrefrén **P**, sloka **V + číslo** nebo jen číslo, předehra **I**, dohra **O**, závěr **E**, tag **T**. **C** = skrýt text („Skrýt", ne „Smazat" – nic se nemaže), **L** = logo, **Esc** = zpět na slajd (zruší černou/logo/skrytý text).
- **Šipka dál na posledním slajdu** přejde na první slajd další položky plánu (a zpět na poslední slajd předchozí) – operátor nemusí sahat na myš.
- **Klikr má přednost.** PageUp/PageDown (co posílá presentér) v záložce Živě ovládají slajdy vždy – i když je kurzor v poli upozornění nebo je otevřený import. V jiných záložkách jen když se něco promítá a kurzor není v textovém poli (PageDown v editoru písně dál posouvá text). Ostatní klávesy fungují jen v Živě mimo pole, dialogy a menu, aby psaní „b" nezatemnilo plátno.
- **Shift + ↓/↑ (a Shift + PageDown/PageUp)** skočí na první slajd další/předchozí položky plánu.
- **Červená = jen to, co je opravdu na plátně.** Když je plátno černé, s logem nebo se skrytým textem, náhled to ukazuje štítkem a dlaždice slajdu má „Skryto" místo „Živě". Zelená = jen „Další". Krémová = akce a výběr.
- **Jedna zkratka na sekci:** opakovaný refrén má jeden čip „Refrén ×3"; klik skočí na nejbližší další výskyt po aktuálním slajdu (stejně jako klávesa R).
- **Upozornění a odpočet** mají po spuštění jednořádkový stav („Na plátně: …", „Odpočet běží · 04:12") s tlačítkem Skrýt/Zastavit, aby se ovládací panel neposouval.
- **Bible na plátně:** čísla veršů jsou malá a vyzdvižená a drží se prvního slova verše; přes kapitoly se píší česky `3,36`. Jednopísmenné předložky a spojky (k, s, v, z, o, u, a, i) nikdy nekončí řádek a poslední řádek nikdy není jediné slovo (jen mezery se mění na nezlomitelné, text zůstává). Totéž pro zalomené řádky písní.
- **Větší výchozí písmo:** vestavěné motivy 108 px (min. 48), patička 38 px s vyšší sytostí – čitelnost ze zadní řady má přednost.
- **Odebrání položky z plánu** jde vrátit z toastu („Vrátit"), proto se nepotvrzuje dialogem.
- **„Přidat do plánu" je hlavní akce** u písně a Bible, „Promítnout hned" vedlejší – v přípravě je běžnější přidávat, promítnutí mimo plán je výjimka.
- **„Promítnout hned"** z Písní/Bible přidá položku do aktuálního plánu za právě promítanou a pošle ji na plátno – plán tak odpovídá tomu, co se opravdu promítalo.

## Účty a synchronizace (Supabase)

- **Kód připojení místo adresy a klíče.** Správce po založení sboru vidí „Kód pro další počítač" (`PROMITAC-` + base64url JSONu s adresou projektu, veřejným anon klíčem a kódem pozvánky). Na novém počítači stačí vložit tento jeden řádek; kód pozvánky se po přihlášení předvyplní. Kód není tajný (obsahuje jen veřejné údaje, přístup chrání účet + pozvánka + RLS). Ruční zadání URL a klíče zůstává pod „Pokročilé – pro správce" pro první nastavení.
- **Offline není chyba.** Ukazatel synchronizace „Offline" pojmenuje klidně (promítání síť nepotřebuje), jen skutečná chyba synchronizace je zvýrazněná.

- **Jeden sbor na uživatele (v1).** Model sbor → členové s rolemi `admin`/`member`; první uživatel sbor založí, další se připojí pozvánkovým kódem `XXXX-XXXX`. Kód vidí všichni členové (kdokoli z týmu může pozvat dalšího promítače), správce ho může vyměnit a spravovat členy.
- **Synchronizace porovnává tři strany:** lokální záznam, serverový a stav dohodnutý při posledním syncu. Kurzor stahování je čas serveru (`server_updated_at` z triggeru), časy počítačů se porovnávají jen při skutečném konfliktu – posunuté hodiny nezpůsobí ztrátu úprav.
- **Úprava vždy vyhraje nad smazáním**, i když je smazání novější – nikdy nepřijdeme o obsah. Kopie „(konflikt – verze z počítače X)" vzniká jen u písní; plány, motivy a média řeší „vyhrává novější".
- **Změny se nejdřív zapíší lokálně** a hned se uloží stav, teprve potom se nahrávají; při výpadku sítě další běh jen dokončí upload a nevzniknou duplicitní kopie.
- **Supabase klient bez automatického opakování, timeout 60 s;** sync se opakuje každou minutu a 5 s po lokální změně, stav „offline" se ukáže hned.
- **V databázi se nemaže natvrdo** (jen `deleted = true`), anonymní přístup má jen `keepalive()`. RLS chrání data, explicitní granty jsou druhá vrstva. Záznamy s id, které není UUID (vestavěné motivy), se nesynchronizují.
- **Média ve Storage** jako `<org_id>/<media_id>-<název bez diakritiky>` (Storage nepovoluje všechny znaky), limit 50 MB na soubor (free tier) – větší soubory zůstávají „jen na tomto počítači".
- **Chybové hlášky:** 401 → „Přihlášení vypršelo – přihlaste se znovu."; odmítnutí přes RLS při platném přihlášení → „Nemáte přístup ke knihovně sboru…".
- **Migrace ověřené lokálně** na PostgreSQL 16 se stubem Supabase schémat `auth`/`storage` (`scripts/test-migrations.sh`), migrace jsou idempotentní (spouští se 2×).

## Asistent importu (text → ChordPro)

- **Text se nemění** – smí zmizet jen značky sekcí (`1.`, `R:`, `Ref.`…), značky opakování, řádky akordů (převedou se na inline `[G]`) a hlavička (název, autor, tónina, CCLI, ©). Golden testy navíc u každého vstupu ověřují, že všechny řádky textu prošly beze změny.
- **Odsazení řádků se při importu odstraňuje.** Mezery na začátku řádku jsou jen rozložení (zarovnání pod „1." nebo pod akordy), ne text; na plátně by dělaly nesmyslné odsazení. Ostatní znaky řádku zůstávají beze změny.
- **Neoznačený blok, který se v textu opakuje, je refrén.** Když píseň nemá označený refrén a stejný blok je vypsaný dvakrát, druhý výskyt se stane opakováním v pořadí a blok dostane typ refrén (C), aby v Živě fungovala klávesa R.
- **Samotná značka (např. „R:") před prázdným řádkem** je odkaz na už definovanou sekci; pokud ještě neexistuje, platí pro následující neoznačený blok.
- **Název písně** je první řádek jen tehdy, když za ním následuje prázdný řádek a další text, meta řádky nebo značka sekce (nekončí čárkou/středníkem, max. 80 znaků). Jinak se název vezme z prvního řádku textu s varováním „doplňte název" – žádný řádek textu se tak neztratí.
- **Meta řádky** (autor, tónina, CCLI, ©) se čtou v hlavičce i na konci textu; více autorů se spojí čárkou, role („Hudba:", „Text:") se zachovají. Copyright se ukládá bez „©".
- **Značka „B" (most) vyžaduje dvojtečku nebo tečku**, protože „B", „B2" i „B (2x)" jsou zároveň akordy; samotné „R"/„V" nikdy nejsou značkou.
- **Opakování „(2x)" uprostřed bloku zůstává v textu**, na konci bloku se převede na opakování sekce v pořadí.
- **Blok jen s akordy bez značky** se stane předehrou (před první slokou), dohrou (na konci) nebo mezihrou (uprostřed).
- **OpenLyrics:** sloky se stejným jménem v jiném jazyce (překlady) se přeskočí; výsledek má formát „openlyrics", aby rozhraní ukázalo zdroj.
- **Detekce duplicit:** stejný název nebo stejný první řádek (≥ 12 znaků) bez ohledu na diakritiku a interpunkci → nabídka „Nahradit" / „Uložit jako novou".
- **Volitelná AI (P2) je vypnutá**: objeví se jen po vložení klíče Google Gemini v Nastavení. Prompt vynucuje doslovný přepis, výsledek prochází stejným parserem a stejnou kontrolou jako OCR. Bez klíče se nic neodesílá na internet.

## OCR, PDF, DOCX

- **OCR jen s jazykem `ces`, ne `ces+eng`.** Zadání uvádí `ces` + `eng`; měření ale ukázalo, že s přidaným `eng` Tesseract ztrácí českou diakritiku („Zář nad námi" → „Zar nad nami"): 97,45–99,47 % oproti 99,73–100 % s `ces`. Český model přečetl anglický text (Amazing Grace) stejně dobře jako `eng` (99,2 %). Oba modely jsou v aplikaci přibalené a jazyk je jedna konstanta `OCR_LANGUAGES` v `src/core/ocr/pipeline.ts` – návrat je změna jednoho řádku.
- **Druhé čtení akordů:** izolované „C" čte OCR jako „c", „Cc" nebo „[0". Takové tokeny na akordových řádcích se znovu přečtou samostatně s abecedou akordů a nahradí se jen platným akordem; opravené akordy se zvýrazní jako nejisté.
- **Akord se umístí před znak, jehož začátek je nejblíž levému okraji akordu**; akord v mezeře mezi slovy patří k následujícímu slovu. Pozice znaků uvnitř slova: boxy znaků z Tesseractu, jen když jsou konzistentní, jinak odhad podle typických šířek písmen (totéž u PDF).
- **Hranice slok:** prázdný řádek se vloží, když je mezera > 1,6× medián výšky řádku nebo o 0,75× výšky větší než typická mezera na stránce.
- **Neznámé tokeny na akordovém řádku** zůstanou jako `[token]` a zvýrazní se ke kontrole; taktové čáry a značky opakování se vynechají.
- **Naskenované PDF** (bez textové vrstvy) se vykreslí a projde OCR; dekodéry pdf.js (JPX/JBIG2) a standardní písma jsou přibalené offline.

## Bible a Média (UI)

- **Bible – rozložení:** knihy → text kapitoly → náhled na plátně s akcemi. Klik vybere verš, Shift+klik výběr rozšíří a přepíše odkaz v poli. Klik na slajd v náhledu jen přepne náhled – při přípravě se nic omylem nepromítne.
- **Neplatný odkaz** se ohlásí až po 0,7 s pauzy v psaní nebo po Enteru, aby nápověda neblikala u rozepsaného „J 3,".
- **Zvolený překlad se pamatuje** (`bibleTranslationId`); po odebrání importovaného překladu se vrátí Bible kralická. Položka plánu s odebraným překladem se v Živě ukáže jako „Chybí v knihovně", ne jako věčné načítání.
- **Importovaný překlad** nikdy nekoliduje id s přibaleným (`en-kjv` → `en-kjv-2`), ukládá se jako gzip JSON do `bibles/`.
- **Média:** název = původní název souboru bez přípony, soubor se ukládá jako `<id><přípona>`. Náhledy jsou `object-contain` na černé (loga s průhledností nejsou oříznutá). Všechny akce jsou v menu „⋯", klik na obrázek nic nepromítne. Smazání média, které je logem nebo pozadím na plátně, nejdřív logo/pozadí zruší. „Jen na tomto počítači" je nad 50 MB vynucené.

## Nastavení

- **Výstupy:** mapa monitorů je informativní, monitor se volí v seznamu; „Automaticky" = první monitor, který není hlavní a není na něm ovládání. Test obrazu trvá 4 s a každé okno ukáže svůj vlastní název (rozlišení více projektorů). Stav „promítá" má krémovou tečku – zelená zůstává vyhrazená pro „Další".
- **Motivy:** vestavěné motivy jsou jen ke čtení (editor nabídne „Duplikovat"); vlastní motivy se ukládají samy 300 ms po poslední změně. Náhled reaguje okamžitě bez prolnutí, skutečný přechod přehraje „Vyzkoušet přechod". Výchozí motiv nejde smazat.
- **Záloha ZIP** zrcadlí datovou složku (manifest, písně, plány, motivy, tombstones, index médií, nastavení bez tajných klíčů; soubory médií jen s volbou „Včetně médií"). **Obnova** nejdřív ověří celý archiv (cesty mimo knihovnu → odmítnout celý), uloží současný stav do `backups/pred-obnovou-<čas>.zip` a připraví soubory ve skryté složce, takže chyba zápisu knihovnu nezmění. Připojení Supabase, AI klíč a název počítače se při obnově zachovají. Obnovený stav se při další synchronizaci chová jako běžná lokální změna (vědomé rozhodnutí: obnova je záměr uživatele).
- **Import souborů písní:** soubory, které nejsou v UTF-8, se čtou jako Windows-1250 (staré české zpěvníkové soubory); stejná píseň se přeskočí a ohlásí.
- **Supabase URL** jen `https://` (výjimka `http://localhost` pro vývoj). **AI klíč** se nikdy nezobrazí celý (jen poslední 4 znaky).
