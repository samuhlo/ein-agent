# Design: screen-state-coverage

**Change:** `screen-state-coverage`
**Phase:** design
**Lane:** micro
**TDD:** strict

## A. Proposal

Turn "the screen must not assert what it did not compute" into a test that walks
the state space. For each surface, declare the states it receives; render all of
them; require every semantically distinct state to be distinguishable, and every
empty output to be declared.

## B. Spec

- The guard MUST accept a surface declaration: a name, a renderer, an enumerable
  state space, and the set of states declared to render empty with their reason.
- The guard MUST fail when two distinct states in the space render identical
  output, naming the surface and both states.
- The guard MUST fail when a state renders empty and is not declared empty,
  naming the surface and the state.
- The guard MUST fail when a declared-empty state renders non-empty, so a stale
  declaration cannot outlive the behaviour it described.
- The phase rail MUST distinguish a failed verification from a passed one, and
  MUST NOT render a failed verification as a completed phase.

## C. Decisions

### D1 — Distinguishability, not appearance

The guard compares rendered output between states, never against a stored
snapshot. A snapshot test tells you the picture changed; it cannot tell you two
different truths look the same. That is the defect this unit exists for, and it
is why `sdd-overlay.test.ts` was green while `fail` looked like `pass`.

Colour is part of the output and is stripped before comparison, so a difference
that exists only as an ANSI code does not count as distinguishable. A user
reading a monochrome terminal, a log, or a screenshot in bad light has to be able
to tell the states apart from the text.

### D2 — Empty is a valid answer, but it has to be declared

"Renders nothing" is sometimes the contract: the overlay deliberately takes no
line when there is no active change. So the guard does not ban emptiness; it
bans *undeclared* emptiness. And it checks the declaration in both directions —
a state declared empty that starts rendering is also a failure, because that is
how a stale declaration silently stops protecting anything.

### D3 — `fail` becomes its own phase state, not a missing case

`phaseStates` returns `unknown` for a stale or unreadable report. A failed report
is not unknown — it is known and bad. It gets `failed`, rendered with the
existing `danger` style and its own glyph, so the rail distinguishes "we don't
know" from "we know it failed". Reusing `unknown` would have been cheaper and
would have thrown away the distinction the router already computes.

### D4 — Only the pure surfaces, and the reason is honest

`formatSddStatus` cannot be imported without registering Pi tools, so it stays
covered by the source-level assertion introduced in the previous change. This is
recorded as a real gap rather than papered over: the guard covers what it can
reach, and the boundary is written down.

## D. Success Criteria

| # | Proven by |
|---|---|
| 1 | A deliberately colliding fake surface makes the guard fail, naming both states |
| 2 | A fake surface with an undeclared empty state fails |
| 3 | Declarations live in the surface registry; the overlay's `none` is the real case |
| 4 | Overlay contract: `fail` differs from `pass`, `unknown` and `absent`, and its phase is not `done` |
| 5 | The collision message names union, surface and values |
| 6 | The full pre-existing overlay and router suites stay green |
| 7 | `apply-progress.md` per group |

## Risks

- **A guard that only proves itself is worthless.** The unit is only worth its
  cost if it finds something in the real surfaces. It already has, before being
  written: the `fail`/`pass` collision. That finding is the acceptance evidence,
  not the fake fixtures.
- **The state space is a product, and products explode.** The declared spaces are
  per-union with a fixed base state, not the cartesian product of every field.
  Combinatorial coverage is explicitly not the goal; distinguishability along one
  axis at a time is.
- **Stripping colour could hide a real difference.** Accepted deliberately: a
  difference that exists only in colour is not a difference a person can read in
  a log or a screenshot.
