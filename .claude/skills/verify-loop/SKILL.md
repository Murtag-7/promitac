---
name: verify-loop
description: Use when a goal is handed over and the user wants a verified result without babysitting it - "/verify-loop", "verify loop", "iterate until it's right", "udelej to a over si to sam". Translates a fuzzy goal into testable acceptance criteria, takes one confirmation, then produces the work, verifies it in a fresh context against those criteria, fixes what fails, and loops - stopping on pass, budget, no-progress, or regression. Domains: content, build (dashboards/sites/UI), automation, research.
---

# Verify Loop

A goal becomes a contract. The contract becomes checks. The checks drive the loop.

**Why it is built this way.** A model cannot reliably audit its own output inside the
context that produced it - it re-reads what it *meant*, not what it *wrote*. It can
audit the identical artifact when handed to it as someone else's work. Every rule
below either preserves that separation or stops the loop from spinning.

## Non-negotiables

1. **No criterion without a check method.** If you cannot name how a criterion gets
   checked, it is not a criterion. Rewrite it until it is checkable, or move it to
   Unknowns and ask. This single rule is what stops the loop going circular.
2. **The judge never sees how the artifact was made.** No transcript, no reasoning,
   no "I chose X because". Artifact plus contract only.
3. **State lives in files.** `.verify/` is the memory. Never rely on what happens to
   still be in context.
4. **Four exits, not one.** Pass, budget, no-progress, regression. A loop that only
   exits on success is a token furnace.
5. **The judge reports; it does not fix.** Fixing is a separate pass with separate framing.
6. **Nothing is claimed done that was not observed.** "Tests pass" requires the output.
   "Renders correctly" requires the screenshot. No exceptions.

## Invocation

`/verify-loop <goal>` - or any request that hands over a goal and expects a finished,
checked result.

If the goal is one sentence and obviously mechanical (rename a variable, fix a typo),
say so and just do it. Do not run a five-phase loop on a typo. State that you are
skipping the loop and why.

---

## Phase 0 - Contract

**Output: `.verify/<slug>/contract.md`. Then STOP and show it.**

`<slug>` is a short kebab-case name for the task.

### 0.1 Detect domain

| Signal | Domain | Pack |
|---|---|---|
| script, hook, caption, newsletter, story, post, voice | `content` | `packs/content.md` |
| page, dashboard, UI, component, site, app, styling | `build` | `packs/build.md` |
| skill, agent, cron, pipeline, integration, batch job | `automation` | `packs/automation.md` |
| research, compare, analyse, strategy, "should I" | `research` | `packs/research.md` |

Mixed goals get the pack of the **primary deliverable**, plus criteria borrowed from
the secondary. Say which you picked.

Read the pack before writing the contract. Also read any project context that governs
the work (e.g. `Claude_resolve_editing/.claude/*.md` when inside the Quiet Power project, `CLAUDE.md`
in the working tree). Criteria must reflect the project's real rules, not generic ones.

### 0.2 Set depth and budget

| Stake | Depth | Max iterations |
|---|---|---|
| Single mechanical change, snippet, config | L1 | 1 |
| Normal piece of work | L1 + L2 | 2 |
| Published, user-facing, or executable | L1 + L2 + L3 | 3 |

Pick honestly. Over-verifying a throwaway wastes tokens; under-verifying something
that ships wastes trust. When genuinely torn, take the higher one and say so.

### 0.3 Write the contract

```markdown
# Contract: <slug>
Domain: <domain> | Depth: <L1 | L1+L2 | L1+L2+L3> | Max iterations: <N>
Artifact: <path(s) where the output will land>

## Goal
<the goal restated in one sentence - what "good" looks like, not what to do>

## Done when
| ID | Criterion | Check |
|----|-----------|-------|
| C1 | <binary, observable statement> | mech: <exact command> |
| C2 | <binary, observable statement> | judge: <what the judge must decide> |
| C3 | <binary, observable statement> | real: <what must be observed, how> |

## Must not
| ID | Anti-criterion | Check |
|----|----------------|-------|
| N1 | <what would make this wrong even if every C passes> | <method> |

## Out of scope
- <explicit non-goals - this is what stops scope creep>

## Unknowns
- A1: <assumption made> - <what changes if it is wrong>
```

Rules for writing criteria:

- **Binary.** "Hook is under 12 words" not "hook is punchy".
- **Observable in the artifact**, not in your intentions.
- **One claim each.** Split anything with an "and" in it.
- **5-9 criteria.** Fewer means the goal is under-specified; more means you are
  padding, and a long rubric dilutes the judge's attention.
- **`mech:` beats `judge:` every time it is possible.** A grep does not have opinions.
- Anti-criteria are not optional. Most bad output passes every criterion and still
  fails because of something nobody wrote down.

See `reference/writing-criteria.md` for the failure modes to avoid.

### 0.4 Gate

Show the contract. Say plainly: **which assumptions you made**, and **what you will
do first**. Then stop and wait.

Do not begin producing. This is the one human checkpoint and it is the highest-value
one - a misread goal caught here costs a sentence; caught at the end it costs the run.

---

## Phase 1 - Produce

After approval, do the work. Write the artifact to the path in the contract.

The contract is the spec - work to it, not around it. If while producing you discover
the contract is wrong, **stop and say so** rather than quietly producing something
else. A contract you silently drifted from verifies nothing.

---

## Phase 2 - Verify

Climb the ladder cheapest-first and **short-circuit**: if L1 fails, go straight to
Phase 3. Do not pay a judge for what a grep already killed.

