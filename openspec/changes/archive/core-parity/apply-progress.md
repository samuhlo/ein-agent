status: complete
scope: groups 001–005 (tasks 1.1, 2.1, 2.2, 3.1, 4.1, and 5.1 complete)
change: core-parity

## Group 001 — canonical Claude coordinator contract

- Status: complete; task 1.1 is checked in `tasks.md`. Groups 002–005 remain untouched.
- Changed `ein-pi/core/AGENTS.md` to state shared-policy ownership, added `cc-ein/CLAUDE.adapter.md` for Claude-only runtime/delegation/configuration guidance and the single harness block, and regenerated `cc-ein/CLAUDE.md` with fixed provenance plus canonical policy and adapter boundaries.
- Added `tests/core-parity.test.ts` for adapter markers/content, shared-policy separation, provenance, harness preservation, and generated Claude terms.

### TDD Cycle Evidence

| Cycle | Evidence |
|---|---|
| RED | `bun test tests/core-parity.test.ts` failed before production edits: 3 tests failed because the adapter/provenance/adaptation projection was absent. |
| GREEN | Added the canonical boundary, adapter, and generated projection; focused test passed: 3 tests, 0 failures. |
| TRIANGULATE | Repeated deterministic source+adapter generation into temporary files; `cmp` confirmed both outputs and checked-in `cc-ein/CLAUDE.md` are byte-identical. |
| REFACTOR | Removed duplicated generic safety prose from the adapter, regenerated output, and reran focused test: 3 tests, 0 failures. |

- Commands: `bun test tests/core-parity.test.ts` (final green); deterministic `cmp` check (identical); `git diff --check -- tests/core-parity.test.ts cc-ein/CLAUDE.adapter.md cc-ein/CLAUDE.md ein-pi/core/AGENTS.md openspec/changes/core-parity/apply-progress.md` (clean).
- Not run by design: production build and full test suite. Compiler fail-closed behavior remains group 002 work.
- Residual risk: `cc-ein/sync.ts` still needs the later compiler integration to regenerate this projection automatically.

## Group 002 — fail-closed core-to-Claude generation (task 2.1)

- Status: complete for task 2.1; tasks 2.2, 3.1, 4.1, and 5.1 remain pending. Overall apply remains `partial`.
- `cc-ein/sync.ts` now compiles coordinator and sorted agent outputs in memory, validates provenance/adaptation/harness boundaries, exact tool and Linear-prefix mappings, scoped runtime translations/markers, routing-set equality, and generated drift before deployment writes.
- Failures use stable `PARITY_UNKNOWN_TOOL`, `PARITY_UNTRANSLATED_TOKEN`, `PARITY_ROUTING_MISSING`, `PARITY_ROUTING_STALE`, and `PARITY_GENERATED_DRIFT` diagnostics with source identity/location where applicable. The checked-in coordinator was refreshed from the compiler output.
- `tests/core-parity.test.ts` covers supported translations, unknown tools/tokens/markers, adapter-source diagnostics, ordinary-word rejection, source/generated drift, routing mutations, and deterministic compiler output.

### TDD Cycle Evidence

| Cycle | Evidence |
|---|---|
| RED | Added mutation fixtures first; `bun test tests/core-parity.test.ts tests/agent-frontmatter-json.test.ts tests/agent-tools-contract.test.ts` failed because `compileClaudeSurface` was not exported. Later RED fixtures failed to reject ordinary `supervisor`/`intercom` prose and to detect an extra generated newline before the scoped rules and byte comparison were tightened. |
| GREEN | Implemented the in-memory compiler and promotion gate, refreshed `cc-ein/CLAUDE.md`, and focused tests passed: 39 tests, 0 failures. |
| TRIANGULATE | Two temporary compiled trees were byte-identical; a rejected unknown-tool fixture left the prior coordinator bytes unchanged. `bun cc-ein/sync.ts --dry` completed without writes. |
| REFACTOR | Replaced broad runtime-word substitutions with exact source-scoped legacy signatures, adapter-source diagnostics, and byte-exact generated comparison; reran the focused suite (39/0) and `git diff --check` (clean). |

- Commands: focused parity/agent tests (39 pass); temporary-tree deterministic/rejection check (pass); `bun cc-ein/sync.ts --dry` (pass); no production build or full suite by design.
- Deviations: compiler exposes `compileClaudeSurface` and `checkGeneratedParity` for fixture-driven validation; deployment still promotes only after compilation succeeds.
- Remaining tasks: 2.2, 3.1, 4.1, 5.1.

## Group 002 — checked-in generated coordinator (task 2.2)

- Status: complete for task 2.2; overall apply remains `partial` because groups 003–005 remain.
- Extended `tests/core-parity.test.ts` to assert the checked-in coordinator passes the compiler parity gate and that a canonical source mutation produces byte-identical output across repeated compilations.
- Refreshed `cc-ein/CLAUDE.md` by writing `compileClaudeSurface().coordinator` through the compiler path; no generated content was hand-edited.

### TDD Cycle Evidence

