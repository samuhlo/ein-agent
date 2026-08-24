# Verify report: retire-work-mode

**status: pass**

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | No configuration means Linear disabled, and the directive says the board is local | pass | `tests/linear-integration.test.ts`: default resolves `off`; the directive contract asserts "no linear", "openspec/changes" and "do not run linear preflight" |
| 2 | Legacy `{"mode":"team"}` resolves to enabled, `{"mode":"solo"}` to disabled, without rewriting the file | pass | Same file: both fixtures, plus a byte-for-byte assertion that the file is unchanged after the read |
| 3 | A new write persists the new key and reads back the same value | pass | Round-trip test asserting the file content is exactly `{ linear: "on" }` |
| 4 | Corrupt, unreadable or absent evidence resolves to the default and keeps provenance | pass | Corrupt-JSON and unknown-value fixtures; `inspect` still reports `invalid` with source `project`, and the missing case records both observed sources |
| 5 | No surface offers a two-valued work mode | pass | Settings catalogue id list, directive translator, status line, banner label, `/ein:linear` command; the narrative guard now asserts the **absence** of "work mode", "team mode" and "solo mode" from the orchestrator |
| 6 | Every Linear capability stays reachable and unchanged | pass | `ein-linear.ts` untouched; `tests/ein-linear-budget.test.ts` and the Linear tool contracts pass unchanged |
| 7 | Strict TDD evidence per group | pass | `apply-progress.md`, groups 001–004 |

## Gates

- `bun test`: **2508 pass, 0 fail**, 179 files. Baseline before the change was
  2503 pass / 0 fail; the five new tests are the widened contract.
- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.

## Scope adherence

Production edits stayed within the module and the eight consumers named in
`scope.md`, plus the five prose surfaces that described the retired mode.
`cc-ein/CLAUDE.md` was regenerated from its sources, never hand-edited. The
config files on disk keep their names, the C1 rename stayed out, and no Linear
capability was touched.

## Residual risk

- **The file on disk is now named after a concept that no longer exists.**
  `.pi/ein/mode.json` holds a `linear` key. This is deliberate — it is user
  state — but it is a real inconsistency and it belongs to the same deferred
  migration unit as the runtime homes.
- **The advisor keeps a generic `mode` slot** filled by the Linear inspection.
  Documented at the call site in `workbench.ts` rather than renamed, to avoid
  widening this change into `shared-config-update-advisor` and its tests.
- **Anyone with `/ein:mode` in muscle memory** will not find it. The command is
  `/ein:linear`; no alias was kept, because a hidden alias for a retired concept
  is how the previous half-finished rename survived so long.
