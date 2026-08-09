# Tasks — shared-config-update-advisor

status: ready
blocked_by: none

## // 001. Canonical contract and normalization

- [x] 1.1 RED/GREEN/TRIANGULATE the immutable advisor contract and pure evaluator in `ein-pi/agent/lib/shared-config-update-advisor.ts`; cover both facets, statuses, freshness, stable reasons, bounded provenance, recommendations, inert installer handoffs, deterministic equal-input output, and fail-closed stale/unknown evidence.
  - skills: `ein-discipline`, `architecture`
  - why: Establish the dependency-light boundary before any reader or surface consumes it.
  - learn: A separate configuration facet prevents an unavailable release source from erasing valid configuration evidence.
  - architecture: The evaluator accepts observed evidence only and owns no filesystem, network, clock, process, cache, or mutation dependency; B's snapshot is an injected input.
  - avoid: Do not add callbacks, executable argv, raw exceptions, or a competing project-state store to the contract.
  - verify: `bun test <focused advisor contract test>`; equal fixtures serialize identically and stale evidence cannot prove current/update/handoff.

- [x] 1.2 RED/GREEN/TRIANGULATE the normalization fixtures for current, update-available, incomplete, unavailable, unsupported, ambiguous, error, and stale states in the focused advisor test file.
  - skills: `ein-discipline`
  - why: Make every validated behavior delta executable before wiring adapters.
  - learn: Missing, skipped, rejected, malformed, and stale are distinct evidence qualities, not boolean false.
  - architecture: Status and reason normalization remain centralized in the pure evaluator rather than reimplemented by consumers.
  - avoid: Do not infer `current` from absence of an update, a failed comparison, or a disabled check.
  - verify: `bun test <focused advisor contract test>`; each listed status is distinguishable and invalid evidence fails closed.

## // 002. Status-preserving configuration readers

- [x] 2.1 RED/GREEN/TRIANGULATE additive detailed mode inspection in `ein-pi/agent/lib/mode.ts` and its focused test, preserving existing `readMode` behavior while exposing precedence, missing/default, invalid, unreadable, and provenance evidence.
  - skills: `ein-discipline`, `architecture`
  - why: The advisor needs evidence currently collapsed by legacy mode readers without changing unrelated callers.
  - learn: Additive inspectors are safer than rewriting a compatibility reader's established return semantics.
  - architecture: Mode remains authority-local; the inspector translates into the shared contract and does not write configuration.
  - avoid: Do not alter the existing reader's public behavior or introduce an advisor dependency into legacy call paths.
  - verify: `bun test <focused mode/config advisor test>`; legacy mode tests remain green and malformed/missing cases retain detail only on the additive path.

- [x] 2.2 RED/GREEN/TRIANGULATE additive model-routing inspection in `ein-pi/agent/lib/model-config.ts` and its focused test, preserving legacy model reader behavior and normalizing invalid/unreadable/unsupported evidence.
  - skills: `ein-discipline`, `architecture`
  - why: Model configuration must distinguish uncertainty from a valid effective default.
  - learn: Provenance records the authority and normalized reason, never raw paths, payloads, or secrets.
  - architecture: The model adapter is read-only and authority-local; only the evaluator decides the resulting configuration facet.
  - avoid: Do not broaden this into a configuration refactor or make optional defaults silently mask invalid explicit values.
  - verify: `bun test <focused model/config advisor test>`; invalid explicit values are not current and existing model callers are unchanged.

## // 003. Evidence readers and provenance

- [x] 3.1 RED/GREEN/TRIANGULATE Pi update probe normalization in `ein-pi/agent/lib/ein-update-notice.ts` and its focused test, preserving timeout/rejection/malformed/skipped/provider uncertainty and late-result handling without blocking startup.
  - skills: `ein-discipline`
  - why: Replace lossy `EinUpdateAvailability` booleans with status-preserving observations at the notice boundary.
  - learn: A timeout must remain explicitly unavailable/error rather than become “no update.”
  - architecture: Probes observe and normalize; they never dispatch installer actions or mutate session/configuration state.
  - avoid: Do not turn the notice collector into a scheduler, cache, updater, or blocking startup gate.
  - verify: `bun test tests/ein-banner-updates.test.ts`; timeout stays uncertain, valid sources remain visible, late results are ignored, and startup continues.

