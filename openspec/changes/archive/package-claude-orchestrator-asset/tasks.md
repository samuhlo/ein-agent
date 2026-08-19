# Tasks — package-claude-orchestrator-asset

status: ready
blocked_by: none

This plan is limited to transport: inventory, deterministic staging, archive membership, and manifest integrity for the canonical orchestrator asset. The groups below are ordered by dependency and use strict TDD.

Global transport scope and path guardrails:

These constraints apply to every group and are intentionally kept here rather than repeated in group task prose.

### Immutable source

- `ein-pi/agent/assets/orchestrator.md` is the sole canonical source and must not be edited, reverted, staged, cleaned, or copied into another maintained source location.
- No second source copy may be introduced under `cc-ein/` or `installer/`.

### Generated output

- `installer/src/assets/cc-ein-runtime.tar.gz` is disposable build/verification output. Do not edit, regenerate, clean, stage, or commit a pre-existing worktree archive.
- Test archives and staging directories belong in temporary locations and must be removed by the test or bundle operation.

### Protected paths

Do not overwrite, revert, stage, clean, or modify:

- `cc-ein/sync.ts`
- `tests/surface-wiring.test.ts`
- `installer/install.sh`
- `installer/src/cli/install.ts`
- `installer/src/core/settings.ts`
- `docs/plan-hallazgos-dogfooding-2026-08.md`
- `installer/src/core/cc-payload.ts`
- `installer/scripts/cc-payload-smoke.ts`
- `installer/scripts/build-all.ts`
- workflows under `.github/`

### Deferred scope

The future `materialize-claude-orchestrator-asset` change owns extraction/materialization, runtime hand-off, checkout/runtime synchronization, BunFS smoke, and release/publication. This change only transports and verifies bytes through staging, archive, and manifest; it does not alter the existing consumer or any deferred surface listed above.

## // 001. Inventario canónico y contrato de required path

**Edited production file:** `installer/src/core/cc-payload-inventory.ts`

**Focused test:** `tests/cc-payload-entrypoints.test.ts`

- [x] 1.1 RED — Extend the focused inventory test to assert that the orchestrator constant resolves to the exact canonical route, and that both the direct-file list and required-path list contain that route exactly once.
  - skills: `ein-discipline`, `bun`
  - why: Establishes the fail-closed inventory contract before changing its implementation.
  - learn: A required payload file should have one canonical identity reused by every transport list.
  - architecture: The inventory owns route identity and required-layout declaration; this test does not reach into bundling or materialization.
  - avoid: Adding a recursive root for the agent tree or duplicating the route literal in separate arrays.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts` (expected RED before implementation)

- [x] 1.2 GREEN — Declare the orchestrator constant in the inventory production file and reuse it in the direct-file allowlist and required-path list without adding a new payload root.
  - skills: `ein-discipline`, `bun`
  - why: Makes the canonical asset participate in staging and required-layout validation through the existing inventory seams.
  - learn: Explicit-file transport keeps a narrow payload boundary when the source lives outside an already-transported root.
  - architecture: The inventory owns inclusion and obligation only; staging and archive behavior stay in the bundler.
  - avoid: Changing the existing required-path consumer or broadening the payload roots to carry unrelated agent content.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts`

- [x] 1.3 TRIANGULATE — Add edge assertions that the exact route is neither aliased nor represented by a recursive agent-root entry, while preserving all existing inventory entries.
  - skills: `ein-discipline`, `bun`
  - why: Proves the narrow transport boundary and guards against accidentally shipping the whole agent tree.
  - learn: A passing happy-path assertion is insufficient when an overly broad root could also satisfy it.
  - architecture: The inventory remains declarative and deterministic; filesystem probing does not belong in this contract test.
  - avoid: Pinning source byte counts or a SHA-256 in inventory tests; those values must be computed per bundle.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts`

- [x] 1.4 REFACTOR — Remove duplicate route literals or redundant assertions while keeping the named constant as the sole route owner and the test focused on inventory semantics.
  - skills: `ein-discipline`, `bun`
  - why: Leaves a small contract that remains stable as unrelated payload entries evolve.
  - learn: Refactoring after triangulation should reduce duplication without changing the transport boundary.
  - architecture: Only the inventory module owns the canonical route; downstream consumers continue using the existing exported arrays.
  - avoid: Introducing a new inventory abstraction or changing required-path validation behavior.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts && git diff --check -- installer/src/core/cc-payload-inventory.ts tests/cc-payload-entrypoints.test.ts`

## // 002. Staging, archive membership, and staged-byte manifest

**Edited production file:** `installer/scripts/bundle-cc-ein.ts`

**Focused test:** `tests/cc-payload-bundle.test.ts`

- [x] 2.1 RED — Create the focused bundle test against an invocable bundle seam: use a temporary checkout with known canonical bytes and assert archive membership, byte-for-byte content, manifest path, and SHA-256; cover absent, directory, and unreadable canonical inputs and assert failure before a new usable archive is produced.
  - skills: `ein-discipline`, `bun`
  - why: Defines transport behavior and fail-closed cases before exposing or changing the bundler operation.
  - learn: Archive tests must inspect the archived member and manifest, not infer integrity from the source file alone.
  - architecture: The test owns temporary I/O; it injects checkout and output locations and never invokes defaults that mutate the real installer asset.
  - avoid: Testing materialization, runtime hand-off, BunFS compilation, release workflow, or a pre-existing worktree archive.
  - verify: `bun test tests/cc-payload-bundle.test.ts` (expected RED before the seam exists)