| Cycle | Evidence |
|---|---|
| RED | A stale generated fixture (extra final newline) was rejected by the compiler with `PARITY_GENERATED_DRIFT` before acceptance. |
| GREEN | Compiler-path refresh completed; focused group command passed: 39 tests, 0 failures, 149 expectations. |
| TRIANGULATE | Repeated the exact group verification command twice; both runs passed. The source-mutation fixture produced identical compiled bytes, and the checked-in output matched the compiler. |
| REFACTOR | Final newline/line-ending normalization remains compiler-owned; `git diff --check` passed and generated diff is limited to the expected projection refresh. |

- Commands: compiler-path refresh; `bun test tests/core-parity.test.ts tests/agent-frontmatter-json.test.ts tests/agent-tools-contract.test.ts` (twice, 39/0 each); `git diff --check -- tests/core-parity.test.ts cc-ein/CLAUDE.md` (clean).
- Not run by design: production build and full suite.
- Remaining tasks: 3.1, 4.1, 5.1.

## Group 003 — explicit Claude OpenSpec synchronization (task 3.1)

- Status: complete for task 3.1; groups 004–005 remain pending, so overall apply stays `partial`.
- Added `sync <change>` dispatch to `cc-ein/sdd-cli/cli.ts`, directly delegating filesystem behavior to `synchronizeOpenSpecFilesystem`.
- Added stable JSON output with ordered keys, sorted domains, repository-relative report paths, and exits 0 (synchronized), 2 (conflict), 3 (malformed/input), 4 (operational failure), and 64 (usage). Existing status/check/close/guard dispatch paths remain unchanged and do not invoke sync.
- Added fixture-driven CLI coverage for success/idempotence, conflict preservation/reporting, malformed/not-found/unsafe/operational/usage outcomes, exact stdout/stderr, and lifecycle non-synchronization in `tests/core-parity.test.ts`.

### TDD Cycle Evidence

| Cycle | Evidence |
|---|---|
| RED | Added group-003 CLI fixtures before production edits; `bun test tests/core-parity.test.ts` failed 3 new tests because `sync` was not dispatched and returned exit 1. |
| GREEN | Implemented thin dispatch/classification/output adapter; `bun test tests/core-parity.test.ts` passed 15 tests, 0 failures. |
| TRIANGULATE | Ran the requested focused regression command across core parity, OpenSpec, close, and harness tests: 120 tests, 0 failures; fixture invocations confirmed idempotence, conflict no-overwrite, and empty stderr. |
| REFACTOR | Isolated response formatting, diagnostic normalization, and outcome mapping without changing the synchronizer; focused regression remained green. |

- Commands: `bun test tests/core-parity.test.ts`; `bun test tests/core-parity.test.ts tests/openspec-specs.test.ts tests/sdd-close.test.ts tests/harness-discipline.test.ts` (120/0).
- Not run: production build/compile or full suite, per bounded apply instructions; no standalone `tsc` binary is available in this workspace.
- Remaining tasks: 4.1 and 5.1.

## Group 004 — deterministic parity regression coverage (task 4.1)

- Status: complete for task 4.1; group 005 remains pending, so overall apply stays `partial`.
- Expanded only `tests/core-parity.test.ts`: fixture assertions now cover coordinator provenance and adapter preservation, every canonical tool mapping plus unknown-tool rejection/no-overwrite, bounded runtime identifiers/markers and scoped legacy rejection, dynamic routing drift, repeated byte identity, generated drift preservation, stable CLI JSON outcomes, and lifecycle non-synchronization.
- Updated only the task checkbox for 4.1; no production files were changed in this group.

### TDD Cycle Evidence

| Cycle | Evidence |
|---|---|
| RED | Temporary exact-tool fixture assertion failed by name (`RED probe`) against `tools: Read, Ripgrep, Glob`; this captured the missing parity assertion before replacing it with the canonical `Grep` contract. |
| GREEN | Final focused suite passed: `bun test tests/core-parity.test.ts` — 20 tests, 0 failures, 168 expectations. |
| TRIANGULATE | Full requested suite passed: `bun test` — 1,066 tests, 0 failures, 3,493 expectations; repeated fixture compilation and CLI JSON key order/idempotence are asserted. |
| REFACTOR | Added bounded frontmatter/tool fixture helpers and dynamic inventory-derived routing assertions; `git diff --check` remained clean. |

- Residual risk: group 005 tracking work remains; this group intentionally did not add release, installer, network, or production-build coverage.
- Remaining tasks: 5.1.

## Group 005 — bounded work-unit tracking (task 5.1)

- Status: complete; all six tasks are checked in `tasks.md`.
- Preserved `EIN.md` byte-for-byte in its curated, untracked state; no placeholders were filled.
- Updated only the `core-parity` state/evidence in `docs/roadmap-beta.md`; installer-beta and unrelated decisions remain untouched.
- Verification: `git diff --check -- EIN.md docs/roadmap-beta.md` is clean; manual status check found no installer paths changed.
- No build or tests run for this documentation-only group. Final verification and change closure remain pending `sdd-verify`.
