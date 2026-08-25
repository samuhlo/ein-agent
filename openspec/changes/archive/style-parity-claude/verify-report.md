# Verify report: style-parity-claude

**status: pass**

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `sdd-apply` carries the rules | pass | `tests/style-parity-claude.test.ts` |
| 2 | The coordinator carries them too | pass | Same file; `cc-ein/CLAUDE.md` regenerated from source |
| 3 | Materialized equals compiled-from-skill | pass | Asserted against a fresh `compileStyleContract` |
| 4 | Non-writing agents stay clean | pass | `ein-scout`, `sdd-scope`, `ein-linear` asserted |
| 5 | An uncompilable contract fails the sync | pass | `styleBlock` throws `PARITY_STYLE_CONTRACT` |
| 6 | Strict TDD evidence | pass | `apply-progress.md`, groups 001–002 |

## Gates

- `bun test`: **2564 pass, 0 fail**, 186 files. Baseline 2560 / 0.
- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.

## What the suite caught, and it mattered

Wiring the block made `cc-ein/sync.ts` import `../ein-pi/agent/lib/style-contract.ts`.
That module was not in the Claude payload: its roots are `cc-ein` and
`ein-pi/core`, and `ein-pi/agent/lib/` is in neither. The packaged-payload test
failed with `Cannot find module` **from the staged sync** — which is to say the
deployment would have broken on a real machine while every unit test stayed
green.

The inventory's own comment had predicted it: *"a missing entry here becomes a
compile failure on the user's machine, not at packaging time."*

`CC_EIN_STYLE_CONTRACT` is now declared in the inventory and in the required
paths. It ships as a single file rather than an entry-point closure because it
is pure — `node:fs` and `node:path` only.

## Costs and residual risk

- **The coordinator grows from 10.492 to 12.563 bytes** and loads every session,
  including those that never write code. Accepted: the alternative is the
  pointer that demonstrably did not work.
- **The block is frozen at sync time.** Pi re-reads the skill every turn; Claude
  carries what the last sync materialized. The parity test is the only thing
  that catches a stale deployment, and it only catches it where the suite runs.
- **The template bundle must be rebuilt** after touching anything the payload
  ships. `bun test` does not rebuild it, and the smoke compares deployed bytes.
