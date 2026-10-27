# Pack: automation

Skills, agents, scripts, scheduled jobs, integrations, batch pipelines.

**The defining risk here is different from the other packs.** Content that is wrong
gets read and discarded. An automation that is wrong keeps being wrong, on a schedule,
while nobody is watching. Verify the failure paths harder than the happy path.

## Read first

- The existing skill or script being modified, in full
- What triggers it: cron, hook, manual invocation, another skill
- What it writes to, and whether that is recoverable

---

## Mechanical criteria (`mech:`)

| Rule | Check |
|---|---|
| Syntax | `python -m py_compile <file>` / `node --check <file>` / `bash -n <file>` |
| Runs at all | execute with `--help` or on a trivial input |
| No placeholders | `python "<skill-dir>/scripts/check_common.py" <file>` |
| No hardcoded paths | grep for absolute user paths that will not exist elsewhere |
| No secrets | grep for keys, tokens, passwords |
| Skill frontmatter valid | `name` and `description` present; description states when to use it |

For **skills specifically**: the description is the whole activation mechanism. A
skill with a vague description never fires. Check that it names concrete trigger
phrases, not just a topic.

---

## Reality criteria (`real:`) - the ones that matter

| ID | Criterion | How |
|---|---|---|
| R-DryRun | Runs on real input without writing anything, first | run with a dry-run flag or on a copy |
| R-RealRun | Produces correct output on one real case | run it, inspect the actual output |
| R-Empty | Handles empty or missing input without crashing | feed it nothing |
| R-Malformed | Handles malformed input with a useful message, not a stack trace | feed it garbage |
| R-Idempotent | Running it twice does not double-apply or corrupt | run it twice, compare |
| R-ExitCode | Exits non-zero on failure | force a failure, check `$?` |
| R-Recoverable | If it writes, the previous state is recoverable | check for backup or git |

**Always dry-run before the real run when the automation writes anything.** This is
not caution theatre - an automation is the one artifact class where a bad first
execution can destroy the input you needed to test against.

---

## Judge criteria (`judge:`)

| ID | Criterion |
|---|---|
| J-Trigger | Would this actually fire when intended? Are the trigger conditions unambiguous? |
| J-Silent | Does it fail loudly, or can it fail silently and be believed? |
| J-Batch | Does it fit a batch workflow, or does it demand a daily manual step? |
| J-Readable | Could the author understand this in three months without the conversation? |
| J-Scope | Does it do one thing, or has it accumulated responsibilities? |

`J-Silent` deserves special weight. The worst automation failure is not a crash - it
is one that returns plausible output while doing nothing, because that is the one that
gets trusted.

`J-Batch` reflects a real constraint: workflows that need daily manual steps do not
survive a student's schedule. If it needs babysitting, it is not done.

---

## Anti-criteria

| ID | Anti-criterion |
|---|---|
| N-Destructive | Nothing deletes or overwrites without a recoverable path |
| N-Assumed | No assumed tool, API, or paid service that is not confirmed available |
| N-Unbounded | Any loop, retry, or API call has a ceiling |
| N-Silent | No error path swallows an exception without reporting |

`N-Assumed` matters here specifically: do not build against paid analytics tools or
services unless their availability has been confirmed.

---

## Contract template

```markdown
# Contract: <slug>
Domain: automation | Depth: L1+L2+L3 | Max iterations: 3
Artifact: <path> | Trigger: <how it fires>

## Done when
| C1 | Syntax valid | mech: python -m py_compile |
| C2 | Produces correct output on one real case | real: run it, inspect output |
| C3 | Empty input does not crash | real: run with no input |
| C4 | Malformed input gives a useful message | real: run with garbage |
| C5 | Running twice is safe | real: run twice, diff |
| C6 | Exits non-zero on failure | real: force failure, echo $? |
| C7 | Fails loudly rather than silently | judge: J-Silent |

## Must not
| N1 | Nothing destructive without recovery | judge + real |
| N2 | No unconfirmed paid service assumed | judge: N-Assumed |
| N3 | No unbounded loop or retry | mech: read the code |
```
