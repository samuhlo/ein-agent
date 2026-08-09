# Scope — shared-project-state-contract

## SCOPE PACKET

```yaml
scope: Define and implement the first bounded vertical slice of a deterministic shared project-state projection for future Pi/Claude adapters and the minimal launcher, normalizing OpenSpec active work, EIN.md context, exact Git worktree state, verification freshness, and runtime capability references without creating a competing state store.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
```

## Execution context

- **Execution mode:** auto, as requested for this change. The parent owns phase progression and any delivery decision.
- **Web:** disabled (`webfetch: false`). Evidence is repository-local.
- **Strict TDD:** enabled (`openspec/config.yaml` has `strict_tdd: true`). This scope phase records the requirement for later apply/verify phases but does not run tests, build, typecheck, or implementation.
- **Phase boundary:** this phase writes this scope artifact and the validated OpenSpec behavior delta only. It does not edit product source, focused tests, `apply-progress.md`, `verify-report.md`, the roadmap, or existing project documents.
- **Working-tree safety:** preserve all pre-existing dirty and untracked state. In particular, do not rewrite the pre-existing modified `EIN.md`, do not restore the deleted `docs/ein-multiagente-plan.md` or `docs/review-workload-guard.md`, and do not clean or stage unrelated files.

## Project and testing context

The existing `openspec/config.yaml` is preserved. It records a Node.js/TypeScript ESM project, Bun as the package manager, `strict_tdd: true`, and `cd installer && bun run typecheck` as the configured typecheck. Its test-runner fields and test commands are blank, so this scope does not rewrite that user-maintained configuration. Repository evidence shows the root Bun convention: `bunfig.toml` preloads `tests/preload-env.ts`, focused tests import from `bun:test`, and the later verification runner should be confirmed as `bun test` before apply/verify. No test, build, or typecheck is run here.

The project context supplied by `EIN.md` is authoritative input for this slice but is not owned by it. The current file is already dirty and must be read-only evidence; this change must not refresh, scaffold, reformat, or otherwise alter it.

## Dependency and authority boundary

The closed A record is `openspec/changes/archive/beta-truth-and-exit-criteria/`. Its summary reports `status: pass`, establishes the current installer/repository baseline separately from launcher readiness, and identifies B as the next roadmap slice. Its scope records BE-02: B must define authoritative sources and a representation for project identity, OpenSpec change/phase/next step, stable EIN context, exact Git state, runtime capabilities/references, and verification freshness; known, incomplete, unavailable, and stale states must remain visible; private conversation history is excluded.

The canonical roadmap `docs/roadmap-features-ein.md` remains the authority for B's sequence, dependency on A, acceptance, and exclusions. It distinguishes OpenSpec (active work), EIN.md (stable project context), Git (exact code state), and private runtime sessions. B is the shared contract/projection slice; C owns Pi/Claude session adapters and D owns the minimal launcher. The roadmap's updater advisor, cleaner/architect work, and safe parallelism are later horizons, not hidden dependencies of this change.

## Canonical OpenSpec context

The bounded canonical domain selected for this scope is exactly:

| path | domain | SHA-256 | bytes |
|---|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `sdd-lifecycle` | `27300f80b6f47c1a41091242fb28c44136f2087bdd3872b64f8544cc29979d17` | 21606 |

No other `openspec/specs/<domain>/spec.md` path was selected or read, and no `.sdd` specification is canonical context. The selected lifecycle scenarios constrain bounded canonical context, early-phase status, legacy SDD fallback, OpenSpec provenance, verification freshness, working-tree signalling, and the separation between advisory status and lifecycle decisions. The path is within the three-file/32 KiB phase limit.

The behavior declaration for this implementation change is the validated delta at `openspec/changes/shared-project-state-contract/specs/sdd-lifecycle/spec.md`. It is the sole declaration for this change; no `spec_delta: none` block is present or permitted in this scope artifact.

## Objective

Deliver one read-only, deterministic project-state projection that future Pi/Claude adapters and the minimal launcher can consume without becoming another owner of project data. The projection must make the current public project state portable while retaining source authority and exposing uncertainty instead of guessing.

