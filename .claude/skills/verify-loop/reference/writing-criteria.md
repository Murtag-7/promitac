# Writing criteria that do not go circular

The loop is only as good as the contract. A weak criterion does not fail loudly - it
passes quietly, every time, and makes the whole run look successful. This file is the
list of ways that happens.

## The one test

> Could two careful people, shown only the artifact and this criterion, disagree
> about whether it passes?

If yes, it is not a criterion yet. Rewrite it until they could not.

## The six failure modes

### 1. The unfalsifiable criterion

| Bad | Good |
|---|---|
| The hook is engaging | The hook is under 12 words and names a specific stake |
| The code is clean | No function exceeds 40 lines |
| The design feels premium | Every colour used appears in the existing token file |
| The research is thorough | Every claim carries a source that was fetched |

If nothing could make it fail, it is decoration. Decorative criteria are worse than
no criteria: they make an unverified run look verified.

### 2. The criterion that grades the intention

"Correctly implements the user's requirements" cannot be checked against the artifact,
only against a memory of the conversation. The judge has no such memory, by design.
Every criterion must be settleable by looking at the artifact and nothing else.

### 3. The compound criterion

"The hook is short, specific, and opens a loop" is three criteria wearing one ID. It
will come back as a single FAIL with one of the three cited, and the other two will
quietly never be checked again. Split anything containing "and".

### 4. The criterion with no check method

This is the circularity trap and it is why the rule is a non-negotiable. A criterion
whose check is "judge decides if it is good" hands the model permission to approve its
own work. `judge:` is legitimate only when it names **what the judge must decide** and
**what evidence settles it**:

- Bad: `judge: is the ending strong`
- Good: `judge: does the final sentence contain either an imperative or a question, but not both - quote it`

### 5. The criterion that only ever passes

If a criterion has never failed across many runs, it is either genuinely solved - in
which case promote it to `mech:` and stop paying a judge for it - or it was never
checkable. Look at the ledger and decide which.

### 6. The missing anti-criterion

Most bad output passes every criterion. It is fluent, on-topic, correctly structured,
and still wrong - because the thing that made it wrong was never written down. `Must
not` rows exist for exactly this. If you cannot think of one, you have not thought
about how this could go wrong yet.

## Criteria that are worth their tokens

The best criteria share a shape: **they name a specific thing that must be observably
present or absent in the artifact.**

- "Contains at least one concrete physical image carrying an abstract idea" - the
  judge quotes it or it fails.
- "Zero console errors after load and after clicking the primary action" - observed.
- "Every cited source was fetched and says what is claimed of it" - checkable.
- "Running it twice produces the same result" - runnable.
- "Could not have been written by any other account in this niche" - a strong
  anti-criterion, because it fails exactly the output that passes everything else.

## Choosing the check method

Take the cheapest method that can actually settle the question. Climbing the ladder
when a lower rung would do is the main way this loop wastes money.

| Method | Use when | Cost |
|---|---|---|
| `mech:` | a script or grep can settle it | free, deterministic |
| `real:` | the environment can answer - browser, run, fetch | cheap, and it is ground truth |
| `judge:` | it needs reading and interpretation | a subagent per pass |
| `human:` | only the user can decide - taste, strategy, risk appetite | a round trip |

**`human:` is a real and valid method.** Some things genuinely cannot be delegated:
whether a story is his to tell, whether a strategic bet is worth taking, whether a
piece feels right. Marking those `human:` up front is honest. Dressing them up as
`judge:` criteria is how a loop produces confident output about things it cannot know.

## How many

Five to nine. Below five, the goal is under-specified and the loop will pass something
that misses the point. Above nine, the judge's attention spreads thin and the marginal
criteria get graded carelessly - which is worse than not having them, because they
report PASS either way.

If a goal genuinely needs fifteen criteria, it is two goals. Split it.
