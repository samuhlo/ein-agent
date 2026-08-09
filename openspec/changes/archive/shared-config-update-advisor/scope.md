# Scope — shared-config-update-advisor

## SCOPE PACKET

```yaml
scope: Implement roadmap block F only: a deterministic, read-only shared configuration/update advisor that normalizes state and recommendations, exposes them consistently through relevant existing surfaces, separates advice from action, and preserves installer ownership of install/update operations.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
```

## Execution context

- Web fetching is disabled (`webfetch: false`).
- `openspec/config.yaml` is preserved and authoritative: Node.js/TypeScript ESM, Bun, `strict_tdd: true`; no reliable configured test runner; configured typecheck is `cd installer && bun run typecheck`.
- This is the scope phase only. It does not map, design, implement, edit product source, run tests/build/typecheck, or write apply/verify artifacts.

## Problem and objective

After beta, configuration and update information must have one deterministic read-only interpretation instead of surface-specific guesses. The advisor should tell a user what configuration/update state is known, incomplete, unavailable, conflicting, or actionable; it must not perform the action or imply that an installer-owned operation happened. Existing consumers, including the separate launcher and relevant installer-adjacent surfaces, should consume the same contract without turning the launcher into an updater.

## Baseline and dependencies

- **A:** beta truth and exit criteria establish the post-beta boundary and preserve OpenSpec, EIN.md, and Git authority.
- **B:** `shared-project-state-contract` is the state/provenance foundation; reuse its source-attributed quality, exact-state/freshness, ambiguity, and no-competing-store guarantees rather than creating a second project-state owner.
- **C/D:** runtime adapters and the minimal workbench/launcher are existing consumers; launcher orchestration remains separate from installer ownership.
- **E:** `beta-launcher-e2e-hardening` is the immediate predecessor and provides the merged launcher E2E/error/staleness baseline. F depends on E and reuses B's state contract.
- **Roadmap authority:** `docs/roadmap-features-ein.md`, block F, and its dependency diagram are authoritative. G–L are later work and are not dependencies of this slice.

## In scope

1. Define one shared, deterministic read-only advisor contract for relevant configuration and update state, recommendation, quality/status, provenance, reason, and ownership/action distinction.
2. Read the existing authoritative configuration/version/update signals and installer capability boundaries; preserve missing, unreadable, unsupported, conflicting, stale, and ambiguous states instead of guessing.
3. Produce recommendations such as configuration attention, update availability, already-current/no-action, unavailable, or installer-owned-next-step only when evidence supports them. Recommendations are informational and must not execute mutation.
4. Expose equivalent state and recommendation semantics to the relevant existing surfaces, including the launcher where applicable, without duplicating authority or introducing a second cache/store/projector.
5. Make installer ownership explicit: install, update, repair, release, and any mutating configuration operation remain behind the installer’s existing action boundary. The advisor may identify the boundary and provide an actionable handoff, but never invoke or claim it.
6. Add focused deterministic tests in later phases for complete/current state, update available, configuration missing/incomplete, unavailable source, conflicting/ambiguous data, unsupported capability, stale evidence, consistent multi-surface rendering, read-only/no-write behavior, and installer ownership.

## User-visible acceptance

- A user sees the same configuration/update state and recommendation from each participating surface for equivalent inputs.
- Advice clearly labels whether configuration is current, incomplete, unavailable, unsupported, conflicting, or ambiguous, with a useful reason where it cannot decide.
- An available update or needed configuration action is described as a recommendation/handoff; the UI does not claim automatic updating, completed work, or an action that was not performed.
- The launcher can explain that the installer owns the required install/update operation without acquiring installer logic or becoming a universal updater.
- No advisor read creates or modifies configuration, installer files, updater state, project state, session history, caches, or release state.

## Strict authority boundaries and non-goals

- **Installer owns:** installation, runtime installation, update, repair, release/version publication, and mutating installer configuration. F must call none of these from read-only advice.
- **Shared advisor owns:** normalization and deterministic recommendation semantics only; it is not a state store, scheduler, updater, or command executor.
- **Launcher owns:** presentation/orchestration only; do not move installer logic into it.
- **Authoritative sources remain authoritative:** consume existing configuration/version/update and B state seams; do not reparse or fork them casually.
- Explicitly exclude universal or advanced updater behavior, automatic/background updates, update execution, installer logic moved into the launcher, dashboard/general navigation, session/history changes, cleaner/architect work, safe parallelism, post-beta G–L features, and unrelated configuration refactors.

## Ambiguity and error contract

The result must fail closed. Missing/unreadable configuration or metadata is not “current”; conflicting versions/capabilities are not silently resolved; unknown network/provider/update information is unavailable rather than offline or up-to-date; unsupported actions remain unsupported. Preserve a deterministic reason and source quality, and leave unaffected sources available. No recommendation may be rendered as an executed action.

## Test strategy context

Strict TDD remains enabled for later phases: establish failing focused contract tests, implement the smallest shared seam, then triangulate across surfaces and state/error combinations. Use repository-local Bun conventions and fakes/fixtures; do not depend on network, real installer mutation, provider processes, or release infrastructure. Verify no writes by snapshotting relevant state and assert installer action boundaries are not invoked. Scope does not claim test execution.

## Review-sized slicing

Keep implementation to review-sized slices: (1) advisor state/recommendation contract and pure deterministic evaluation; (2) authoritative source adapters and explicit error/ambiguity handling; (3) one surface integration plus ownership-handoff presentation; (4) remaining existing surface consistency and focused regression tests. Map/design must confirm exact files and may split any slice exceeding the 400 production-line review budget; do not combine updater execution or unrelated refactoring into F.

## Persisted behavior declaration provenance

This change carries its sole validated behavior declaration at:

`openspec/changes/shared-config-update-advisor/specs/sdd-lifecycle/spec.md`

- format: `openspec-delta/v1`
- domain: `sdd-lifecycle`
- SHA-256: `5bea36625791674a680b8d53bfcf1074fca5a44c3afcae821109d089b8176685`
- bytes: `2787`
- scenarios: `shared-config-advisor-normalizes-readonly-state`, `shared-config-advisor-separates-advice-from-action`, `shared-config-advisor-fails-closed-on-ambiguity`, `shared-config-advisor-consistent-surfaces`

The persisted delta is the declaration; no `spec_delta: none` block is present.

## Handoff

Map only the bounded advisor contract, authoritative read seams, relevant existing consumers, ownership/error boundaries, focused tests, and review-sized slices above. Do not design or edit source during scope.