- [x] 3.2 RED/GREEN/TRIANGULATE installer-owned read adapters in `installer/src/core/marker-v2.ts` plus release/capability adapter module beside installer core, with focused release-state tests; preserve `readMarkerV2` compatibility and expose safe ownership, marker, release, capability, and freshness evidence.
  - skills: `ein-discipline`, `architecture`
  - why: Installer authority must provide read evidence while retaining transaction ownership.
  - learn: An adapter may identify an action owner without performing the action.
  - architecture: Read adapters are the only installer boundary consumed by the advisor; marker writers, transactions, and mutation modules remain untouched.
  - avoid: Do not move installer logic into the launcher or resolve an action ID by spawning a command.
  - verify: `bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-state-primitives.test.ts`; malformed markers and release failures preserve stable reasons and no mutation counters change.

## // 004. Legacy compatibility and inert handoff

- [x] 4.1 RED/GREEN/TRIANGULATE the boolean-to-evidence compatibility adapter at the Pi-Ein notice boundary, covering rejected/timeout/malformed/skipped checks and preserving host-session startup safety.
  - skills: `ein-discipline`
  - why: Migrate `EinUpdateAvailability` without making false mean current or hiding uncertainty from the canonical evaluator.
  - learn: Compatibility belongs at the edge, not inside the normalized contract.
  - architecture: Legacy consumers can receive a temporary edge representation while the shared evaluator remains status-preserving.
  - avoid: Do not retain booleans in the canonical evaluator or silently downgrade errors to “no update.”
  - verify: `bun test tests/ein-banner-updates.test.ts`; old call sites remain compatible and failure states are explicit.

- [x] 4.2 RED/GREEN/TRIANGULATE inert handoff metadata and installer CLI/menu non-dispatch tests in `installer/src/cli/doctor.ts` and focused installer tests.
  - skills: `ein-discipline`, `architecture`
  - why: Prove guidance identifies installer ownership while never starting install/update/repair/configure.
  - learn: `performed: false` is a data invariant, not a promise inferred from UI text.
  - architecture: Handoff is closed typed data with existing action ID only; installer-owned execution remains outside advisor and renderers.
  - avoid: Do not add callbacks, commands, process spawning, or action dispatch to rendering.
  - verify: `bun test tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/updater-cli-entrypoints.test.ts tests/installer-runtime-menu.test.ts`; dispatch/write/spawn counters remain zero.

## // 005. Shared consumer semantics and parity

