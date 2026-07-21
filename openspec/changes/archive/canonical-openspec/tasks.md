# Tasks — canonical-openspec

status: ready
blocked_by: none

strict_tdd: false

## Forecast

| Category | Estimated changed lines |
|---|---:|
| Production | ~720 |
| Tests | ~980 |
| Docs/specs | ~210 |
| Generated | ~45 (`sync-report.md`) |
| Lockfile | 0 |

Forecast is an implementation estimate only; it does not select a PR topology.

## // 001. Foundational OpenSpec contract and canonical grammar

**Production files:** `ein-pi/agent/lib/openspec-spec-contract.ts`  
**Focused tests:** `tests/openspec-specs.test.ts`

- [x] 1.1 Define the versioned domain/scenario types, stable IDs, canonical spec serialization, and byte-stable digest primitives for `openspec-spec/v1`.
  - skills: `architecture`, `bun`
  - why: Gives every later parser, synchronizer, and guard one small shared contract instead of duplicating identity or serialization rules.
  - learn: A stable scenario ID identifies behavior even when its human-readable wording changes.
  - architecture: Keep domain types, canonical serialization, and digest inputs pure in `openspec-spec-contract.ts`; do not introduce filesystem access or SDD routing here.
  - avoid: Do not use Markdown position, title text, mtimes, or a general Markdown AST as scenario identity or canonicalization.
  - verify: `bun test tests/openspec-specs.test.ts`

## // 002. Strict spec and delta parser

**Production files:** `ein-pi/agent/lib/openspec-spec-parser.ts`  
**Focused tests:** `tests/openspec-specs.test.ts`

- [x] 2.1 Parse and validate `openspec-spec/v1` and `openspec-delta/v1`, including exact headers and fields, allowed operations, duplicate detection, `MODIFIED`/`REMOVED` identity references, and deterministic diagnostics.
  - skills: `architecture`, `bun`
  - why: Invalid or ambiguous behavior descriptions must fail before they can mutate a canonical spec.
  - learn: A narrow grammar is easier to test and safer to evolve than permissive Markdown parsing.
  - architecture: Depend only on the contract module; return structured valid values or stable validation errors, with no filesystem mutation.
  - avoid: Do not silently accept extra fields, unknown operations, repeated IDs, incomplete scenarios, or implicit rename semantics.
  - verify: `bun test tests/openspec-specs.test.ts`

## // 003. Deterministic synchronization and evidence report

**Production files:** `ein-pi/agent/lib/openspec-spec-sync.ts`, `ein-pi/agent/lib/openspec-spec-sync-fs.ts`  
**Focused tests:** `tests/openspec-specs.test.ts`

- [x] 3.1 Build the pure, all-domains sync plan and versioned `sync-report.md` serializer: sort inputs, evaluate operations against the original snapshot, detect conflicts, and calculate the required base, delta, and result digests.
  - skills: `architecture`, `bun`
  - why: Planning before writing guarantees that an ambiguous delta cannot partially alter a canonical spec.
  - learn: Determinism comes from controlling input order and byte representation, not from filesystem enumeration or timestamps.
  - architecture: Put planning, conflict diagnostics, report parsing, and spec-state evaluation in `openspec-spec-sync.ts`; preserve the parser as the grammar boundary.
  - avoid: Do not apply operations incrementally, infer state from mtimes, or mark a report synchronized before its result bytes are known.
  - verify: `bun test tests/openspec-specs.test.ts`

- [x] 3.2 Add the filesystem adapter that reads only canonical OpenSpec paths, writes same-directory temporaries, restores snapshots after capturable replacement failures, writes the report last, and no-ops when synchronized evidence already matches.
  - skills: `architecture`, `bun`
  - why: The pure plan needs an explicit I/O boundary that cannot leave a trustworthy synchronized report after a failed write.
  - learn: Writing evidence last makes incomplete mutations observable and therefore safe to block at close time.
  - architecture: Limit `openspec-spec-sync-fs.ts` to reading, temporary replacement, restoration, and report persistence; it consumes but does not redefine the pure sync plan.
  - avoid: Do not write specs or reports under `.sdd`, mutate during close, or add a journal/transitional phase outside the approved design.
  - verify: `bun test tests/openspec-specs.test.ts`

## // 004. Delta guardrails, routing state, and close guard

**Production files:** `ein-pi/agent/lib/sdd-guardrails.ts`, `ein-pi/agent/lib/sdd-router.ts`, `ein-pi/agent/lib/sdd-close.ts`  
**Focused tests:** `tests/sdd-guardrails.test.ts`, `tests/sdd-router.test.ts`, `tests/sdd-close.test.ts`

