# Instalace Promítače

Promítač je zdarma a nemá placený podpisový certifikát od Applu ani Microsoftu. Systém vás proto při prvním
spuštění varuje, že aplikace „není ověřená". Je to v pořádku – níže je přesně popsáno, co kliknout.

## Kde stáhnout

1. Otevřete repozitář na GitHubu → záložka **Actions** → workflow **Build desktop apps**.
2. Klikněte na poslední úspěšný běh (zelená fajfka).
3. Dole v části **Artifacts** stáhněte:
   - **Promitac-macOS** – obsahuje dva soubory `.dmg`:
     - `…-mac-arm64.dmg` pro Macy s čipem Apple (M1, M2, M3, M4 – většina Maců od roku 2021),
     - `…-mac-x64.dmg` pro starší Macy s procesorem Intel.
       (Nevíte? Menu  → O tomto Macu → „Čip: Apple…" = arm64, „Procesor: Intel…" = x64.)
   - **Promitac-Windows** – obsahuje instalátor `…-win-x64.exe`.
4. Artefakty jsou zabalené v ZIPu – po stažení ho rozbalte dvojklikem.

Pokud je vydaná verze (tag `v…`), najdete stejné soubory i v **Releases** na hlavní stránce repozitáře.

Build se spustí sám u každého pull requestu do `main` a u tagu `v…`. Po sloučení do `main` ho lze spustit i ručně:
Actions → **Build desktop apps** → **Run workflow** (trvá asi 10–15 minut). Artefakty jsou ke stažení 30 dní (pak build spusťte znovu).

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
