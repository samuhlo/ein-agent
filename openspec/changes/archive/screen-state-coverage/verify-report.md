# Verify report: screen-state-coverage

**status: pass**

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | The guard reports pairs of distinct states with identical output | pass | Fake-surface contract; the message names surface, union and both states |
| 2 | The guard reports undeclared empty states | pass | Fake-surface contract, and its declared counterpart passing |
| 3 | Legitimate empty states are declared with their reason | pass | The overlay's `none` is declared with "sin cambio activo el widget no roba ni una línea" |
| 4 | `verify: fail` is not a completed phase and differs from the rest | pass | `phaseStates` returns `failed`, asserted to be neither `done` nor `unknown`; all four `VerifyOutcome` values render distinctly |
| 5 | A new undistinguished union value fails, naming the parties | pass | Same mechanism; the collision message carries union, surface and values |
| 6 | Pre-existing contracts stay green | pass | Full suite, including `sdd-overlay.test.ts` unchanged |
| 7 | Strict TDD evidence per group | pass | `apply-progress.md`, groups 001–003 |

## Gates

- `bun test`: **2539 pass, 0 fail**, 182 files. Baseline before the change was
  2530 pass / 0 fail.
- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.

## What the guard actually caught

Before the guard was written, a spike over the existing surfaces found that the
overlay rendered `verify: fail` exactly like `verify: pass`. The rail marked the
verify phase `done` whenever its artifact existed and the report was neither
stale nor unreadable — so a verification that **failed** was painted as a
completed phase.

`sdd-overlay.test.ts` was green throughout. It fixes the appearance of the
widget, and the appearance was correct; what was wrong was the correspondence
between the picture and the state. That is precisely the gap the valuation named
and the reason this unit exists.

The function's own doc comment said "a stale or unreadable report is not a pass".
It had forgotten the most obvious case.

## Honest boundaries

- **`formatSddStatus` is not covered by the guard.** It lives in `ein-ai.ts`,
  which registers Pi tools on import. It keeps the source-level assertion added
  by the previous change. This is a real gap, written down rather than papered
  over.
- **The installer and terminal-app surfaces are not covered.** Their state is not
  a small enumerable union; extending the guard there is a separate unit.
- **Coverage is one axis at a time, not the cartesian product.** Declared state
  spaces vary one union against a fixed base. Combinatorial coverage is
  explicitly not the goal.
- **Two collisions are asserted as accepted, not fixed.** `only` vs `explicit`
  (the overlay shows the change, not the provenance of the choice) and the five
  `ApplyOutcome` values (the overlay does not project the apply verdict at all).
  Asserting them exactly is what makes a *new* collision visible.
