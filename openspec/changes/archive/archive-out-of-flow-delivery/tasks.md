# Tasks — archive-out-of-flow-delivery

status: ready
blocked_by: none

## // 001. Foundational reconciliation contract and pure validator

- [x] 1.1 Add the shared `scope-only-out-of-flow` evidence types and pure validator in `ein-pi/agent/lib/sdd-reconciliation.ts`, with no filesystem, process, Git, or archive operations.
  - skills: `architecture`, `ein-discipline`, `bun`
  - why: Establish the single deterministic contract for profile, identity, reasons, summary metadata, repository checks, and stable blocker families before consumers exist.
  - learn: Pure validators make fail-closed policy testable without giving evidence the ability to execute commands.
  - architecture: The shared core owns classification only; close owns I/O and adapters remain translators.
  - avoid: Do not infer eligibility from absent artifacts, change names, timestamps alone, or `force`.
  - verify: `bun test tests/sdd-reconciliation.test.ts`
  - evidence: RED first adds failing contract cases; GREEN implements the minimum validator; TRIANGULATE covers malformed/unknown/duplicate/mixed-state and reason/summary/check mismatches; REFACTOR keeps the API pure and blocker output stable.

- [x] 1.2 Add mirrored tests in `tests/sdd-reconciliation.test.ts` for valid evidence and every denied contract family, including exact profile/version, change and reason binding, summary requirements, repository-state identity, non-passing/non-concrete checks, and no command execution.
  - skills: `ein-discipline`, `bun`
  - why: Prove the foundational contract independently before router, close, or surface integration.
  - learn: Evidence validation must reject ambiguity and stale state rather than upgrade uncertainty to success.
  - architecture: Tests exercise the pure boundary with supplied parsed facts and repository identity, not filesystem fixtures or adapter behavior.
  - avoid: Do not add `docs-site-shell` production allowlists or fabricate lifecycle artifacts.
  - verify: `bun test tests/sdd-reconciliation.test.ts`
  - evidence: RED demonstrates absent/invalid behavior; GREEN passes the narrow happy path; TRIANGULATE adds property-like permutations and identity mismatches; REFACTOR removes duplicated fixtures without weakening assertions.

## // 002. Router eligibility and blocker classification

- [x] 2.1 Extend `ein-pi/agent/lib/sdd-router.ts` to classify exact scope-only eligibility and reconciliation blockers while preserving declarationless recognition, ordinary readiness, sequence, synchronization, conflict, freshness, apply, verify, and task guards.
  - skills: `architecture`, `ein-discipline`, `bun`
  - why: Readiness must distinguish the new explicit profile from ordinary close and retain all existing guards.
  - learn: Eligibility is shape- and evidence-driven; the migration target’s name is never policy.
  - architecture: Router aggregates deterministic readiness facts and stable blocker codes; it does not read evidence commands or move files.
  - avoid: Do not broaden `declarationlessLegacyEligible`, treat `spec_delta: none` as the force escape, or make `ein_sdd_check` archival-aware.
  - verify: `bun test tests/sdd-router.test.ts`
  - evidence: RED adds failing classification cases; GREEN wires the validator facts; TRIANGULATE proves ordinary, legacy-force, pending/conflict, local-delta, mixed-artifact, and profile-absent behavior; REFACTOR preserves existing status expectations.

- [x] 2.2 Extend `tests/sdd-router.test.ts` with focused reconciliation classification cases, retaining all existing unresolved/conflict/pending/synchronized and declarationless eligibility assertions.
  - skills: `ein-discipline`, `bun`
  - why: Lock the shared decision and guard preservation before archive mutation is connected.
  - learn: Stable blocker families are the adapter-independent observable contract.
  - architecture: Router tests validate classification and aggregation only; evidence parsing and archive mutation stay outside this suite.
  - avoid: Do not turn missing evidence into an implicit legacy success.
  - verify: `bun test tests/sdd-router.test.ts`
  - evidence: RED captures the new expected blockers; GREEN covers allowed shape; TRIANGULATE covers all denied shape/spec/profile combinations; REFACTOR keeps test setup explicit and bounded.

## // 003. Core close and archive integration

- [x] 3.1 Extend `ein-pi/agent/lib/sdd-close.ts` to accept explicit reconciliation options, read only the canonical evidence/summary paths, compute current repository identity, validate before mutation, return `reconciliation`, and keep `legacyEscape` and ordinary close semantics unchanged.
  - skills: `architecture`, `ein-discipline`, `bun`
  - why: This is the sole archive boundary and must enforce evidence, safe paths, collisions, and non-mutation on denial.
  - learn: Filesystem-boundary code supplies facts to a pure validator; it never executes commands described by evidence.
  - architecture: Close owns reads, current-state acquisition, final gate aggregation, and move; router owns readiness classification.
  - avoid: Do not accept arbitrary evidence paths, combine `force` with reconciliation, or archive before every validation succeeds.
  - verify: `bun test tests/sdd-close.test.ts`
  - evidence: RED introduces failing close cases; GREEN implements canonical-path validation and successful result shape; TRIANGULATE covers stale/malformed/mismatched evidence, collisions, unsafe names, mixed mode, no mutation, and legacy-force regression; REFACTOR isolates I/O from policy.

