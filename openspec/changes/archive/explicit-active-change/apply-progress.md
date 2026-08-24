status: complete

# Apply progress: explicit-active-change

**Lane:** micro · **TDD:** strict

## Group 001 — the selection becomes part of the contract

- **RED** — `tests/sdd-router.test.ts`: four contracts for zero, one, several and
  explicit. 4 fail / 41 pass.
- **GREEN** — `SddSelection` added to the router, plus `resolveActiveSelection`,
  `selectedChange` and `ambiguousChangeBlocker`. `resolveSddStatus` resolves
  through the selection and, under ambiguity, returns `change: null` with the
  blocker. 45 pass / 0 fail.
- **TRIANGULATE** — the four cases are independent axes, not one repeated: the
  empty repository still reports `none`; a single change resolves with no added
  blocker; several changes null the change *and* list sorted candidates *and*
  push a blocker; an explicit request wins over the ambiguity.
- **REFACTOR** — sorting the candidates is deliberate and commented:
  `listActiveChanges` returns `readdirSync` order, so an unsorted message would
  differ between machines for the same repository.

## Group 002 — one resolver, and everyone asks it

- **RED** — `resolveSddPlanPreview` under two changes still returned one. 1 fail.
- **GREEN** — the plan preview and `resolveActiveChange` (preflight record) call
  the shared resolver instead of repeating `active[0]`. 46 pass / 0 fail.
- **TRIANGULATE** — the same test proves the other direction: with an explicit
  change the preview still reads its `tasks.md`, so the fix removed the implicit
  pick without removing the feature.
- **REFACTOR** — `resolveActiveChange`'s own doc comment claimed a single
  implementation was what stopped two surfaces disagreeing. That promise was
  false while three sites repeated the pick; now it is true.

## Group 003 — the CLI refuses instead of writing

- **RED** — `tests/cli-ambiguous-change.test.ts` (new): 4 fail / 3 pass. The
  three that already passed are the interesting ones — group 001 had already
  stopped the writes, so what remained was the message: the commands said "no
  active change" while two were open.
- **GREEN** — `resolveCommandChange` in `cc-ein/sdd-cli/cli.ts`, used by `lane`,
  `preflight`, `delta`, `summary`, `check` and `close`. 7 pass / 0 fail.
- **TRIANGULATE** — beyond the exit code, each test asserts that **nothing was
  written**: no `preflight.json`, no `specs/`, no `summary.md` in either
  candidate. And the two no-regression cases: a single change still resolves
  with no ceremony, and an empty repository keeps its original message.
- **REFACTOR** — one resolver for six commands; the previous shape was the same
  `?? resolveSddStatus(dir).change ?? ""` copied six times, which is how they
  all inherited the same defect.

## Group 004 — Pi says the same thing as Claude

- **RED** — the seven Pi-side call sites had the same shape. Their writes were
  already stopped by group 001, but their fixed strings still claimed there was
  no active change.
- **GREEN** — `changeUnavailableMessage` added to the router (pure, tested) and
  wired into the five tool messages, the `/ein:sdd-close` command, and the delta
  writer, which now stops before touching disk instead of failing with an empty
  change name.
- **TRIANGULATE** — the helper is tested on all three states: none, ambiguous
  (naming candidates, and explicitly *not* containing "no active change"), and
  resolvable (returns `null`, so no surface invents a problem).
- **REFACTOR** — the message lives in the router next to the selection that
  produces it, so Pi and Claude cannot drift into two different answers.

## Group 005 — the screen does not confuse ambiguity with a clean repo

- **RED** — `tests/sdd-overlay.test.ts`: under ambiguity the overlay returned
  `[]`, i.e. it vanished. 1 fail.
- **GREEN** — the overlay paints two lines naming the count and the candidates.
  20 pass / 0 fail.
- **TRIANGULATE** — the pre-existing "sin cambio activo no roba ni una línea"
  contract stays green with an explicit `selection: none`, proving the new
  branch did not swallow the genuinely-empty case.
- **REFACTOR** — the same lie had a second half in `formatSddStatus`, which
  printed "No active SDD changes" with two open. Fixed with its contract, and
  the test suite's local replica of that handler is now tied to the original by
  a source-level assertion, because a replica that drifts silently is worse than
  no test.

## Gates

- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.
- `bun test`: recorded in `verify-report.md`.
