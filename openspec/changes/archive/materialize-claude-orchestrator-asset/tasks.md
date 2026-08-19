# Tasks — materialize-claude-orchestrator-asset

status: ready
blocked_by: none

Protected/deferred paths are not to be reset, staged, rewritten, or absorbed: preserve the canonical orchestrator source, the archived transport inventory/bundler contract and tests, the archived checkout-sync contract and tests, all unrelated A1–A3 dirty installer and test work, the generated runtime archive as disposable output, and the untracked dogfooding plan. The installer CLI hand-off, install script, settings, inventory, bundler, sync runtime, launchers, release assets, versions, and canonical asset content remain outside this change. The existing release workflow is already wired to compile and run the Linux BunFS smoke, so it stays unchanged. Only the explicitly named focused additions to the runtime test are allowed; unrelated hunks must remain intact. Do not duplicate transport or sync semantics, and do not add a second installer path.

Strict TDD applies: each group starts with a focused RED assertion, makes the smallest GREEN change, then triangulates cleanup, isolation, and boundary behavior before refactoring. The Bun skill governs commands and BunFS behavior; the release skill only governs preservation of the already-wired workflow. Vitest and Hono do not apply because this change uses Bun’s test runner and does not touch Hono code.

## // 001. Manifest-required completeness and fail-closed staging

Touch only `installer/src/core/cc-payload.ts` and `tests/installer-runtime-menu.test.ts` in this group.

- [x] 1.1 Add RED coverage and a valid v1 fixture in `tests/installer-runtime-menu.test.ts`: require the manifest, enumerate every regular extracted member exactly once, reject malformed/incomplete/duplicate or invalid-path entries, reject missing members and digest mismatches, enforce required file-versus-directory kinds, and assert the temporary stage is removed on every rejection.
  - skills: `bun`, `ein-discipline`
  - why: The current permissive admission boundary can hand off an unmanifested or partially authenticated checkout.
  - learn: A manifest is useful only when its inventory is complete, unique, confined, and checked against staged bytes.
  - architecture: Keep payload admission, extraction, required-path typing, digest checks, and failure cleanup owned by the staging boundary; keep inventory generation upstream.
  - avoid: Do not make the manifest optional, validate only the orchestrator, or silently ignore malformed entries to preserve permissive fixtures.
  - verify: `bun test tests/installer-runtime-menu.test.ts`

- [x] 1.2 Implement GREEN validation in `installer/src/core/cc-payload.ts` while retaining the existing real-filesystem archive copy before tar extraction: require format v1, validate exact regular-file manifest coverage excluding only the manifest and local archive copy, enforce confined relative paths and SHA-256 equality, distinguish required directories from required regular files, and clean the root on every failure.
  - skills: `bun`, `ein-discipline`
  - why: This closes the only trust boundary before staged code reaches the Claude hand-off.
  - learn: BunFS resources must be copied to a real path before tools such as tar can consume them reliably.
  - architecture: `cc-payload.ts` remains the single materialization/admission owner; `cc-payload-inventory.ts` and the bundle producer remain contract owners.
  - avoid: Do not recalculate or redesign the upstream archive format, duplicate inventory logic, or weaken cleanup after partial extraction.
  - verify: `bun test tests/installer-runtime-menu.test.ts`

- [x] 1.3 TRIANGULATE the staging boundary with the upstream archive/manifest assertions and runtime cases, confirming valid payloads preserve archive bytes and canonical-member bytes while invalid payloads never return a usable stage.
  - skills: `bun`, `ein-discipline`
  - why: Cross-checking the consumer against the producer contract prevents a local validator that only works with hand-written fixtures.
  - learn: Producer and consumer should agree on staged bytes without sharing a second implementation of the producer.
  - architecture: Exercise the existing producer contract as an input and keep all assertions at the stage seam.
  - avoid: Do not edit upstream transport tests or treat the generated archive as source.
  - verify: `bun test tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts`

- [x] 1.4 REFACTOR only after the focused tests pass: keep validation helpers deterministic and readable, preserve idempotent cleanup, and typecheck the installer boundary without broadening the file set.
  - skills: `bun`, `ein-discipline`
  - why: The validator has several fail-closed branches whose ownership must stay obvious for future payload changes.
  - learn: Refactoring after triangulation is safer when every rejection branch already has an observable test.
  - architecture: Preserve a small, stateless staging API and leave caller orchestration untouched.
  - avoid: Do not fold hand-off behavior into the validator or modify protected installer CLI code.
  - verify: `cd installer && bun run typecheck`

## // 002. Existing Claude hand-off and isolated installed-home parity

Touch only the focused additions/fixture adjustments in `tests/installer-runtime-menu.test.ts`; use the existing `runClaudeInstall()` and injected `stagePayload` seams without changing protected installer production code.