- [x] 3.2 Extend `tests/sdd-close.test.ts` for allowed reconciliation, denied evidence/reason/summary/shape/state cases, ordinary incomplete close, force separation, result distinction, and source/archive immutability.
  - skills: `ein-discipline`, `bun`
  - why: Prove the archive boundary is narrowly auditable and fail-closed.
  - learn: A successful reconciliation result is distinct evidence, not a reinterpretation of `legacyEscape`.
  - architecture: Close tests own temporary repository fixtures and mutation assertions; pure policy remains covered by the foundational suite.
  - avoid: Do not close or mutate the real `openspec/changes/docs-site-shell` record.
  - verify: `bun test tests/sdd-close.test.ts`
  - evidence: RED proves each new denial; GREEN proves one valid archive path; TRIANGULATE checks all applicable blockers and unchanged files; REFACTOR keeps fixtures representative without retrospective artifacts.

## // 004. Pi surface wiring

- [x] 4.1 Add `reconciliationProfile` and `reconciliationEvidencePath` to the Pi close tool and slash-command flow in `ein-pi/agent/extensions/ein-ai.ts`, preserving `reason`, check/audit behavior, and shared close delegation.
  - skills: `ein-discipline`, `bun`
  - why: Pi must expose explicit selection and canonical evidence without implementing policy locally.
  - learn: Runtime surfaces translate arguments; they do not create a second close decision engine.
  - architecture: `ein-ai.ts` owns schema/argument translation and presentation, while `sdd-close.ts` remains authoritative.
  - avoid: Do not add a force-like default, infer profile from a path, or change `ein_sdd_check` semantics.
  - verify: `bun test tests/agent-tools-contract.test.ts`
  - evidence: RED adds contract failures; GREEN wires exact fields; TRIANGULATE checks missing, malformed, mixed-mode, and equivalent explicit requests; REFACTOR keeps schemas and slash parsing aligned.

- [x] 4.2 Extend `tests/agent-tools-contract.test.ts` with Pi tool schema and invocation coverage for the profile, evidence, reason, and unchanged audit/check contracts.
  - skills: `ein-discipline`, `bun`
  - why: Prevent surface drift from the shared close contract.
  - learn: Explicit options must be visible and auditable at every entry point.
  - architecture: Contract tests cover adapter shape, not archive policy internals.
  - avoid: Do not broaden tests into unrelated status, memory, or UI behavior.
  - verify: `bun test tests/agent-tools-contract.test.ts`
  - evidence: RED/GREEN/TRIANGULATE/REFACTOR records schema, delegation, invalid-option, and unchanged-check evidence.

## // 005. Claude CLI surface wiring

- [x] 5.1 Add `--reconciliation-profile`, `--reconciliation-evidence`, and `--reason` translation in `cc-ein/sdd-cli/cli.ts`, delegating to the same core close behavior and preserving exit/report conventions.
  - skills: `ein-discipline`, `bun`
  - why: Claude must offer equivalent explicit controls without a CLI-only bypass.
  - learn: Parity means equivalent core decisions, not identical formatting.
  - architecture: CLI dispatch parses flags and reports results; shared close owns validation and mutation.
  - avoid: Do not implement separate eligibility logic or permit arbitrary evidence locations.
  - verify: `bun test tests/core-parity-openspec.test.ts`
  - evidence: RED adds failing subprocess/CLI cases; GREEN wires flags; TRIANGULATE checks parity and denied malformed/mixed-mode requests; REFACTOR preserves existing `check` and `close` behavior.

- [x] 5.2 Extend `tests/core-parity-openspec.test.ts` with focused Claude close flag coverage, including equivalent success/blocker classification and unchanged check behavior.
  - skills: `ein-discipline`, `bun`
  - why: Verify the second adapter cannot accidentally weaken the shared guards.
  - learn: Surface tests should assert the contract boundary and exit/report semantics, not duplicate core validator tests.
  - architecture: CLI tests invoke the documented command surface against isolated fixtures; no real legacy record is archived.
  - avoid: Do not add docs-site-shell migration steps to implementation or test fixtures.
  - verify: `bun test tests/core-parity-openspec.test.ts`
  - evidence: RED/GREEN/TRIANGULATE/REFACTOR covers flags, canonical path, reason propagation, failure exits, and check non-archival behavior.

## // 006. Integrated regression and repository verification

- [x] 6.1 Run the focused suites, then repository-wide `bun test` and `cd installer && bun run typecheck`; confirm ordinary close guards, declarationless legacy escape, Pi/Claude parity, and denied non-mutation behavior remain intact.
  - skills: `ein-discipline`, `bun`, `architecture`
  - why: The change alters an observable close contract across core and two adapters.
  - learn: Strict TDD evidence is complete only after focused proof and whole-repository regression.
  - architecture: Verification checks one shared policy with thin runtime adapters and no docs-site-shell archive mutation.
  - avoid: Do not run archival migration or create retrospective lifecycle artifacts for `docs-site-shell`.
  - verify: `bun test tests/sdd-reconciliation.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts tests/agent-tools-contract.test.ts tests/core-parity-openspec.test.ts && bun test && (cd installer && bun run typecheck)`
  - evidence: RED → GREEN → TRIANGULATE → REFACTOR results from prior groups are summarized, then integrated suites provide final regression evidence.

Post-verify migration: archival of `docs-site-shell` into its archive is intentionally outside this apply plan and may occur only after verification through the dedicated audited path.
