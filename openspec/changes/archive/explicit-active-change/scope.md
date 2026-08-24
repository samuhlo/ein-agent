# Scope: explicit-active-change

**Change:** `explicit-active-change`
**Phase:** scope
**Lane:** micro
**TDD:** strict (explicit user choice; this phase records it only)
**Artifact language:** English

## Problem statement

With more than one change open, Ein picks one and works on it without saying so.
The choice is `listActiveChanges(cwd)[0]` — the first entry of a `readdirSync`,
i.e. filesystem order — and it happens in three places:

- `ein-pi/agent/lib/sdd-router.ts:501` (`resolveSddStatus`)
- `ein-pi/agent/lib/sdd-router.ts:821` (`resolveSddPlanPreview`)
- `ein-pi/agent/lib/sdd-preflight-record.ts:98` (`resolveActiveChange`)

Six call sites in `cc-ein/sdd-cli/cli.ts` then consume `.change` as a default for
`lane`, `preflight`, `check`, `sync`, `delta` and `summary`, so an arbitrary pick
does not just report on the wrong change: it writes to it.

This is the roadmap's "ambiguity of the active change" signal, whose expected
value is zero implicit choices, and it is a fail-closed violation: uncertainty
about which change is active becomes a confident answer.

The status surface makes it worse by being silent about it. `resolveSddStatus`
returns `change: "feat-a"` with no indication that `feat-b` was equally
eligible, so no consumer can tell a decided answer from a coin flip.

## Scope boundary

### In scope

- Represent the selection in `SddChangeStatus` instead of hiding it: none, a
  single active change, an explicitly requested one, or ambiguity naming its
  candidates.
- Stop resolving to a change when the selection is ambiguous: `change` becomes
  `null` and the ambiguity is reported, so no phase work, no write and no route
  is derived from a coin flip.
- Apply the same rule to the plan preview and to the preflight record's active
  change, so the three sites answer the question identically.
- Make the `cc-ein-sdd` CLI ask for an explicit change instead of defaulting to
  an arbitrary one, naming the candidates and exiting non-zero.
- Keep a single active change working exactly as today, with no extra prompt.

### Out of scope

- Persisting a "current change" selection anywhere. That is a second source of
  state and the board already lives in `openspec/changes/`.
- An interactive picker in Pi or in the terminal app.
- Changing phase routing, gates, lane resolution or any artifact contract.
- The C1 rename.

## Acceptance criteria

1. With zero active changes, behavior is unchanged: `change` is `null` and the
   selection reports that there is none.
2. With exactly one active change, behavior is unchanged: it resolves to that
   change with no prompt and no blocker, and the selection records that it was
   the only candidate.
3. With more than one active change and no explicit request, `change` is `null`,
   the selection is ambiguous and names every candidate in a stable order, and a
   blocker explains that the change must be chosen explicitly.
4. An explicitly requested change always wins, no matter how many are active,
   and the selection records that it was explicit.
5. An explicitly requested change that does not exist keeps its current
   not-found handling and is never silently replaced by another.
6. The plan preview and the preflight record's active change follow the same
   rule; neither returns a change under ambiguity.
7. Every `cc-ein-sdd` subcommand that defaulted to the active change refuses to
   act under ambiguity, names the candidates, and exits non-zero instead of
   writing to an arbitrary change.
8. Strict TDD evidence per group.

## Evidence and likely seams

- `sdd-router.ts:499-501` — the resolution and its `active[0]`.
- `sdd-router.ts:820-822` — the same pick in the plan preview.
- `sdd-router.ts:850-885` — `resolveSddNext`, which already handles an explicit
  change that does not exist and is the model for the ambiguity message.
- `sdd-preflight-record.ts:96-99` — `resolveActiveChange`, whose own doc comment
  says a single implementation is what stops two surfaces disagreeing.
- `cc-ein/sdd-cli/cli.ts:215,256,312,358,479,490` — the six defaults.
- `ein-pi/agent/extensions/ein-ai.ts:1495,1534,1582,1656,1707,1745,1820` — the
  Pi-side defaults with the same shape.
- `tests/sdd-router.test.ts:306-310` — already fixes that two active changes are
  listed, which is the fixture this change extends.
