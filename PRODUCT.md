# Promítač – product context

## What it is
Desktop projection app for churches (macOS + Windows): song library in ChordPro, service plan, live projection
to a second display, themes, Bible, media, shared library through accounts, and an offline import assistant that
turns photos/PDF/text into ChordPro without changing the text.

## Who uses it
Church volunteers, often non-technical, operating under time pressure during a service in a dimmed room,
usually at the back on a laptop, sometimes with a presentation clicker. Secondary: whoever prepares the plan
during the week at home.

## Primary jobs
1. During the service: show the right slide at the right moment, recover instantly from mistakes (black screen,
   clear text), never depend on the internet.
2. Before the service: build the plan (songs, Bible passages, announcements, media) in a few clicks.
3. Grow the library: import a song from a photo, PDF or pasted text and save it after a quick review.

## Principles
- Simplicity over features; every main action in 1–2 clicks; no hidden modes.
- Plain Czech labels (UI is Czech only; texts in src/renderer/src/i18n/cs.ts).
- Live projection is sacred: offline-first, sync never blocks or slows output.
- Calm, premium, modern; no church kitsch (stained glass, decorative crosses, Comic Sans).

## Platform
desktop (Electron) – control window 1280×720 up to 4K; projection output 16:9 on any display.

## Constraints
- Dark UI by default (dark room), light optional.
- Projection: maximum legibility from the back row, auto-fit, never clipped lines, smooth fades.
