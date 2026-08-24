# Design: retire-work-mode

**Change:** `retire-work-mode`
**Phase:** design
**Lane:** micro
**TDD:** strict

## A. Proposal

`mode.ts` becomes `linear-integration.ts`: the same provenance-carrying reader,
the same two files on disk, one honest concept. `EinMode = "solo" | "team"`
becomes `LinearIntegration = "off" | "on"` with `off` as the default.

## B. Spec

- With no evidence, the resolved value MUST be `off` and the directive MUST
  state that the board is local and Linear preflight does not run.
- A persisted `{"linear":"on"|"off"}` MUST resolve to that value.
- A persisted `{"mode":"team"}` MUST resolve to `on` and `{"mode":"solo"}` to
  `off`, without rewriting the file as a side effect of reading it.
- When both keys are present, `linear` MUST win: it is the current vocabulary.
- Invalid, unreadable, or absent evidence MUST resolve to `off` and MUST keep
  the existing inspection status, provenance, and observed-source list.
- Writing MUST persist the `linear` key.
- No surface MUST offer a two-valued work mode.

## C. Decisions

### D1 — The module is renamed; the files on disk are not

A module called `mode.ts` that holds no mode is the defect this change removes,
and it is code: renaming it is free and the compiler finds every consumer.
`.pi/ein/mode.json` is a different matter — it is the user's state, and renaming
it means moving files on someone's machine. That belongs to the deferred
state-migration unit, together with the runtime homes. The reader therefore
keeps both paths and the module documents why the filename outlives the concept.

### D2 — The legacy key is read, never rewritten

Reading `{"mode":"team"}` resolves to `on` and leaves the bytes alone. A read
that silently rewrites the user's configuration is a mutation disguised as a
query, and it would destroy the evidence needed to diagnose a surprise. The file
adopts the new key the next time something writes it deliberately.

### D3 — `linear` wins over `mode` when both exist

A file that has been written by the new code and still carries the old key must
resolve to what was chosen most recently, which is the new key. The alternative
— legacy wins — would make a deliberate write silently ineffective.

### D4 — The default is `off`, and that is a product statement

Solo is not "the mode Samu happens to use": it is the contract. Linear is opt-in
for everyone, including a fresh install with a Linear API key present.

## D. Success Criteria

| # | Proven by |
|---|---|
| 1 | Default resolution test plus the directive text contract |
| 2 | Legacy fixtures for both values, asserting the file bytes are unchanged after the read |
| 3 | Round-trip write/read on the new key |
| 4 | Corrupt / unreadable / missing fixtures keep status, provenance and observed list |
| 5 | Settings, status, banner and command contracts name the integration, not a mode |
| 6 | The Linear tool surface is untouched; its tests keep passing unchanged |
| 7 | `apply-progress.md` records RED → GREEN → TRIANGULATE → REFACTOR per group |

## Risks

- **The prompt directive is load-bearing.** It is what stops Ein from claiming
  Linear is the board. Its two texts must survive the rename word for word,
  because a weakened directive is an invisible behavioural regression.
- **Eight consumers import the module.** The rename is compiler-guided, but any
  string-keyed lookup (`project-directives.ts:82` maps by setting id) is not, so
  the setting id change has to be traced by hand and by test.
