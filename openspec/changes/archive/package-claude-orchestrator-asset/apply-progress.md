status: complete
change: package-claude-orchestrator-asset
phase: apply
current_group: // 003. Existing payload fixture compatibility and final transport gates
skill_resolution: paths-injected

## Completed
Group 001 tasks 1.1–1.4 remain complete: `CC_EIN_ORCHESTRATOR_ASSET` is the sole route owner reused by direct-file and required-path inventories.

Group 002 tasks 2.1–2.4 are complete. `bundleCcEinPayload` now accepts temporary checkout/output options, keeps CLI defaults, validates direct files fail-closed, stages exact bytes, hashes staged bytes, writes the manifest, archives, and cleans temporary staging. The focused test covers valid archive membership/bytes/digest plus absent, directory, and unreadable sources with no output archive.

## TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Canonical asset is archived once at its stable path with byte-preserving staged manifest digest | `bun test tests/cc-payload-bundle.test.ts` failed: invocable seam absent | Same command passed: valid archive/member/bytes/manifest checks | Same command passed after result-manifest and invalid-fixture coverage | `bun test tests/cc-payload-bundle.test.ts && (cd installer && bun run typecheck)` passed |
| Missing, directory, or unreadable direct source fails before a usable output archive | Same RED command failed before import-safe seam | Same GREEN command passed all three fail-closed cases | Same focused command passed invalid fixtures and output absence assertions | `bun test tests/cc-payload-bundle.test.ts && (cd installer && bun run typecheck)` passed |

## Files changed
`installer/scripts/bundle-cc-ein.ts`
`tests/cc-payload-bundle.test.ts`
`installer/src/core/cc-payload-inventory.ts`
`tests/cc-payload-entrypoints.test.ts`
`tests/installer-runtime-menu.test.ts`
`openspec/changes/package-claude-orchestrator-asset/tasks.md`
`openspec/changes/package-claude-orchestrator-asset/apply-progress.md`

## Verification and boundaries
Focused bundle tests and installer typecheck are green. No production build or full suite was run. Temporary checkout/archive fixtures are cleaned by tests; the real generated archive, canonical asset, protected paths, consumers, materialization, runtime hand-off, BunFS smoke, and release surfaces were not edited or regenerated. Group 003 was pending before this run.

## Group 003 — Existing payload fixture compatibility and final transport gates

Completed tasks: 3.1–3.4. The runtime payload fixture now includes the exact canonical route with deterministic bytes; no production or deferred consumer code changed.

## TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
|---|---|---|---|---|
| Existing Claude payload fixture accepts the canonical required member | `bun test tests/installer-runtime-menu.test.ts` failed: stale file expectation and missing required asset | Same command passed: 31 tests | `bun test tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts` passed: 41 tests | Boundary `git diff --check` passed; final focused command above passed again after the fixture update |

Verification: focused transport checks passed (41/41); root and installer typechecks passed (`bun run typecheck`, `cd installer && bun run typecheck`). Global suite remains verify-owned per the apply boundary; no production build was run.

## Verification and boundaries
No production files were edited in Group 003. The canonical source, generated archive, protected dirty paths, extraction/materialization, runtime hand-off, checkout sync, BunFS smoke, and release surfaces remain untouched. No deviations from design; remaining work is independent verify execution of the broader suite and fresh gates.
