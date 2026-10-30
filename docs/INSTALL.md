# Instalace Promítače

Promítač je zdarma a nemá placený podpisový certifikát od Applu ani Microsoftu. Systém vás proto při prvním
spuštění varuje, že aplikace „není ověřená". Je to v pořádku – níže je přesně popsáno, co kliknout.

## Kde stáhnout

Nejnovější verze je vždy na **https://github.com/Murtag-7/promitac/releases/latest**. Dole v části
**Assets** stáhněte soubor pro svůj počítač:

- **Windows:** `Promitac-…-win-x64.exe`
- **Mac s čipem Apple** (M1 a novější, většina Maců od roku 2021): `Promitac-…-mac-arm64.dmg`
- **Mac s procesorem Intel** (starší): `Promitac-…-mac-x64.dmg`

(Nevíte, jaký máte Mac? Menu  → O tomto Macu → „Čip: Apple…" = arm64, „Procesor: Intel…" = x64.)

### Pro správce: nová verze

1. Změny sloučit do `main`.
2. Na GitHubu **Releases → Draft a new release** → **Choose a tag** → napsat novou verzi (např. `v0.2.0`) →
   **Create new tag** → **Publish release**.
3. Workflow **Build desktop apps** sám sestaví `.dmg` a `.exe` (asi 10–15 minut) a přidá je k vydání.
   Když macOS build skončí jako „Cancelled" bez jediného kroku (GitHub nenašel volný Mac runner), stačí
   v běhu kliknout **Re-run failed jobs**; soubory se k vydání přidají po doběhnutí.

Testovací buildy vznikají i u každého pull requestu do `main` (Actions → **Build desktop apps** → běh →
**Artifacts**, ke stažení 30 dní). Pozor: po **Re-run failed jobs** ukazuje stránka běhu jen artefakty
posledního pokusu – ostatní najdete po přepnutí na **Attempt #1** vpravo nahoře.

## macOS

1. Otevřete stažený `.dmg` a přetáhněte ikonu **Promítač** do složky **Aplikace**.
2. První spuštění: ve Finderu otevřete **Aplikace**, na **Promítač** klikněte **pravým tlačítkem** → **Otevřít** →
   v dialogu znovu **Otevřít**. Příště už se spouští normálně.
3. Pokud se místo toho objeví „Promítač nelze otevřít, protože nebyl ověřen":
   **Nastavení systému → Soukromí a zabezpečení** → dole u hlášky o Promítači klikněte **Přesto otevřít**
   a potvrďte heslem.
4. Pokud se objeví „Promítač je poškozený a nelze ho otevřít" (stává se u aplikací stažených z internetu
   bez certifikátu), otevřete **Terminál** (Aplikace → Utility → Terminál), vložte tento řádek a stiskněte Enter:

   ```
   xattr -dr com.apple.quarantine "/Applications/Promítač.app"
   ```

   Pak aplikaci spusťte znovu. Příkaz jen odstraní značku „staženo z internetu", nic jiného nemění.

## Windows

1. Spusťte stažený `Promitac-…-win-x64.exe`.
2. Pokud se objeví modré okno **„Systém Windows ochránil váš počítač"**, klikněte na **Další informace** →
   **Přesto spustit**.
3. Projděte instalátor (lze zvolit složku). Na ploše a v nabídce Start vznikne zástupce **Promítač**.

## Druhý monitor / projektor

1. Připojte projektor (HDMI) a v systému nastavte **rozšířenou plochu** (ne zrcadlení):
   - macOS: Nastavení systému → Monitory → u projektoru zvolte „Rozšířit plochu".
   - Windows: klávesy **Win + P** → **Rozšířit**.
2. V Promítači: **Nastavení → Výstupy**. Výchozí volba „Automaticky (první externí monitor)" sama najde projektor.
   Tlačítkem **Test obrazu** ověříte, že obraz jde na správné plátno.
3. Když projektor během bohoslužby odpojíte a znovu připojíte, výstup se sám obnoví s aktuálním slajdem.
4. Zkouška jen s jedním monitorem: zapněte **Zobrazit v okně** – výstup se otevře jako běžné okno.

## Kde jsou data

| Systém | Složka |
|---|---|
| macOS | `~/Library/Application Support/Promítač/` |
| Windows | `%APPDATA%\Promítač\` |

Písně jsou obyčejné soubory `.chordpro` ve složce `library/songs`. Složku otevřete v aplikaci:
**Nastavení → Obecné → Otevřít složku s daty**. Zálohu celé knihovny do ZIPu uděláte v
**Nastavení → Import, export, záloha**.

## Aktualizace

Stáhněte novější build a nainstalujte ho přes starý (na Macu přepište aplikaci ve složce Aplikace).
Knihovna, plány a nastavení zůstanou zachované – jsou v datové složce, ne v aplikaci.

## Odinstalace

- macOS: přetáhněte Promítač z Aplikací do koše. Data smažete odstraněním složky uvedené výše.
- Windows: Nastavení → Aplikace → Promítač → Odinstalovat.
