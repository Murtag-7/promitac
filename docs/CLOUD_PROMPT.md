# Prompt pro cloud session

Zkopíruj text níže do nové Claude Code session na webu (claude.ai/code) s vybraným repem `Murtag-7/promitac`.

---

Postav kompletní desktopovou aplikaci **Promítač** podle `docs/SPEC.md` a pravidel v `CLAUDE.md` – autonomně, end to end, bez dalších dotazů na mě.

Je to promítací aplikace pro církve (Mac + Windows) po vzoru Presenteru od WorshipTools: knihovna písní, plán bohoslužby, živé promítání na druhý monitor, motivy, Bible, média, účty se sdílenou knihovnou přes Supabase a **asistent importu písní**, který z fotky, PDF nebo textu (s akordy i bez) udělá jednotný soubor ChordPro připravený k promítání – bez placené AI a beze změny textu.

Postup:
1. Přečti `CLAUDE.md` a celý `docs/SPEC.md`. Prohlédni si skilly v `.claude/skills/`.
2. Použij `writing-plans` a sepiš implementační plán po milnících z `CLAUDE.md` do `docs/plans/`.
3. Implementuj milník po milníku (TDD u logiky, nezávislé části paralelně přes subagenty). Po každém milníku testy, commit, push a aktualizace `docs/STATUS.md`.
4. Design dělej podle design skillů (`frontend-design`, `impeccable`, `emil-design-eng`…). Před koncem udělej design review a zapracuj ho; ulož screenshoty do `docs/screenshots/`.
5. Nastav GitHub Actions buildy pro macOS (.dmg) a Windows (.exe).
6. Napiš `docs/INSTALL.md`, `docs/SUPABASE_SETUP.md`, `docs/NAVOD.md`, `docs/DECISIONS.md`.
7. Na konci otevři PR do `main` se shrnutím: co je hotové, jak je to ověřené a co musím udělat já (Supabase, stažení buildů).

Nejasnosti rozhoduj sám a zapisuj do `docs/DECISIONS.md`. Nic netvrď jako hotové, co jsi neviděl fungovat.
