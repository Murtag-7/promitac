# Rozhodnutí (DECISIONS)

Rozhodnutí, která jsem udělal sám, protože je zadání neurčovalo. Každé 1–3 věty: co a proč.

## Obecné

- **Název zůstává „Promítač".** Je česky srozumitelný, popisuje přesně, co aplikace dělá, a netechnický dobrovolník hned ví, co spustit. Jiné názvy (např. „Světlo", „Žalm") by byly víc „značka" než nástroj.
- **Verze nástrojů:** Electron 44 (o verzi starší než nejnovější 45, která vyšla teprve před týdnem – stabilita při bohoslužbě je víc než novinky), electron-vite 6, Vite 8, React 19, TypeScript 5.9 (typescript-eslint zatím nepodporuje TS 6/7), Tailwind 4, Vitest 5, Playwright 1.63.0 (shoda s Chromiem předinstalovaným v cloudu).
- **shadcn/ui komponenty píšu ručně ve stylu shadcn nad balíčkem `radix-ui`** (CLI shadcn stahuje z internetu; výsledek je stejný – zdrojáky komponent v repu).
- **Vlastní protokol `app://` místo `file://`.** Tesseract.js i pdf.js načítají soubory přes `fetch`, což s `file://` v Chromiu nefunguje; `app://` navíc umí HTTP Range pro přehrávání videí na pozadí.
- **Main proces je ESM bundle (`out/main/index.js`), preload je CJS (`index.cjs`)**, protože sandboxovaný preload ESM nepodporuje.
