# Verify report — deploy-claude-orchestrator-asset

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Result

The current implementation satisfies the scope, map, design, task boundary, and `surface-wiring` spec delta. Fresh verification confirms the real isolated Claude sync creates a regular, byte-identical asset, preserves dry-run non-mutation, and exits non-zero for an uncreatable asset destination.

## Focused behavior-seam plan

Apply evidence names exactly three observable seams. They have exactly one final focused association, merged by the normalized command string, and that command was executed once:

| Normalized command | Seams covered | Roles / sources | Result |
|---|---|---|---|
| `bun test tests/surface-wiring.test.ts` | Non-dry regular byte-identical deployment; dry-run creates neither parent nor file; uncreatable destination is a required failure | Focused, RED/GREEN/TRIANGULATE/REFACTOR final check; `design.md` verification requirements; `tasks.md` 1.1, 2.1, 3.1; `apply-progress.md` TDD Cycle Evidence | PASS — 34 passed, 0 failed, 269 assertions, 5.72s |

The focused tests exercise the changed runtime path through fresh Bun child processes with isolated `HOME` and `CC_EIN_HOME`; no observable behavior is build-only evidence.

## Global-check disposition and fresh results

The command plan was rebuilt from the current `openspec/config.yaml`, `design.md`, `tasks.md`, and apply evidence. Every scheduled command below was invoked in the current working tree exactly once.

| # | Normalized command | Roles / source associations | Result |
|---:|---|---|---|
| 2 | `bun test` | Explicit verify runner in `openspec/config.yaml`; design/tasks full regression requirement | PASS — 2,268 passed, 0 failed, 8,981 assertions, 59.54s |
| 3 | `bun test tests/` | Configured unit, integration, and e2e candidates; exact duplicate command merged and retained all three roles | PASS — 2,268 passed, 0 failed, 8,981 assertions, 59.24s |
| 4 | `bun run typecheck` | Explicit root typecheck in `design.md` and project verification requirements | PASS — `tsc --noEmit` |
| 5 | `cd installer && bun run typecheck` | Explicit design requirement and configured installer typecheck in `openspec/config.yaml` | PASS — `tsc --noEmit` |
| 6 | `wc -c < ein-pi/agent/assets/orchestrator.md` | Canonical-integrity requirement in `design.md` and `tasks.md` | PASS — `42926` bytes |
| 7 | `shasum -a 256 ein-pi/agent/assets/orchestrator.md` | Canonical-integrity requirement in `design.md` and `tasks.md` | PASS — `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1` |
| 8 | `bash -c '...boundary allowlist/status assertions...'` | Boundary lock in `scope.md`/`tasks.md`; protected dirty-work requirements in `design.md` | PASS — protected paths present, dogfooding document present, no installer/canonical path outside the declared protected set |

Configured checks not scheduled: lint, format, and coverage are explicitly empty in `openspec/config.yaml`; each is not relevant because no command is configured. No production build was invented: neither the design nor current config requires one for this change.

## Spec and acceptance coverage

- **R1 / canonical deployment:** PASS. Focused non-dry child sync test confirms regular-file status with `lstatSync(...).isFile()` and direct Buffer equality against the canonical source.
- **R2 / dry-run non-mutation:** PASS. Focused `--dry` child sync test confirms neither `${CC_EIN_HOME}/assets` nor `orchestrator.md` exists.
- **R3 / required failure:** PASS. Focused blocked-destination test confirms non-zero status and required-sync failure/incomplete diagnostics.
- Scope acceptance items 1–3: PASS.
- Canonical source remained unchanged at 42,926 bytes and the required SHA-256.

## Strict-TDD audit

Strict TDD is active (`openspec/config.yaml: strict_tdd: true`, with per-change `preflight.json` declaring strict TDD). `apply-progress.md` contains the required `TDD Cycle Evidence` table, and its reported test file exists at `tests/surface-wiring.test.ts`.

- RED evidence is recorded for all three seams: missing asset before implementation, dry-run no-mutation behavior, and pre-implementation zero status for the blocked destination.
- GREEN evidence is recorded for all three seams and is confirmed by the fresh focused run above.
- TRIANGULATE evidence is recorded for regular-file status, byte parity, dry-run absence, and required-failure placement; the fresh focused run remains green.
- REFACTOR evidence records that no local fixture refactor was warranted; the existing fixture was retained without behavior expansion.
- Assertion quality: PASS. Assertions are behavior-level and non-tautological: direct child exit status, `lstatSync().isFile()`, Buffer equality, parent/destination absence, and required failure diagnostics. No type-only, ghost-loop, smoke-only, or implementation-detail CSS assertions were found.

## Boundary audit

The production/test allowlist remains `cc-ein/sync.ts` and `tests/surface-wiring.test.ts`; the canonical asset is read-only. The six A1–A3 dirty paths remain present and byte-stable across the verify run:

- `installer/install.sh`
- `installer/src/cli/install.ts`
- `installer/src/core/settings.ts`
- `tests/deploy-settings.test.ts`
- `tests/install-plan.test.ts`
- `tests/install-sh-checksum.test.ts`

The untracked dogfooding document `docs/plan-hallazgos-dogfooding-2026-08.md` remains present and byte-stable. Installer packaging stayed out of this change: the only installer paths visible are the protected pre-existing dirty paths above, and no additional installer, payload, staging, archive, inventory, or smoke path is in the change delta.

## Environmental notes

This macOS environment has no `timeout` executable. Initial timeout-wrapper attempts failed before invoking Bun (exit 127 / wrapper syntax error); each scheduled required command was then freshly rerun with a streaming Python subprocess timeout (300 seconds) and passed. The full suites emitted incidental `git diff` usage text from existing tests but exited successfully. No required behavioral check is environmentally unavailable.

## Blockers

None.
