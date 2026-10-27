# Pack: build

Dashboards, sites, pages, UI components, anything that renders or runs in a browser.

**This is the domain with real ground truth.** Use it. A build verified only by
reading the code is not verified - it is proofread. The browser is the only witness
that counts.

## Read first

- `CLAUDE.md` / `AGENTS.md` in the working tree
- `.claude/launch.json` - what dev servers exist and on which port
- existing components near the change, to match conventions rather than invent them

## Depth is almost always L1+L2+L3

Anything that renders is user-facing. Default to full depth. Drop to L1+L2 only for
code that cannot be exercised in the preview yet (a helper with no call site, work
that is half-finished by design).

---

## Mechanical criteria (`mech:`)

| Rule | Command shape |
|---|---|
| Type check | `npx tsc --noEmit` or the project's script |
| Lint | `npm run lint` / `eslint <paths>` |
| Build succeeds | `npm run build` |
| Tests | `npm test` |
| No placeholders | `python "<skill-dir>/scripts/check_common.py" <files>` |
| No stray debug | grep for `console.log`, `debugger`, `TODO` in the diff |

Prefer the project's own scripts over invented commands. Read `package.json` first.

**Record the actual output.** "Lint passes" without the output is an assertion, not
a check.

---

## Reality criteria (`real:`) - the important ones

Run through the Browser pane. Sequence:

1. `preview_start` with `{name}` from `.claude/launch.json`, or `{url}`.
2. Reload if HMR is not active.
3. `read_console_messages` with `onlyErrors: true` - **any error is a failure**,
   including ones that do not visibly break anything.
4. `preview_logs` with `level: "error"` - server-side failures.
5. `read_page` - confirm the content and structure actually exist. Text you expected
   to render either appears in the tree or it does not.
6. `read_network_requests` - failed requests, 4xx/5xx, unexpected calls.
7. Interaction: `computer` click/type or `form_input`, then `read_page` to confirm
   the state actually changed. A button that looks right but does nothing passes
   every static check.
8. `resize_window` - `mobile` (375x812) and `desktop`. Reload after switching so
   load-time device gates re-run.
9. Dark mode via `resize_window` `colorScheme`, if the page is themed.
10. `computer{action:"screenshot"}` - proof for the report.

| ID | Criterion | Check |
|---|---|---|
| R-Console | Zero console errors after load and after interaction | `read_console_messages onlyErrors` |
| R-Network | No failed requests | `read_network_requests` |
| R-Renders | The expected content is present in the accessibility tree | `read_page` |
| R-Interactive | The primary interaction changes state as intended | click then `read_page` |
| R-Mobile | No horizontal body scroll at 375px | `resize_window mobile`, `read_page` |
| R-Dark | Text remains readable in the other theme | `resize_window colorScheme` |
| R-Proof | A screenshot of the final state exists | `computer screenshot` |

---

## Judge criteria (`judge:`)

The judge cannot see the page, so give it the screenshot or the accessibility tree as
the artifact. Useful judgements:

| ID | Criterion |
|---|---|
| J-Hierarchy | One clear primary action per view; the eye lands where it should |
| J-Empty | Empty, loading, and error states exist and say something useful |
| J-Consistency | Spacing, type scale, and colour come from the existing system rather than new one-offs |
| J-Copy | Labels and messages are specific, not "Something went wrong" |
| J-Reuse | No component was rebuilt that already exists in the codebase |

---

## Anti-criteria

| ID | Anti-criterion |
|---|---|
| N-Hardcoded | No hardcoded secrets, API keys, or personal data in client code |
| N-Scope | No files changed outside what the goal required |
| N-Regression | Nothing that worked before the change is broken now |
| N-Fake | No mock data left standing in for a real integration without it being labelled |

`N-Regression` is the one that bites. Before declaring pass, exercise the flow next to
the one you changed, not only the one you changed.

---

## Contract template

```markdown
# Contract: <slug>
Domain: build | Depth: L1+L2+L3 | Max iterations: 3
Artifact: <files> | Preview: <launch.json name or url>

## Done when
| C1 | Type check passes | mech: npx tsc --noEmit |
| C2 | Build succeeds | mech: npm run build |
| C3 | Zero console errors on load and after interaction | real: read_console_messages |
| C4 | <the specific thing> renders with <the specific content> | real: read_page |
| C5 | <primary interaction> changes state correctly | real: click + read_page |
| C6 | No horizontal scroll at 375px | real: resize_window mobile |
| C7 | Screenshot captured as proof | real: computer screenshot |

## Must not
| N1 | Adjacent flow <X> still works | real: exercise it |
| N2 | No secrets in client code | mech: grep |
```
