status: complete

# Apply progress: screen-state-coverage

**Lane:** micro · **TDD:** strict

## Group 001 — the guard itself

- **RED** — `tests/screen-state-coverage.test.ts`: five contracts against
  deliberately broken fake surfaces, plus four against the real overlay. The
  module under test did not exist.
- **GREEN** — `tests/fixtures/screen-state-coverage.ts`: a pure
  `findCoverageViolations` that walks a declared state space and returns
  collisions, undeclared empties and stale empty declarations, plus
  `describeViolations` for the human message. The five fake-surface contracts
  pass.
- **TRIANGULATE** — four independent properties, not one repeated: two states
  rendering the same text collide; **colour alone does not count as
  distinguishing** (same text, different ANSI, still a collision); an undeclared
  empty fails while a declared one passes; and a declaration that outlives the
  behaviour it described also fails, so it cannot stop protecting in silence.
- **REFACTOR** — the module header records why this is not snapshot testing: a
  snapshot tells you the picture changed, never that two different truths look
  the same, which is the exact defect that let `fail` look like `pass`.

## Group 002 — the lie the guard found

- **RED** — the two contracts over the real overlay failed: `VerifyOutcome` had
  collisions, and `phaseStates` returned `done` for a failed verification.
  7 pass / 2 fail.
- **GREEN** — `PhaseState` gains `failed`. `phaseStates` checks the report's
  verdict before falling through to "artifact present = phase done", and
  `railLine` paints it with the existing `danger` style and a new `×` glyph,
  distinct from the `?` of `unknown`. 8 pass / 1 fail.
- **TRIANGULATE** — the remaining failure was mine, not the code's: the fixture
  paired `verify: "absent"` with the report present, which is unreachable. A
  collision between impossible states is fixture noise, not a lie, so the state
  space now derives artifact presence from the outcome. 9 pass / 0 fail.
- **REFACTOR** — the doc comment on `phaseStates` explained why a stale report is
  not a pass, and had forgotten the most obvious case. It now names both, and
  says plainly that `fail` used to fall through the gap.

## Group 003 — what the guard documents rather than fixes

- **RED/GREEN** — the `SddSelection` and `ApplyOutcome` contracts were written to
  record the truth, not to force a change.
- **TRIANGULATE** — two honest outcomes, both asserted rather than hidden:
  `only` and `explicit` collide **by design** (the overlay shows the change, not
  where the choice came from), and the five `ApplyOutcome` values all collide
  because the overlay does not project the apply verdict at all. The second is a
  known gap, not a lie: the rail speaks about phases, not about each phase's
  verdict. Asserting them exactly means a *new* collision cannot slip in unseen.
- **REFACTOR** — none; the value here is the assertion being explicit.

## Gates

- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.
- `bun test`: recorded in `verify-report.md`.
