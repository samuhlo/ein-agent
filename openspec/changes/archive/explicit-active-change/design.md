# Design: explicit-active-change

**Change:** `explicit-active-change`
**Phase:** design
**Lane:** micro
**TDD:** strict

## A. Proposal

Give the selection a name in the contract, and make ambiguity a state instead of
a silent decision. `SddChangeStatus` gains a `selection` field; `change` becomes
`null` when the selection is ambiguous; the CLI reports the candidates.

## B. Spec

- `SddChangeStatus` MUST carry a `selection` describing how the change was
  chosen: `none`, `only`, `explicit`, or `ambiguous` with its candidates.
- With no active changes the selection MUST be `none` and `change` MUST be
  `null`.
- With exactly one active change and no explicit request, the selection MUST be
  `only` and `change` MUST be that change, with no added blocker.
- With more than one active change and no explicit request, the selection MUST
  be `ambiguous`, `change` MUST be `null`, `candidates` MUST list every active
  change in a stable order, and `blocked` MUST carry an explanation.
- An explicit request MUST always win, and MUST be reported as `explicit`.
- `resolveSddPlanPreview` and `resolveActiveChange` MUST NOT return a change
  under ambiguity.
- Every `cc-ein-sdd` subcommand that defaults to the active change MUST refuse
  to act under ambiguity, name the candidates, and exit non-zero.

## C. Decisions

### D1 — One resolver, and everyone else asks it

`resolveActiveChange` already documents why: "that 'which change is active' has
a single implementation is what stops two surfaces answering the same question
differently". Today that promise is broken by duplication — three sites repeat
`active[0]`. The selection is computed once, in the router, and the other two
call it instead of reimplementing the pick.

### D2 — Ambiguity nulls the change instead of adding a warning

A warning next to a chosen change would still let every consumer work on it,
which is exactly the failure. `change: null` makes the ambiguity impossible to
ignore, and it reuses the path every consumer already has for "no active
change". That path is well covered: it is what a clean repository produces.

### D3 — Sorted candidates, because filesystem order is not an order

`listActiveChanges` returns `readdirSync` order. Listing candidates in that
order would make the message differ between machines for the same repository.
They are sorted, so the message is reproducible and diffable.

### D4 — The CLI refuses; it does not pick and warn

`cc-ein-sdd lane|preflight|check|sync|delta|summary` write. Under ambiguity they
exit non-zero naming the candidates and the flag to disambiguate. A command that
picks and warns is a command whose warning is read after the write.

### D5 — No persisted "current change"

Tempting and wrong: it is a second source of truth about state that already
lives on disk as `openspec/changes/<change>/`. Passing the name explicitly is
one word; a stale persisted pointer is a wrong answer that survives restarts.

## D. Success Criteria

| # | Proven by |
|---|---|
| 1 | Zero-change fixture: `selection.kind === "none"`, `change === null` |
| 2 | One-change fixture: `selection.kind === "only"`, resolves, `blocked` unchanged |
| 3 | Two-change fixture: `ambiguous`, `change === null`, sorted candidates, blocker present |
| 4 | Explicit request against a two-change fixture resolves and reports `explicit` |
| 5 | Explicit-but-missing keeps its current not-found report |
| 6 | Plan-preview and preflight-record fixtures under ambiguity |
| 7 | CLI tests per subcommand: non-zero exit, candidates named, nothing written |
| 8 | `apply-progress.md` per group |

## Risks

- **`change: null` widens a path consumers already have, but not all of them
  exercise it under a non-empty repository.** The overlay, the status output and
  the handoff all have empty-state branches; the fixtures must prove they render
  ambiguity honestly rather than as "no work in progress", which would be a
  different lie.
- **Seven Pi-side call sites share the shape of the six CLI ones.** They are in
  `ein-ai.ts` tool handlers, whose failure mode is a tool result rather than an
  exit code. They must refuse too, or Pi keeps the old behaviour while Claude
  gets the new one.
