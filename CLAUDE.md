# Promítač – instrukce pro Claude

Stavíš desktopovou promítací aplikaci pro církve (Mac + Windows). **Kompletní zadání je v `docs/SPEC.md` – přečti ho celé před začátkem.**

## Režim práce: autonomně end-to-end
- Pracuješ v cloud session bez člověka. **Neptej se, rozhoduj.** Když je něco nejasné, zvol rozumnou variantu,
  která nejlépe slouží netechnickému promítači, a zapiš ji do `docs/DECISIONS.md` (1–3 věty: co a proč).
- Skilly, které vyžadují potvrzení od uživatele (např. „take one confirmation" ve `verify-loop`), použij bez čekání –
  potvrzení nahrazuje `docs/SPEC.md`.
- Postupuj po milnících (viz níže). Po každém milníku: testy zelené, commit, push. Malé, popisné commity.
- `docs/STATUS.md` průběžně aktualizuj – když dojde kontext, další session pokračuje odtud.
- Nikdy netvrď „hotovo", co jsi neviděl fungovat (výstup testu, screenshot).

## Milníky
1. **Kostra**: Electron + Vite + React + TS + Tailwind + shadcn/ui, lint, Vitest, Playwright, CI workflow, electron-builder config.
2. **Písně**: ChordPro model, parser/serializer, generování slajdů, knihovna (soubory `.chordpro`), vyhledávání bez diakritiky, editor s náhledem.
3. **Živé promítání**: výstupní okno na zvoleném monitoru, plán bohoslužby, Živě obrazovka, klávesové zkratky, černá/smazat/logo, motivy, přechody.
4. **Import asistent**: text → ChordPro, OCR fotek (Tesseract.js, `ces`+`eng`, offline, bounding boxy pro akordy), PDF, DOCX, náhled + zvýraznění nejistých míst.
5. **Bible + Média**.
6. **Účty + sync** (Supabase, RLS, migrace, lokální režim bez připojení, keepalive workflow).
7. **Design polish** + přístupnost + výkon, screenshoty.
8. **Buildy Mac/Win v CI**, dokumentace (INSTALL, SUPABASE_SETUP, NAVOD, STATUS).
9. P2 – volitelná AI pro import (jen pokud zbyde čas).

## Skilly v `.claude/skills/` – kdy co použít
| Fáze | Skill |
|---|---|
| Plán implementace | `writing-plans` → plán ulož do `docs/plans/` |
| Provádění | `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents` (nezávislé části paralelně) |
| Parser, sync, formát písní | `test-driven-development` (nejdřív fixtures a testy) |
| Chyby | `systematic-debugging` |
| Před „hotovo" | `verification-before-completion`, `verify-loop` (doména build) |
| Review | `requesting-code-review`, `receiving-code-review` |
| Konec větve / PR | `finishing-a-development-branch` |
| Design systém, obrazovky | `frontend-design`, `impeccable` (shape/critique/polish/audit), `high-end-visual-design`, `minimalist-ui`, `design-taste-frontend`, `apple-design` |
| Detaily, interakce, animace | `emil-design-eng`, `animate`, `review-animations` |
| Volba knihoven, toasty | `pick-ui-library`, `ask-sonner` |
| Kompletní výstup bez placeholderů | `full-output-enforcement` |
| Finální vylepšení vzhledu | `redesign-existing-projects` |

Pozn.: skilly pocházejí z pluginů – odkazy typu `superpowers:xyz` uvnitř znamenají skill `xyz` v této složce.

## Ověřování v cloudu
- Logika (parser, slajdy, Bible odkazy, sync merge) → **Vitest**, cíl vysoké pokrytí. Fixtures písní používej
  jen public domain (staré chorály/hymny) nebo vymyšlené texty – žádné chráněné texty písní v repu.
- OCR test: vyrenderuj fixture písně s akordy do PNG (HTML → screenshot Playwrightem), pusť pipeline a porovnej s ground truth.
  Cíl: čistý tištěný text ≥ 97 % přesnost znaků, akordy na správné slabice ≥ 90 % (výsledky zapiš do STATUS).
- UI → renderer v prohlížeči s mockovaným IPC + Playwright screenshoty; Electron e2e přes `_electron` pod `xvfb-run`, pokud to prostředí dovolí (jinak zapiš do STATUS, že neověřeno).
- Buildy Mac/Win → GitHub Actions; pokud máš přístup k výsledkům běhu, zkontroluj je.

## Konvence
- UI texty česky v `src/**/i18n/cs.ts` (jeden zdroj). Kód, názvy a komentáře anglicky.
- TypeScript strict. Žádné tajné klíče v repu (`.env.example` ano, `.env` do `.gitignore`).
- Živé promítání nesmí čekat na síť ani na sync.