The first usable vertical slice ends at a callable projection plus focused contract tests. It does not include session lifecycle operations, launcher presentation, or migration of runtime-private data.

## In-scope behavior

### 1. Shared projection and source ownership

- Add the smallest shared projector/type surface (or equivalent existing-library seam selected by map/design) that computes state on demand from the authoritative sources.
- Do not create a database, JSON snapshot, `.pi` project-state record, launcher-owned cache, or other competing state store. Existing OpenSpec artifacts, `EIN.md`, Git, and verification artifacts remain the sources of truth.
- Keep the projection deterministic for identical source bytes and Git state. Do not include wall-clock timestamps, random IDs, or session transcript content in the normalized contract.
- Include source/provenance and per-source quality so consumers can distinguish a value that is known/current from one that is absent, unavailable, ambiguous, incomplete, unbound, or stale.

### 2. Project identity

- Derive project identity from the selected working directory and, when available, the canonical Git repository root; preserve a deterministic non-Git identity path when Git is unavailable.
- Represent a missing/unreadable root or repository lookup as unavailable rather than substituting a neighboring project.
- Keep identity read-only. Project selection and multi-project orchestration belong to D, not to this projector.

### 3. OpenSpec active work

- Reuse the existing status/router authority (`listActiveChanges`, `resolveSddStatus`, `resolveSddNext`) rather than reimplementing phase parsing in a second store.
- Normalize the selected active change, current phase, next recommended step, artifact/status evidence, and canonical/legacy OpenSpec provenance needed by future consumers.
- If no active change exists, expose an explicit absent/done state. If multiple active changes exist without an explicit selection, expose ambiguity and candidate names; do not silently publish the router's alphabetical fallback as the shared current change.
- Preserve the existing canonical `openspec/changes/` and legacy `.sdd/changes/` distinction. Do not migrate artifacts, write specs, synchronize deltas, or change close behavior in B.
- Preserve actionable incompleteness and blockers: missing early-phase artifacts, unresolved/conflicting/pending OpenSpec provenance, blocked tasks/apply, and unknown/failing verification must remain distinguishable from a successfully completed lifecycle.

### 4. Stable EIN.md context

- Consume `readEinMd` and preserve the existing distinction between the curated project context and generated AUTO material; do not make the projector an EIN.md writer.
- Expose whether EIN.md is present, readable, empty/incomplete, or unavailable, along with the stable source/reference information already available (including its revision stamp where present).
- Never infer missing project facts from a prompt, a runtime transcript, or a second context file. An absent or incomplete EIN.md value remains visibly absent/incomplete.

### 5. Exact Git worktree state

- Extend or compose the existing Git read seam rather than treating `GitBaseline` as the complete project-state contract. The current baseline reports repository presence, dirty state, stash count, and recent reflog reset; it does not by itself identify an exact code state.
- The normalized Git state must have a deterministic exact-state identity sufficient to bind evidence: repository root/presence, full `HEAD` object identity when available, branch or detached-HEAD identity, and a stable snapshot/fingerprint of the worktree/index status including relevant tracked and untracked changes.
- Git command failure, a non-repository directory, detached HEAD, an empty repository, and an unreadable status must be explicit states, not collapsed into a clean repository.
- Keep stash/reflog reset warnings as advisory baseline signals. They must not replace the exact state identity or silently mark a tree clean.
- Do not mutate Git, stage, commit, stash, reset, checkout, or repair the worktree as part of projection.

### 6. Verification freshness

- Normalize the existing router's verification outcome and staleness signal, but require a verifiable binding to the exact Git state before presenting evidence as current.
- Represent at least these outcomes distinctly: current/freshly bound, stale/invalidated, unavailable or unbound, and failed/unknown/absent verification. A legacy report without an exact-state binding must not be promoted to current solely because its status line says `pass`.
- Define relevant-state invalidation around the exact Git identity/snapshot: any relevant change to the committed state, index, tracked worktree, or included untracked/test surface makes prior evidence stale until verification is repeated. The map/design phases must pin the precise inclusion rule and compatibility handling without weakening the fail-closed current-state signal.
- Surface the reason and both observed/current state references when evidence is stale or unbound. A session resume or runtime switch never refreshes evidence and never transfers private conversation history.
- Reuse existing verification artifacts and lifecycle gates; do not add a parallel evidence database or make B close changes automatically.