- [x] 2.1 Add the RED composition test in `tests/installer-runtime-menu.test.ts`: produce a real temporary v1 payload through the existing upstream producer, stage it through the real resolver, invoke the existing Claude install hand-off with an isolated temporary home, and assert that the installed `assets/orchestrator.md` is a regular file with bytes equal to the packaged/canonical asset.
  - skills: `bun`, `ein-discipline`
  - why: Existing runner tests use a fake stage and therefore do not prove that the packaged payload reaches the installed Claude home.
  - learn: An integration seam is valuable when it composes real packaging output with an isolated destination instead of reimplementing either side.
  - architecture: The installer runner owns ordering and environment injection; the test supplies only the existing stage seam and temporary home.
  - avoid: Do not invoke sync through a copied test implementation, add a new handler, or use the real user home.
  - verify: `bun test tests/installer-runtime-menu.test.ts`

- [x] 2.2 Make the composition test GREEN with test-only fixture and option wiring: use the existing `home`/`stagePayload` options, capture staged bytes before cleanup, and prove success is reported only after sync has materialized the isolated destination.
  - skills: `bun`, `ein-discipline`
  - why: The promised behavior is the hand-off result, not merely successful extraction.
  - learn: Isolated HOME and CC_EIN_HOME values make filesystem ownership and byte parity observable without polluting the developer environment.
  - architecture: Reuse the protected runner’s existing command/env seam; leave checkout sync as the downstream owner of destination layout.
  - avoid: Do not edit installer CLI orchestration when the existing seam can express the scenario.
  - verify: `bun test tests/installer-runtime-menu.test.ts`

- [x] 2.3 TRIANGULATE failure ordering and cleanup against the existing runtime cases: a stage/sync failure must prevent launcher installation, child diagnostics must remain intact, successful hand-off must clean the stage, and downstream isolated-home parity remains green.
  - skills: `bun`, `ein-discipline`
  - why: The new success proof must not regress the already-proven fail-closed installer ordering.
  - learn: A runtime installation is successful only when required sync work and cleanup complete, not when a child process merely starts.
  - architecture: Keep launcher installation after runtime hand-off and keep cleanup in the existing caller lifecycle.
  - avoid: Do not broaden this test into transport or checkout-sync implementation coverage.
  - verify: `bun test tests/installer-runtime-menu.test.ts tests/surface-wiring.test.ts`

## // 003. Compiled BunFS smoke end-to-end

Touch only `installer/scripts/cc-payload-smoke.ts` in this group; the already-wired release workflow remains unchanged.

- [x] 3.1 Add RED smoke assertions in `installer/scripts/cc-payload-smoke.ts` for an unrelated current working directory: use the no-argument BunFS resolver/stager, capture the staged canonical bytes, run the existing Claude hand-off into a temporary isolated home, require a regular installed destination with byte parity, and require archive/root cleanup.
  - skills: `bun`, `ein-discipline`, `release`
  - why: Extraction-only smoke coverage cannot detect a distribution that stages correctly but fails at the installed-home hand-off.
  - learn: Compiled BunFS portability is proven only when the executable works without a checkout-adjacent path assumption.
  - architecture: The smoke composes the existing stage and install seams; sync remains the owner of the installed asset path and the workflow remains the distribution owner.
  - avoid: Do not reimplement checkout sync, resolve the archive from the caller checkout, or write to a real home.
  - verify: `cd installer && bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-x64 --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

- [x] 3.2 Implement GREEN smoke checks with explicit nonzero failures for missing/corrupt destination or incomplete cleanup, while preserving the existing temporary-cwd and archive-materialization assertions.
  - skills: `bun`, `ein-discipline`, `release`
  - why: The compiled smoke is the final executable-level guard that the packaged asset is usable after embedding.
  - learn: Smoke assertions should validate observable filesystem outcomes and cleanup, not internal implementation details.
  - architecture: Keep the smoke as a thin executable consumer of the existing public seams and avoid adding production abstractions.
  - avoid: Do not alter the release job, add assets/versioning work, or make the smoke pass by relaxing assertions.
  - verify: `cd installer && bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-x64 --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

- [x] 3.3 TRIANGULATE the compiled smoke and preserved contracts, then run both repository typechecks and the remaining focused contracts before delivery.
  - skills: `bun`, `ein-discipline`, `release`
  - why: The final gate must cover compiled BunFS behavior, transport entrypoints, release pointers, and both TypeScript compilation boundaries.
  - learn: A green Bun test suite is insufficient when Bun does not perform the project’s required typechecks or compiled portability check.
  - architecture: Verify composition across existing contracts without modifying any upstream or release wiring.
  - avoid: Do not publish, retag, edit workflow assets, or treat a local compiled binary as a release artifact.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts tests/release-asset-contract.test.ts && bun run typecheck && (cd installer && bun run typecheck) && cd installer && bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-x64 --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`
