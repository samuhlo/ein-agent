# Verify report: explicit-active-change

**status: pass**

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Zero active changes behave as before | pass | `tests/sdd-router.test.ts`: `change` null, `selection` is `none`; the overlay's pre-existing "no roba ni una línea" contract still holds |
| 2 | One active change behaves as before, no prompt | pass | Router test resolves it as `only`; `tests/cli-ambiguous-change.test.ts` proves `lane` still answers with exit 0 |
| 3 | Several changes: null, ambiguous, sorted candidates, blocker | pass | Router test asserts all four at once, including the sorted order |
| 4 | An explicit request always wins | pass | Router test with two active; CLI test writes `preflight.json` to the requested change and to no other |
| 5 | Explicit-but-missing keeps its not-found handling | pass | `resolveSddNext`'s existing contract, unchanged and still green |
| 6 | Plan preview and preflight record follow the same rule | pass | Plan-preview test in both directions; `resolveActiveChange` now delegates to the shared resolver |
| 7 | Every CLI subcommand refuses and names candidates | pass | Four commands asserted for exit code, candidates, and **nothing written**; the remaining two share the same resolver |
| 8 | Strict TDD evidence per group | pass | `apply-progress.md`, groups 001–005 |

## Gates

- `bun test`: **2530 pass, 0 fail**, 181 files. Baseline before the change was
  2508 pass / 0 fail; the 22 new tests are the widened contract.
- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.

## What the change actually removed

Three sites computed `listActiveChanges(cwd)[0]` independently, and thirteen
call sites (six in the Claude CLI, seven in the Pi tools) consumed the result as
a default. With two changes open, the pick was `readdirSync` order presented as
a decision, and six of those consumers *write*.

Two lies were fixed, not one. The first was picking silently. The second showed
up only once the first was fixed: with `change: null`, three surfaces —the
overlay, `formatSddStatus`, and every CLI message— reported "no active change"
while two were open. Ambiguity is not an empty repository.

## Residual risk

- **`tests/sdd-status-output.test.ts` replicates the `/ein:sdd-status` handler**
  instead of importing it, because `ein-ai.ts` registers Pi tools on load. The
  replica is now tied to the original by a source-level assertion covering the
  ambiguity branch, but the rest of the replica can still drift.
- **The overlay's ambiguity view is two plain lines.** It says the count and the
  names; it does not offer a picker. That was deliberately out of scope — a
  picker is a second way to hold state.
- **No persisted "current change".** Every ambiguous session needs the name
  typed. That is the intended cost: a stale pointer is a wrong answer that
  survives restarts.
