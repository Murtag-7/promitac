# Design review (impeccable critique)

Method: dual-agent – Assessment A (design review, a separate sub-agent that read PRODUCT.md, DESIGN.md,
SPEC and every screenshot and drove the browser build) · Assessment B (deterministic detector
`detect.mjs` over `src/renderer` plus browser checks of contrast and target sizes, separate sub-agent).
The two did not see each other's output; the synthesis and fixes were done afterwards.

Target: the whole control app and the projection output, at 1280×720, 1440×900 and 1920×1080, dark and
light mode. Usage scene: a non-technical volunteer at the back of a dim church, under time pressure,
often with a clicker.

## Score before the fixes (Nielsen, 0–4)

| # | Heuristic | Score | Key issue at review time |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Red frame lit even when nothing was on the wall; tile still said "Živě" while the wall was black. |
| 2 | Match system / real world | 3 | Account page spoke developer ("Supabase URL", "Anon (public) klíč", repo path); "Smazat text" read as deleting. |
| 3 | User control and freedom | 3 | Removing a plan item was one click and permanent. |
| 4 | Consistency and standards | 3 | "Promítnout hned" primary in Písně but secondary in Bible; "Přechod" meant both gradient and transition. |
| 5 | Error prevention | 2 | Clicker and keys silently swallowed by a focused field or dialog; quick buttons jumped 56 px when an overlay toggled. |
| 6 | Recognition rather than recall | 3 | Double-click to go live was hidden; countdown field had no unit; sync state icon-only. |
| 7 | Flexibility and efficiency | 3 | No mouse way to take "Next" across items; no keyboard navigation between plan items. |
| 8 | Aesthetic and minimalist design | 3 | The brightest pixel on Živě was the Import button; "on air" repeated 5–6×. |
| 9 | Error recovery | 3 | "Monitor nepřipojen" gave no next step. |
| 10 | Help and documentation | 2 | No in-app help; shortcuts behind a dim 28 px icon. |
| **Total** | | **28/40** | **Good (bottom of the band)** |

Detector (Assessment B): 0 source findings in `src/renderer`. Browser checks found secondary text
(`--ink-3`) below 4.5:1 in both themes, tag filter chips hidden off-screen in a sideways scroller, and
several targets under 24 px (switch thumb, slider thumb, arrangement chip remove buttons, shortcuts
icon). False positives: Sonner's own layout transition and CodeMirror's internal styles.

## Priority issues and what was done

| Priority | Issue | Fix | Verified by |
|---|---|---|---|
| P1-A | Clicker dead while typing an announcement or with a dialog open – the worst valley, in front of the congregation. | One global key handler (`useLiveKeys`): PageUp/PageDown always drive the live slides on Živě (elsewhere only when something is live and focus is not in a text editor); letter keys only on Živě and never in text entry, dialogs, menus or listboxes. Alert/countdown inputs blur after submit. | e2e `the clicker keeps working while typing, Shift+arrows move between items`; unit tests for the keymap. |
| P1-B | The tally lied: red lit with nothing on the wall; "Živě" while black. | Red = only what is really on the wall; the live preview shows a chip "Černá obrazovka / Text skrytý / Logo · Zpět na slajd Esc"; tiles and cue items show "Skryto" with a hollow dot when an overlay hides the slide. | Screenshots `zive*.png`, e2e live tests. |
| P1-C | Sidebar reflowed and jumped; output status below the fold at 1280×720. | Sticky top part (live, next, quick controls) with fixed heights; alert/countdown become one-line status rows ("Na plátně: …" + "Skrýt", "Odpočet běží · 04:12" + "Zastavit"). | `zive-1280x720.png`, `zive-pozadi-upozorneni.png`. |
| P2-D | Bible slides orphaned verse numbers at line ends; footer faint. | Slides carry verses separately; numbers are typeset small and raised, glued to their first word; Czech `3,36` across chapters; one-letter prepositions never end a line and the last line is never one word (`czechNoBreaks`); footer 30→38 px at 0.85 opacity; default text 96→108 px. | Unit tests in `passage.test.ts`, `text.test.ts`; `vystup-bible.png`. |
| P2-E | Account page was a developer wall. | Reframed as "Sdílená knihovna sboru": one connection code (`PROMITAC-…`, carries address, public key and the church invite, which is then prefilled); URL/key under "Pokročilé – pro správce". | Unit tests `connectionCode.test.ts`; e2e `settings-account.spec.ts` (7 tests). |
| P2 | No help. | Help button in the top bar and F1: four-step guide and all live shortcuts as key caps; the same list in the live popover. | e2e `help opens from the top bar and with F1`; `napoveda.png`. |
| P2 | Brightest pixel on Živě was Import. | Import is secondary on Živě (primary elsewhere); Toaster moved to bottom centre, away from the live preview. | `zive.png`. |
| P2 | Remove plan item was permanent. | Toast "„…“ odebráno z plánu" with "Vrátit". | e2e `a removed item can be put back from the toast`. |
| P2 | Mixed action emphasis. | "Přidat do plánu" is primary in the song editor and Bible (and first in the media menu); "Promítnout hned" secondary. Plan add bar has one style and a "Přidat:" label. | `pisne-editor.png`, `plan.png`. |
| P2 | Missing mouse/keyboard paths. | Next preview is clickable ("Promítnout další"); ▶ button on each cue item; Shift+↓/↑ between plan items; one section chip per section with ×count, jumping to the next occurrence. | Unit tests `state.test.ts`, `keymap.test.ts`; e2e. |
| P3 | Copy and small things. | "Smazat text" → "Skrýt text"; "Přechod" → "Barevný přechod"; countdown field with "min"; sync indicator says "Offline" / "Chyba sync" in words; long plan date opens the date picker; output problems get "Nastavit"; settings pages left-aligned. | e2e `the long date in the header changes the plan date`; screenshots. |
| Audit | Contrast and targets. | `--ink-2/--ink-3` raised to ≥ 4.5:1 in both themes, light-mode tally colours darkened; switches 44×24, slider thumbs 20 px, chip remove buttons 24 px, shortcuts button 32 px; tag filters wrap with "+ n další" instead of scrolling sideways. | `zive-svetly.png`, `pisne-editor.png`. |

## Left as is (deliberately)

- **Raw ChordPro in the song editor.** The file format is the product's single source of truth and the
  spec asks for an editor with preview; the editor highlights directives and chords, shows a one-line
  syntax hint and the slide preview updates live. A form-based editor would hide what is saved.
- **Import is a sheet over Živě.** It no longer competes visually, and the clicker keeps working while it
  is open, so it can stay a sheet.
- **Theme editor density** (15+ controls) – acceptable for a settings surface.

The screenshots in `docs/screenshots/` were regenerated after the fixes (`npm run screenshots`).
