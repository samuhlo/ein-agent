status: complete
change: deploy-claude-orchestrator-asset
phase: apply
group: // 003. TRIANGULATE → REFACTOR — focused regression and boundary gate
skill_resolution: paths-injected

## Completed tasks
- 1.1: Added fresh Bun child-process regressions for non-dry deployment, dry-run non-mutation, and required failure when `assets` is uncreatable.
- 2.1: Added the required dry-safe assets directory and direct `copyFileSync` deployment inside `runSync()` before optional MCP handling; copy failures propagate through `requiredFailures`.
- 3.1: Triangulated all focused branches, retained the existing shared fixture because no further local setup refactor reduced meaningful duplication, and completed the boundary audit.

## Files changed
`cc-ein/sync.ts`
`tests/surface-wiring.test.ts`
`openspec/changes/deploy-claude-orchestrator-asset/tasks.md`
`openspec/changes/deploy-claude-orchestrator-asset/apply-progress.md`

## Verification
- Focused final check: `bun test tests/surface-wiring.test.ts` — 34 passed, 0 failed, 269 assertions.
- Canonical integrity: `wc -c` returned `42926`; SHA-256 matched `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`.
- Boundary audit: only the declared sync/test paths and SDD artifacts are this change's additions; canonical asset, A1–A3 dirty paths, and untracked dogfooding document remain untouched.
- No production build or full repository suite run; broader checks remain verify-owned.

## TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE / REFACTOR final focused check |
|---|---|---|---|
| Non-dry sync deploys a regular byte-identical orchestrator file | PASS: destination missing before implementation | PASS: focused suite after 2.1 | PASS: `bun test tests/surface-wiring.test.ts` (34/34); regular-file and byte-parity assertions pass; no refactor warranted |
| Dry-run leaves orchestrator directory and file absent | PASS: focused dry case passed before implementation | PASS: focused suite after 2.1 | PASS: same final focused command; parent and destination remain absent; no refactor warranted |
| Uncreatable asset destination is a required sync failure | PASS: pre-implementation status was 0 instead of non-zero | PASS: focused suite after 2.1 | PASS: same final focused command; required failure is non-zero and reported; no refactor warranted |

## Deviations
- None from the production design. The broader global checks specified for verify were not absorbed into apply, per the focused delegation boundary.

## Remaining tasks
- None; apply is complete and ready for verify.