- [x] 2.2 GREEN — Refactor the bundle operation so it accepts injectable checkout and output locations while the direct CLI entry keeps current defaults; validate every direct inventory file as present, regular, and readable, copy canonical bytes to the required payload-relative member, hash the staged copy, write the manifest, archive the staging tree, and clean temporary staging.
  - skills: `ein-discipline`, `bun`
  - why: Connects the new inventory entry to the real staging/archive pipeline without creating a second bundler implementation.
  - learn: The manifest must hash the bytes staged for archiving, not a separately read source path.
  - architecture: The bundler owns source validation, staging, manifest generation, and tar creation; the CLI is only the default adapter.
  - avoid: Import-time CLI side effects, text decoding/rewriting, recursive transport of the agent tree, or a new bundling class/layer.
  - verify: `bun test tests/cc-payload-bundle.test.ts`

- [x] 2.3 TRIANGULATE — Exercise valid and invalid temporary fixtures together, including exact archive-relative membership, byte equality between source, staged copy, and archive member, manifest version and digest, and absence of a newly valid output after source failure.
  - skills: `ein-discipline`, `bun`
  - why: Triangulates the complete transport chain and catches source-hash/staged-byte drift and permissive directory handling.
  - learn: Fail-closed transport is observable at the output boundary: an error must not leave a plausible replacement payload.
  - architecture: Tests remain at the bundle boundary; existing extraction and integrity consumer logic is an immutable downstream seam.
  - avoid: Using the observed baseline digest as a code constant or relying on the ignored real archive for assertions.
  - verify: `bun test tests/cc-payload-bundle.test.ts`

- [x] 2.4 REFACTOR — Keep the injected seam minimal, preserve existing root/source-closure ordering and manifest sorting, and ensure CLI defaults and temporary cleanup remain explicit without touching runtime or release code.
  - skills: `ein-discipline`, `bun`
  - why: Prevents the test seam from becoming a second production path or changing unrelated payload behavior.
  - learn: A transport refactor is complete only when tests can isolate it and the normal build entry remains unchanged.
  - architecture: One production bundler operation serves both focused tests and the existing CLI/build caller.
  - avoid: Adding an alternate archive format, changing archive destination semantics, or checking in generated output.
  - verify: `bun test tests/cc-payload-bundle.test.ts && (cd installer && bun run typecheck)`

## // 003. Existing payload fixture compatibility and final transport gates

**Edited production files:** none

**Focused tests:**

- `tests/installer-runtime-menu.test.ts`
- `tests/cc-payload-entrypoints.test.ts`
- `tests/cc-payload-bundle.test.ts`

- [x] 3.1 RED — Make the existing Claude runtime payload fixture explicitly expect the new required member, without adding assertions about extraction or runtime materialization.
  - skills: `ein-discipline`, `bun`
  - why: Exposes the compatibility gap caused by the inventory contract before changing fixture data.
  - learn: Existing consumer fixtures should model newly required transport members while keeping downstream behavior unchanged.
  - architecture: This test remains a downstream contract check only; the existing payload consumer stays immutable.
  - avoid: Editing production extraction logic just to make an incomplete fixture pass.
  - verify: `bun test tests/installer-runtime-menu.test.ts` (expected RED until fixture data is updated)

- [x] 3.2 GREEN — Add the exact canonical member and deterministic fixture bytes to the existing explicit archive/staging fixture and its manual required-path enumeration, changing no behavior outside that fixture.
  - skills: `ein-discipline`, `bun`
  - why: Keeps the established payload fixture aligned with the required-path inventory and valid transport layout.
  - learn: A fixture update should represent the contract, not broaden the feature into materialization or hand-off.
  - architecture: Fixture data owns this compatibility adjustment; production consumers remain unchanged.
  - avoid: Adding checkout sync, runtime installation, BunFS smoke, release assertions, or a second source copy.
  - verify: `bun test tests/installer-runtime-menu.test.ts`

- [x] 3.3 TRIANGULATE — Run the three focused transport tests together and confirm inventory, real temporary bundling, archive bytes, manifest digest, invalid-input failures, and the existing payload fixture agree on the same exact route.
  - skills: `ein-discipline`, `bun`
  - why: Detects contract drift between inventory, bundler, and the pre-existing fixture before broad project gates.
  - learn: Cross-boundary triangulation is strongest when each focused test owns a distinct seam and they share only the declared route contract.
  - architecture: Scope ends at archive/manifest transport; extraction and runtime behavior are observed only through the existing fixture boundary.
  - avoid: Treating a passing full suite as proof of byte preservation without the dedicated archive inspection test.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts`

- [x] 3.4 REFACTOR — Review the final diff for transport-only scope, remove accidental generated or protected changes, and run the required project gates after the focused suite is green.
  - skills: `ein-discipline`, `bun`
  - why: Confirms the change is deliverable without leaking deferred work into this transport change.
  - learn: Generated archives are verification outputs, while immutable sources and protected worktree paths must remain untouched and uncommitted.
  - architecture: Final ownership remains limited to inventory, bundler, and the three declared test files; existing consumers and adapters are immutable.
  - avoid: Cleaning or overwriting unrelated worktree changes while validating the diff.
  - verify: `git diff --check && bun test && bun run typecheck && (cd installer && bun run typecheck)`