- [x] 4.1 Validate exactly one resolved declaration mode for OpenSpec changes: valid delta files or the consecutive `spec_delta: none` scope block with a non-sentinel one-line reason; preserve the legacy `.sdd` fallback unchanged.
  - skills: `architecture`, `bun`
  - why: Active OpenSpec changes need a clear, lintable answer for whether their behavior has a synchronizable delta.
  - learn: An explicit justified absence is data, not a missing artifact.
  - architecture: Keep declaration/path/grammar checks in guardrails and delegate grammar interpretation to the parser rather than duplicating it in regular expressions.
  - avoid: Do not require new spec artifacts for `.sdd` fallback changes or treat the simultaneous `none` block and delta files as valid.
  - verify: `bun test tests/sdd-guardrails.test.ts`

- [x] 4.2 Surface the precedence-ordered spec state through routing and make `assessCloseReadiness` reject unresolved, pending, malformed, stale, and conflict states even under legacy `force`, without running synchronization from close.
  - skills: `architecture`, `bun`
  - why: Close must validate reproducible evidence rather than create or repair that evidence implicitly.
  - learn: A guard is reliable when it evaluates current facts and has no hidden side effects.
  - architecture: Router/readiness consumes the pure state evaluator; `sdd-close.ts` remains the archive boundary and must not write specs, deltas, or reports.
  - avoid: Do not add an eighth SDD phase, weaken existing apply/verify/summary checks, or allow `force` to bypass the canonical spec guard.
  - verify: `bun test tests/sdd-router.test.ts && bun test tests/sdd-close.test.ts`

## // 005. Bounded canonical-spec context for scope and design

**Production files:** `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/core/agents/sdd-scope.md`, `ein-pi/core/agents/sdd-design.md`, `ein-pi/agent/assets/orchestrator.md`  
**Focused tests:** `tests/sdd-scope-packet.test.ts`, `tests/sdd-flow-contract.test.ts`

- [x] 5.1 Wire explicit domain hints into scope/design prompt construction, resolve only exact canonical spec paths, and record path, SHA-256, and byte count while enforcing the shared hard limit of three files and 32 KiB per phase.
  - skills: `architecture`, `cognitive-doc-design`, `bun`
  - why: Scope and design need enough confirmed behavior to make safe decisions without loading an unbounded repository history.
  - learn: References plus digests make context reviewable while keeping prompts intentionally small.
  - architecture: Keep selection at the existing AI prompt boundary, use the canonical contract digest logic, and keep agent assets declarative about required hints and recorded references.
  - avoid: Do not glob all domains, truncate oversized context silently, load specs from `.sdd`, or create a new AI phase.
  - verify: `bun test tests/sdd-scope-packet.test.ts && bun test tests/sdd-flow-contract.test.ts`

- [x] 5.2 Update the scope/design and orchestration contracts so design reuses scope references, may add only mapped domain hints within the same limit, and blocks with an actionable narrower-selection request when the limit is exceeded.
  - skills: `cognitive-doc-design`, `architecture`, `bun`
  - why: The textual agent contracts must match the deterministic runtime limit and make the canonical source visible to future SDD work.
  - learn: A documented budget is only useful when failure is explicit rather than silently incomplete.
  - architecture: Source agent assets and the orchestrator describe the workflow; `ein-ai.ts` enforces it at runtime without duplicating behavior grammar.
  - avoid: Do not let templates claim optional memory is canonical or ask agents to reconstruct specs from archived changes.
  - verify: `bun test tests/sdd-flow-contract.test.ts && bun test tests/sdd-scope-packet.test.ts`

## // 006. Initial sdd-lifecycle canonical specification and change delta

**Production files:** none  
**Docs/spec files:** `openspec/specs/sdd-lifecycle/spec.md`, `openspec/changes/canonical-openspec/specs/sdd-lifecycle/spec.md`, `openspec/changes/canonical-openspec/sync-report.md`  
**Focused tests:** `tests/openspec-specs.test.ts`, `tests/sdd-flow-contract.test.ts`

- [x] 6.1 Author the first `sdd-lifecycle` canonical behavior and this change's ADDED-only delta from behavior confirmed or introduced by this slice, then synchronize it to produce the deterministic local report.
  - skills: `cognitive-doc-design`, `architecture`, `bun`
  - why: This proves incremental adoption on the smallest mapped domain without inventing history for unrelated domains.
  - learn: Canonical specs describe confirmed behavior, while a delta records why that behavior changed in one change.
  - architecture: `openspec/specs/sdd-lifecycle/spec.md` owns current behavior; the change-local delta owns intent; `sync-report.md` is evidence and is never an alternate source of truth.
  - avoid: Do not migrate archived changes, create other domain specs, add a `MODIFIED`/`REMOVED` operation without an existing target, or hand-edit a report inconsistent with sync output.
  - verify: `bun test tests/openspec-specs.test.ts && bun test tests/sdd-flow-contract.test.ts`