### L1 - Mechanical (always)

Run the `mech:` commands from the contract. Scripts live in this skill's `scripts/`
directory. On this machine Python is invoked as `python` (not `python3`).

```bash
python "<skill-dir>/scripts/check_common.py" <artifact> --max-words 220
```

Record exact output. Exit code 0 = pass, 1 = failures, 2 = usage error.

### L2 - Fresh-context judge (depth L1+L2 and above)

Dispatch a **subagent** (`Agent` tool, `subagent_type: "general-purpose"`,
`run_in_background: false`). This is required, not optional: it is the only way to get
a genuinely fresh context, and same-context self-review is exactly what degrades output.

The subagent prompt contains **only** these three things:

1. The artifact - pasted in full, or its path to read.
2. The contract's `Done when` and `Must not` tables.
3. The judging protocol below.

It must contain **none** of: how the artifact was made, what you were trying to do,
which parts you are unsure about, what you already fixed, or that you wrote it.
Present the artifact as submitted work of unknown authorship.

Judging protocol to embed verbatim in the subagent prompt:

```
You are reviewing submitted work against a fixed set of criteria. You did not write
it and you know nothing about how it was produced. Judge only what is on the page.

For every criterion, return exactly one row:

| ID | PASS/FAIL | Evidence | Fix |

- Evidence: a direct quote from the artifact, or the specific absence you observed
  ("no comparison or image appears anywhere in the piece"). Never a paraphrase of
  your impression. If you cannot cite evidence, the verdict is PASS - you do not
  have grounds to fail it.
- Fix: for FAIL only. One concrete instruction naming what to change and to what.
  "Cut the hook to under 12 words" not "make the hook stronger".
- Do NOT rewrite, improve, or produce a corrected version. Report only.
- Do NOT invent criteria that are not in the list.
- Grade each criterion independently. Do not let an overall good impression carry
  a failing criterion, or one bad line sink a passing one.

Then one final line: OVERALL: PASS (all criteria pass) or OVERALL: FAIL (n failing).
```

**Fallback if no subagent is available:** re-read the artifact from disk as if
encountering it for the first time, state explicitly "judging the file as written,
ignoring intent", and apply the same protocol. This is weaker - say so in the report.

### L3 - Reality (depth L1+L2+L3)

Ground truth from outside the model. Per domain:

- **build** - `preview_start`, then `read_console_messages`, `read_page`,
  `computer{action:"screenshot"}`, `resize_window` for responsive and dark mode.
  Console errors are failures even when nothing looks wrong.
- **automation** - actually run it on real input. Dry-run first if it writes anything.
- **research** - fetch the cited sources and confirm they say what was claimed.
- **content** - real performance data where it exists (Composio Instagram for QP).
  Otherwise content has no L3; do not fake one.

---

## Phase 3 - Fix

Write `.verify/<slug>/run-<N>.md`:

```markdown
# Run <N> - <slug>
## Verdicts
| ID | Status | Evidence | Fix |
## Findings
- F-C2-hook-length (first seen: run <N>)
## Decision
<CONTINUE | PASS | STOP:BUDGET | STOP:NO_PROGRESS | STOP:REGRESSION>
```

Finding IDs are `F-<criterion-id>-<slug>` and must be **stable across runs** - the
same underlying problem keeps the same ID. This is what makes no-progress detectable.

Then fix. Read the findings as **external review of someone else's work** - that
framing is load-bearing, not decoration. Address each failing criterion by ID. Change
only what the findings name; unrelated "improvements" are how regressions get in.

Re-verify from Phase 2. Increment N.

---

## Phase 4 - Loop control

Check in this order after every run:

| Exit | Condition | Action |
|---|---|---|
| **PASS** | every criterion green | Phase 5, report |
| **REGRESSION** | a previously green criterion is now red | **stop immediately** - report the trade-off and ask which side to keep |
| **NO_PROGRESS** | the same finding ID survives two consecutive runs | **stop** - a third attempt is self-deception. Escalate with one specific question |
| **BUDGET** | max iterations reached | stop - report what is green, what is red, and what you would try next |

Regression outranks no-progress: a fix that broke something is a different problem
from a fix that did nothing, and needs a human decision rather than another attempt.

On any stop that is not PASS, deliver the artifact anyway with an honest status. A
partially-verified result plus a clear list of what failed beats silence.

---

## Phase 5 - Ledger

Append to `.verify/ledger.md` (create if absent):

```markdown
## <YYYY-MM-DD> - <slug> - <domain>
- Result: <PASS in N iterations | STOP:reason at N>
- Failed at least once: <IDs plus one-line reason each>
- Promotion candidate: <criterion that failed judge-side 3+ times across runs>
```

**The compounding step.** Before writing, read the existing ledger. If a `judge:`
criterion has now failed three or more times across separate runs, it is a recurring
pattern rather than a one-off - propose promoting it to a `mech:` rule in `scripts/`.
Say so explicitly in the report; do not edit the scripts silently.

This is what turns the loop into a system: repeated judgement calls become free
deterministic checks, and the loop gets progressively better at *this user's* work.

---

## Reporting back

Close with, in this order:

1. **Status** - PASS or stopped, and after how many iterations.
2. **What was verified and how** - name the actual checks, with observed output.
   Never claim a check you did not run.
3. **What is still red**, if anything - with the specific reason.
4. **Ledger note** - anything worth promoting, or a pattern worth naming.

No victory lap. If it passed, say it passed and stop talking.