- [x] 5.1 RED/GREEN/TRIANGULATE shared semantic formatting and workbench consumption in `ein-pi/agent/lib/workbench.ts` and `ein-pi/workbench.ts`, using one advisor fixture for both facets and preserving startup suppression as presentation policy only.
  - skills: `ein-discipline`, `architecture`, `cognitive-doc-design`
  - why: Launcher/workbench must consume normalized advice instead of deriving status or ownership locally.
  - learn: Silence may suppress a notice but can never mean `current`.
  - architecture: Thin surface adapters render the shared result; domain evaluation stays framework/CLI independent.
  - avoid: Do not duplicate status precedence, release comparison, or installer ownership logic in workbench code.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts`; rendered status/reason/freshness/owner matches the fixture and no updater behavior is introduced.

- [x] 5.2 RED/GREEN/TRIANGULATE installer doctor presentation in `installer/src/cli/doctor.ts` and its focused tests, showing both facets with bounded stable labels and matching workbench/notice semantics.
  - skills: `ein-discipline`, `cognitive-doc-design`
  - why: Doctor is the installer-owned read presentation and must remain semantically aligned without taking mutation ownership from installer transactions.
  - learn: Layout can differ across surfaces; normalized meaning cannot.
  - architecture: Doctor reads the shared result through installer adapters and presents inert handoffs only.
  - avoid: Do not expand in-process `ein-doctor`, dashboard/navigation, or updater automation.
  - verify: `bun test tests/release-update-cli.test.ts tests/installer-runtime-menu.test.ts`; doctor agrees on status/reason/owner and cannot dispatch actions.

## // 006. Triangulation: ambiguity, privacy, and staleness

- [x] 6.1 RED/GREEN/TRIANGULATE cross-surface fixture parity and ambiguity/error/staleness tests in the focused contract/consumer test files, including conflicting valid values, version regression, ambiguous ownership, stale B snapshots, and unaffected-facet preservation.
  - skills: `ein-discipline`, `architecture`
  - why: Catch drift where surfaces independently reinterpret uncertainty or stale evidence.
  - learn: Preserve valid evidence from unaffected authorities while failing closed only the affected facet.
  - architecture: B remains sole project-state authority; no reader reprojects, caches, or competes with B.
  - avoid: Do not “quiet” stale data into current or emit an actionable handoff from stale decisive evidence.
  - verify: `bun test tests/release-update-contract.test.ts tests/minimal-workbench-launcher.test.ts tests/ein-banner-updates.test.ts`; all surfaces agree and stale/ambiguous cases are non-actionable.

- [x] 6.2 RED/GREEN/TRIANGULATE privacy and read-only regression coverage across notice, workbench, and doctor tests; assert no raw paths, payloads, exceptions, environment values, tokens, opaque references, ANSI/control characters, writes, spawns, caches, or mutation calls.
  - skills: `ein-discipline`, `cognitive-doc-design`
  - why: Ensure safe bounded output and prove the advisor remains observational.
  - learn: Sanitization is part of the contract, not a cosmetic renderer concern.
  - architecture: Raw failures terminate at authority adapters; renderers receive only bounded source/reason/action identifiers.
  - avoid: Do not snapshot private fixture data into output merely to aid debugging.
  - verify: `bun test tests/ein-banner-updates.test.ts tests/release-update-integration.test.ts tests/installer-runtime-menu.test.ts`; byte state and counters are unchanged and output contains no secrets or controls.

## // 007. Focused and full verification

- [x] 7.1 Run focused regression suites after all apply batches and record failures/cleanup in `openspec/changes/shared-config-update-advisor/apply-progress.md` (verification evidence only; do not alter scope).
  - skills: `ein-discipline`
  - why: Confirm each bounded seam before the full cross-surface run.
  - learn: Focused tests localize contract/adaptor regressions before expensive integration checks.
  - architecture: Verification observes the additive read-only surfaces and leaves rollback as a clean revert of consumer wiring/adapters.
  - avoid: Do not “fix” failures by changing installer mutation ownership or adding out-of-scope G–L work.
  - verify: `bun test tests/ein-banner-updates.test.ts tests/minimal-workbench-launcher.test.ts` and `bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-state-primitives.test.ts` pass.

- [x] 7.2 Run full cross-surface verification and typecheck, including CLI/menu regressions and predecessor E2E consistency, then report expected outcomes in `openspec/changes/shared-config-update-advisor/verify-report.md`.
  - skills: `ein-discipline`
  - why: Validate parity, no-dispatch behavior, privacy, and installer compilation together.
  - learn: End-to-end consistency proves the same normalized semantics survive each presentation boundary.
  - architecture: Verification includes only scoped surfaces and confirms installer transaction/marker writers remain untouched.
  - avoid: Do not include updater automation, dashboard, ledger, cleaner, architect, parallelism, or in-process doctor expansion.
  - verify: `bun test tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/updater-cli-entrypoints.test.ts tests/installer-runtime-menu.test.ts tests/beta-launcher-e2e-hardening.test.ts && (cd installer && bun run typecheck)` passes.