### 7. Runtime capability/reference boundary

- Reserve a normalized runtime section for Pi and Claude capabilities, availability, deterministic error/reference metadata, and the project-state identity consumed by a future adapter.
- With no adapter/provider in this slice, represent capability data as unavailable/not provided rather than probing private session stores or pretending that sessions exist.
- Expose only public capability/reference metadata. Do not list, create, resume, launch, export, migrate, or inspect private Pi/Claude conversation histories.
- Keep runtime differences and unavailable operations visible; a common field shape must not claim identical lifecycle semantics.

### 8. Focused contract tests

Later apply must add or extend focused Bun tests around the projection seams, without running them in scope. At minimum, cover:

- one deterministic projection with OpenSpec, EIN.md, Git, verification, and runtime inputs;
- no active change, multiple active changes, legacy `.sdd` state, missing/unreadable source, and malformed/incomplete source cases;
- EIN.md absence and revision/context preservation without writes;
- exact Git identity changes across HEAD, tracked/untracked worktree, index, detached HEAD, and non-repository states;
- verification current, stale/invalidated, failed/unknown, absent, and unbound reports;
- runtime unavailable/capability/error metadata without transcript leakage;
- repeat projection equality and proof that no competing state file is created;
- compatibility of existing status/router and working-tree output contracts.

Focused prior art is `tests/sdd-router.test.ts`, `tests/sdd-status-output.test.ts`, `tests/project-context.test.ts`, and `tests/git-baseline.test.ts`. A new `tests/shared-project-state.test.ts` or an equivalent narrowly named suite is allowed if design selects it. Tests belong with the implementation work unit; this scope phase writes none.

## Existing implementation seams and evidence

| Evidence | Current responsibility | B handoff constraint |
|---|---|---|
| `ein-pi/agent/lib/sdd-router.ts` | Parses active changes, current/next SDD phase, tasks/budget, OpenSpec provenance, verify outcome, and mtime-based staleness. | Compose/reuse it; do not fork phase semantics. Add exact-state projection without hiding ambiguous selections or changing existing close gates accidentally. |
| `ein-pi/agent/lib/project-context.ts` | Reads and writes EIN.md, exposes revision stamp/context directive, and maintains curated versus AUTO sections. | Read the existing source; no refresh/write in the projector and no replacement context store. |
| `ein-pi/agent/lib/git-baseline.ts` | Reads repo/dirty/stashes/recent reset and renders baseline/working-tree signals through a single channel. | Retain the warning and single-channel behavior, but add a deterministic exact Git identity for shared state rather than treating baseline as sufficient. |
| `ein-pi/agent/lib/sdd-preflight.ts` | Captures an optional Git baseline for session-start preflight. | A preflight snapshot is advisory/session input, not the shared project-state owner. |
| `tests/sdd-router.test.ts` | Covers phase routing, active changes, canonical/legacy roots, OpenSpec states, and verify staleness from delivered-file mtimes. | Preserve these behaviors while adding exact-state/freshness cases. |
| `tests/sdd-status-output.test.ts` | Covers current/next phase, active-change listing, blockers, tasks, budget, and verify status output. | Existing status remains a consumer/compatibility surface; B must not duplicate working-tree or lifecycle truth in another output channel. |
| `tests/project-context.test.ts` | Covers EIN.md generation/read, curated/AUTO preservation, context injection, and missing stamp behavior. | Use read semantics and preserve curated content; no EIN.md mutation. |
| `tests/git-baseline.test.ts` | Covers dirty/clean working-tree rendering, recent reset detection, real temporary Git repositories, and preflight integration. | Extend exact-state coverage without weakening the reset/stash warning contract. |

## Acceptance criteria for later design/apply/verify

