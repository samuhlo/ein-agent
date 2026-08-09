# Tasks — cleaner-read-only-audit

status: ready
blocked_by: none

## // 001. Establish the audit contract tests

- [x] 1.1 Create `tests/cleaner-read-only-audit.test.ts` with typed fixtures for B `ProjectStateV1` and G-owned normalized assessments, covering report shape, traceability, closed classifications/rules/severities, opaque evidence, and `applied: false`/`appliedChanges: 0`.
  - skills: `ein-discipline`, `architecture`
  - why: Lock the pure H boundary and prevent scope drift into B/G authority or mutation behavior.
  - learn: A read-only audit receives values; it does not acquire state or receive capabilities.
  - architecture: Tests treat `ein-pi/agent/lib/project-state.ts` and `reviewed-area-ledger*.ts` as consumed authorities, never modified or reimplemented.
  - avoid: Do not use workspace paths, raw evidence, source contents, writer callbacks, or ad hoc review labels in fixtures.
  - verify: `bun test tests/cleaner-read-only-audit.test.ts` (RED: import/entrypoint is intentionally absent before implementation).

- [x] 1.2 Add RED assertions in the same test file for stale/invalid/unavailable/unknown/missing state or evidence, deterministic ordering/IDs under reordered inputs, deep immutability, and rejection/unreachability of mutation intent.
  - skills: `ein-discipline`, `architecture`
  - why: Encode fail-closed uncertainty, repeatability, and the explicit no-mutation acceptance contract before implementation.
  - learn: Non-current evidence stays visible as uncertainty and never becomes approval or an actionable current opportunity.
  - architecture: The test boundary exposes only readonly B/G projections and has no filesystem, process, network, persistence, or writer dependency.
  - avoid: Do not assert unsupported repository-cleanup heuristics; ordinary Git changes are observations or questions only.
  - verify: `bun test tests/cleaner-read-only-audit.test.ts` (RED evidence recorded in the test run output).

## // 002. Implement the foundational pure audit module

- [x] 2.1 Create only `ein-pi/agent/lib/cleaner-read-only-audit.ts` with readonly input/output types and `auditCleanerReadOnly(input): CleanerAuditReportV1`; keep imports limited to value/type contracts needed from B/G, with no `node:fs`, `node:child_process`, Git executor, network, writer, store, or callback capability.
  - skills: `ein-discipline`, `architecture`
  - why: Provide the smallest new H seam as a pure function over supplied authoritative values.
  - learn: Capability absence at the function boundary is stronger than runtime promises about not calling a writer.
  - architecture: H owns classification and output projection; B owns state identity/quality, G owns review/evidence semantics, and the caller owns read-only acquisition.
  - avoid: Do not accept `cwd`, call B projection or G workspace readers, import ledger replacement exports, persist/cache state, or reuse skill-maintenance cleaners.
  - verify: `bun test tests/cleaner-read-only-audit.test.ts` (GREEN after implementing the contract).

- [x] 2.2 Implement canonical privacy-safe finding construction: closed rule/classification/severity/confidence values, bounded area/source identity, exact or explicit unavailable state identity, G outcome/freshness/reason, opaque evidence status, deterministic uncertainty, SHA-256 `cleaner-finding-v1` IDs, UTF-8 byte ordering, and deeply frozen output with zero applied changes.
  - skills: `ein-discipline`, `architecture`
  - why: Make equivalent B/G values produce byte-stable, traceable reports without exposing sensitive payloads.
  - learn: Determinism requires canonical semantic fields only—never timestamps, insertion order, absolute paths, or session identity.
  - architecture: The module maps G outcomes rather than interpreting ledger transitions and never creates a competing state/evidence authority.
  - avoid: Do not promote `reviewed` to approval, treat dirty/changed state as removable, include reviewer identity or raw evidence, or manufacture current facts from stale inputs.
  - verify: `bun test tests/cleaner-read-only-audit.test.ts` (GREEN assertions for IDs, ordering, immutability, traceability, and no-change output).

- [x] 2.3 Triangulate and refactor the module against the contract: inspect imports/dependency graph for forbidden writers and side effects, then simplify any duplicated rule/uncertainty logic without widening the closed rule surface.
  - skills: `ein-discipline`, `architecture`
  - why: Confirm the implementation is structurally read-only, not merely behaviorally read-only in examples.
  - learn: Read-only guarantees need both behavioral tests and dependency-boundary evidence.
  - architecture: The only production artifact in this group is the foundational H module; consumers and acquisition wiring remain out of scope.
  - avoid: Do not add generic plugin strategies, injectable services, filesystem snapshots inside production code, or convenience imports from maintenance writers.
  - verify: `bun test tests/cleaner-read-only-audit.test.ts && rg "replaceWorkspaceLedger|replaceReviewedAreaLedger|writeEinMd|cleanSkills|child_process|node:fs|fetch|spawn|exec|rename|writeFile" ein-pi/agent/lib/cleaner-read-only-audit.ts` (TRIANGULATE/REFACTOR evidence; forbidden-import search must return no matches).

## // 003. Contract hardening and focused verification

- [x] 3.1 Extend `tests/cleaner-read-only-audit.test.ts` with before/after snapshots of supplied B/G objects and representative external/repository-observer values, plus an untyped mutation-attempt case that must be rejected or unreachable; preserve existing B/G tests unchanged.
  - skills: `ein-discipline`, `architecture`
  - why: Prove no input mutation, writer invocation, or external side effect is reachable through the public audit boundary.
  - learn: A report can suggest an opportunity while recording that nothing was applied.
  - architecture: Side-effect observation belongs in tests/caller integration; the production audit remains pure and path-free.
  - avoid: Do not add a production adapter that accepts arbitrary services just to test rejection.
  - verify: `bun test tests/cleaner-read-only-audit.test.ts tests/shared-project-state.test.ts tests/reviewed-area-ledger.test.ts`.

- [x] 3.2 Run final strict-TDD evidence and focused static checks for the exact two H files, documenting RED→GREEN→TRIANGULATE→REFACTOR results in the apply/verify artifacts.
  - skills: `ein-discipline`, `architecture`
  - why: Demonstrate the bounded change satisfies the contract without claiming broad repository coverage.
  - learn: The configured installer typecheck is not coverage for this `ein-pi` module; focused Bun tests are the relevant check.
  - architecture: No source/test changes outside `ein-pi/agent/lib/cleaner-read-only-audit.ts` and `tests/cleaner-read-only-audit.test.ts` are permitted.
  - avoid: Do not run or introduce Git commands, process spawning, network calls, or mutation-oriented verification helpers in the audit implementation.
  - verify: `bun test tests/cleaner-read-only-audit.test.ts tests/shared-project-state.test.ts tests/reviewed-area-ledger.test.ts && rg "node:fs|node:child_process|replaceWorkspaceLedger|replaceReviewedAreaLedger|writeEinMd|cleanSkills|spawn|exec|fetch" ein-pi/agent/lib/cleaner-read-only-audit.ts`.
