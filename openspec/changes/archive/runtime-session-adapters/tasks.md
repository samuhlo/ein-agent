# Tasks — runtime-session-adapters

status: ready
blocked_by: none

## // 001. Normalized adapter contract and state-bound envelopes

- [x] 1.1 Add the foundational discriminated types and provider capability matrix in `ein-pi/agent/lib/runtime-session-adapters.ts` (symbols: `RuntimeProvider`, `RuntimeOperation`, `AdapterOutcome`, `AdapterErrorCode`, `ProjectBinding`, `AdapterResult`, `SessionMetadata`, `LaunchIntent`, capability descriptors), consuming `ProjectStateV1` without modifying `project-state.ts`; prove the contract with `tests/runtime-session-adapters.test.ts`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Establishes the one typed boundary before any provider consumer can encode unsupported behavior or leak private runtime data.
  - learn: A common method surface does not imply equal provider capability; discriminated outcomes make asymmetry explicit.
  - architecture: Keep the portable, data-first contract in `ein-pi/agent/lib`; retain B as the read-only state authority and keep launcher presentation outside this module.
  - avoid: Extending `ProjectStateV1`, exposing paths/transcripts, or using a class hierarchy for two provider strategies.
  - verify: `bun test tests/runtime-session-adapters.test.ts` with RED contract assertions, GREEN minimal unions/matrix, TRIANGULATE malformed state/provider/outcome/privacy cases, then REFACTOR with unchanged public discriminants.

## // 002. Bounded Pi project-scoped metadata seam

- [x] 2.1 Add the smallest additive project-filter-before-limit reader seam in `ein-pi/agent/lib/sessions.ts` (symbols: internal candidate/first-line metadata collection and project-scope scan; preserve `listRecentSessions`, `RecentSession`, `humanizeAge`, `excludePath`, and dedupe behavior), and compose it from the adapter without exposing `path`, raw id, or cwd; cover fixtures in `tests/runtime-session-adapters.test.ts` and narrowly necessary compatibility assertions in `tests/sessions.test.ts`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Provides exact repository-root/subdirectory or non-repository cwd filtering, bounded first-line reads, recency ordering, and explicit scan-limit behavior without starving a selected project or changing existing callers.
  - learn: Filter scope before applying a result limit, but keep the legacy all-project reader contract untouched.
  - architecture: Keep private filesystem details transient inside the sessions seam; normalize only `pi:v1:sha256:<64 lowercase hex>` references at the adapter boundary and never persist an index.
  - avoid: Basename/encoded-directory matching, broad `sessions.ts` refactors, transcript reads, or returning partial success after the 4,096-candidate bound.
  - verify: `bun test tests/runtime-session-adapters.test.ts tests/sessions.test.ts` using RED malformed/missing-id/cwd/unreadable/neighbor/overflow fixtures, GREEN bounded scan, TRIANGULATE duplicate/recency/privacy cases, REFACTOR while existing Pi behavior remains green.

## // 003. Request-only create, fail-closed resume, and provider translation

- [x] 3.1 Implement `create`, `resume`, `list`, and provider capability translation in `ein-pi/agent/lib/runtime-session-adapters.ts` (symbols: state validation/binding, opaque-reference validation, `createSessionRequest`, `resumeSessionRequest`, Pi/Claude adapter factories, deterministic outcome/error mapping), including exact stateRef rules and explicit Pi/Claude unsupported resume plus Claude list; prove no writes or history transfer in `tests/runtime-session-adapters.test.ts`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Delivers the lifecycle request seam while preventing guessed resume flags, cross-runtime references, wrong-project selection, stale state, and shared persistence.
  - learn: Unsupported is a successful capability declaration about missing evidence; unavailable is an environment failure, and neither should fabricate continuity.
  - architecture: Validate state/provider/reference envelopes before operation data; bind create/resume/launch to the supplied identity and exact repository `git.stateRef`, with no projector call or cache.
  - avoid: Claiming a session exists on create, reusing B runtime references as an index, or copying private transcripts between providers.
  - verify: `bun test tests/runtime-session-adapters.test.ts` with RED cross-runtime/wrong-project/unknown/missing-state/no-write tests, GREEN request/outcome implementation, TRIANGULATE stale-binding/privacy/capability-matrix tests, REFACTOR into small functions without changing codes.

## // 004. Fixed-argument isolated launch boundary

- [x] 4.1 Implement the adapter-local launch plan and injectable non-shell executor in `ein-pi/agent/lib/runtime-session-adapters.ts` (symbols: executable resolution, `buildLaunchPlan`, `executeLaunchPlan`, abort/exit normalization), using fixed Pi/Claude argv, selected `cwd`, and exact isolated environment overrides from `pi-ein/pi-ein.fish` and `cc-ein/cc-ein.fish`; extend `tests/runtime-session-adapters.test.ts` with executor spies.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: Makes launch safe and testable without Fish/installer ownership, shell interpolation, secret-file reads, runtime-store writes, or caller-controlled argv.
  - learn: Pass executable, argv, cwd, and environment as structured process inputs; never turn caller data into a command string.
  - architecture: Keep execution portable and adapter-owned with shell disabled; reproduce only the established isolation environment, while installer and launcher files remain read-only.
  - avoid: Importing installer execution as an ownership dependency, invoking Fish, accepting arbitrary argv, logging process output, or mutating configuration.
  - verify: `bun test tests/runtime-session-adapters.test.ts` with RED fixed-plan/shell/privacy/cancellation/exit tests, GREEN injectable executor and normalized results, TRIANGULATE spawn failure, signal, missing executable, metacharacter cwd, and no-write cases, REFACTOR preserving closed diagnostics.

## // 005. ProjectStateV1 metadata integration and compatibility/privacy gate

- [x] 5.1 Add the pure transient adapter-result-to-`ProjectRuntimeMetadata` translation in `ein-pi/agent/lib/runtime-session-adapters.ts` (symbol: `toProjectRuntimeMetadata` or final design equivalent), then complete compatibility/privacy assertions in `tests/runtime-session-adapters.test.ts` without changing `ein-pi/agent/lib/project-state.ts`.
  - skills: `bun`, `ein-discipline`, `architecture`, `cognitive-doc-design`
  - why: Lets a future orchestrator consume bounded capability/reference/error metadata while preserving B ownership, verification freshness, and the privacy boundary.
  - learn: Translate observations into metadata; do not turn a project snapshot into an operation store or refresh evidence during runtime actions.
  - architecture: Map unsupported/unavailable/error conditions to existing B reason codes without adding C operations to B; keep state immutable and translation persistence-free.
  - avoid: Adding session fields to `ProjectStateV1`, storing references, exposing cwd/path/transcript/command/secret data, or adding launcher UI/CLI tests.
  - verify: `bun test tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/shared-project-state.test.ts tests/installer-runtime-menu.test.ts` with RED serialized-privacy/immutability/compatibility assertions, GREEN translation, TRIANGULATE filesystem/no-migration/no-freshness and ownership checks, REFACTOR only after all four suites pass.