1. A deterministic, read-only projector returns one shared state shape whose fields identify source authority and quality; identical source/Git inputs produce identical output.
2. The projector consumes OpenSpec router results and exposes active change, phase, next step, provenance, and blockers without choosing an unselected change when the active set is ambiguous.
3. EIN.md context is read from the existing file semantics, with absent/incomplete/unavailable states explicit and no write or competing context store.
4. Git state includes an exact deterministic identity for the repository/worktree/index state, while non-repository, empty, detached, and command-error cases remain distinguishable.
5. Verification is current only when tied to the exact observed state; relevant state changes yield stale/invalid freshness with an actionable reason, and resume/runtime switch cannot refresh it.
6. Runtime fields expose only capability/reference/error metadata for future Pi/Claude adapters; no session operations or private conversation content are present.
7. Existing router, project-context, Git baseline, and status-output contracts retain their tested behavior unless a focused compatibility decision is recorded in design; no lifecycle close or OpenSpec synchronization behavior is broadened.
8. Focused tests cover deterministic projection, ambiguity/incompleteness, exact Git identity, freshness invalidation, runtime privacy, and no competing state store using the repository's Bun conventions. This scope claims no test execution.
9. The implementation remains bounded to the shared projector and its focused tests/minimal integration. It does not add launcher, adapter, updater, conversation, cleaner, architect, or parallelism behavior.

## Planned implementation surface

Map/design should confirm exact file placement, but the bounded likely surface is:

- one shared project-state module under `ein-pi/agent/lib/` (new or a narrowly composed existing seam);
- minimal composition changes in `sdd-router.ts`, `project-context.ts`, or `git-baseline.ts` only where required to expose source data without duplicating authority;
- focused Bun tests under `tests/`, likely a new shared-state suite plus small additions to the existing focused suites;
- no changes to `docs/roadmap-features-ein.md`, A's archived record, `EIN.md`, deleted docs, installer behavior, runtime payloads, or launcher surfaces.

The OpenSpec delta is already persisted separately and is the sole behavior declaration. Future phases must preserve its exact bytes if the change is retried or re-evaluated after successful delta validation.

## Non-goals and hard exclusions

- **No Pi/Claude runtime session adapters:** C owns list/create/resume/launch and adapter-specific error/capability translation.
- **No minimal launcher UI or CLI:** D owns project/runtime selection, presentation, orchestration, and compact doctor access.
- **No updater advisor or shared update/configuration workflow:** F is the named later slice and installer ownership remains unchanged.
- **No private conversation migration or export:** continuity transfers normalized project state only; transcript/history remains private to each runtime.
- **No cleaner or architect work:** read-only audits and bounded mutations are later roadmap slices H–K.
- **No parallelism or writers:** safe isolated worktrees and ownership/conflict rules belong to L; this projector is read-only.
- **No installer, installation, update, release, package, or doctor implementation:** the launcher may consume future surfaces but B does not absorb their ownership.
- **No new persistent project-state store, cache, session database, or migration:** authoritative files and Git remain authoritative.
- **No broad SDD router rewrite, OpenSpec synchronization, close-gate relaxation, or legacy artifact migration.**
- **No roadmap/catalog/README cleanup and no normalization of unrelated dirty files.**
- **No test/build/typecheck execution in this scope phase.**

## Risks and handoff questions

- **Exact-state definition:** map/design must select stable Git commands and the inclusion boundary for tracked, staged, untracked, and relevant test files without confusing advisory reflog data with state identity.
- **Legacy evidence compatibility:** existing router verification uses outcome plus conservative mtime checks; design must expose unbound legacy reports honestly without making every historical lifecycle record silently unusable.
- **Ambiguous active work:** existing status has a deterministic fallback when no change is supplied; the shared contract must fail visibly on multiple candidates while preserving compatibility for existing status consumers.
- **Context leakage:** runtime references and EIN/project output must not accidentally include private transcripts, prompts, secrets, or runtime-local stores.
- **Projection size/performance:** exact Git status and source diagnostics should remain bounded and deterministic; do not turn B into a repository-wide indexer.
- **Contract overreach:** field names should be stable enough for C/D while deferring adapter lifecycle and launcher presentation details to those changes.

## Scope phase boundary

This artifact bounds roadmap B and records the project/configuration/testing evidence for the next SDD phases. No source or test implementation was made, and no test/build/typecheck command was executed. The only behavior declaration is the validated `sdd-lifecycle` delta under this change; there is intentionally no `spec_delta: none` declaration.
