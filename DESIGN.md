# Promítač – design system

Mode: **Operate** (task UI). The projected content is the only bright thing in the room; the control UI stays a
quiet, warm graphite instrument around it.

## World
"Light is the signal." The brightest elements on the control screen are what is on the wall now and what you can
press next. Everything else recedes into warm graphite, like a dimmed sanctuary at evening. Broadcast tally
vernacular gives state colours meaning: **red = on screen now (Živě)**, **green = next (Další)**. Red and green are
never used for anything else.

## Colour tokens (dark, default)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#141210` | app background (warm graphite, not neutral black) |
| `--panel` | `#1b1916` | side panels, toolbars |
| `--raised` | `#24211d` | hover, inputs, cards |
| `--line` | `#34302a` | hairlines, borders |
| `--ink` | `#eee8de` | primary text |
| `--ink-2` | `#a8a093` | secondary text (≥ 4.5:1 on bg) |
| `--light` | `#f4ead9` | the accent: primary buttons, focus ring, active nav, selection |
| `--live` | `#f0584a` | tally red – only "on screen now" |
| `--next` | `#73c995` | tally green – only "next / preview" |
| `--warn` | `#e5b45c` | warnings (OCR uncertainty, sync problems) |

Light mode swaps to paper-white surfaces (`#f7f6f3`, `#ffffff`) with ink `#1d1b18`; the accent becomes ink.

Section colours (muted, text-on-tint chips): verse `#93a9cf`, chorus `#d6a25c`, pre-chorus `#72bdb3`,
bridge `#c39ad6`, other (intro, interlude, outro, tag, ending) `#a8a093`.

## Type
Inter Variable (bundled, full Czech diacritics) for the whole UI; tabular numerals for times and counts.
Scale (px): 12 meta · 13 small · 14 body · 16 panel title · 19 screen title · 24 hero (empty states only).
Weights: 450 body, 550 labels/buttons, 650 titles. Headings tracking −0.01em. No all-caps labels.
Projection fonts: Inter, Source Sans 3, Montserrat, Lora, Source Serif 4.

## Shape & depth
Radii by hierarchy: 4 px chips/kbd, 7 px controls, 10 px cards/slide tiles, 14 px panels/dialogs.
Depth by surface steps, not shadows; overlays (menus, dialogs) get one soft offset shadow
`0 12px 32px -8px rgb(0 0 0 / .55)`.

## Motion
State only. 120–200 ms, `cubic-bezier(.23,1,.32,1)` ease-out; buttons `scale(.97)` on press; popovers scale from
their trigger. Keyboard-driven slide changes in the control UI are instant. Projection crossfade is a theme setting
(default 280 ms). `prefers-reduced-motion` removes non-essential motion.

## Components
Buttons: primary (light fill, dark ink), secondary (raised), ghost, danger (outlined red text – not tally red
fill). Targets ≥ 32 px (≥ 44 px for live controls). Focus ring: 2 px `--light` with 2 px offset.
Slide tiles: text card with section chip, live tile framed by tally red + label "Živě", next tile by green.
Empty states teach the next action with one primary button.
