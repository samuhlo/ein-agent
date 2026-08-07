# Tasks — shared-project-state-contract

status: ready
blocked_by: none

## // 001. Public ProjectStateV1 contract

- [x] 1.1 Add the schema-versioned public types and `projectProjectState({ cwd, selectedChange?, runtime? })` declaration in `ein-pi/agent/lib/project-state.ts`, covering identity, source quality/reason codes, OpenSpec, EIN, Git, verification, and `pi`/`claude` runtime entries without commands, persistence callbacks, or private-session fields.
  - skills: `ein-discipline`, `architecture`
  - why: Consumers need a stable discriminated boundary before any source-specific implementation is added.
  - learn: A versioned contract can preserve uncertainty explicitly instead of making unavailable data look ready.
  - architecture: `project-state.ts` is the sole public projection boundary; authoritative routers/readers remain owners and the module owns no store.
  - avoid: Exporting internal router shapes directly or adding a cache/snapshot type that becomes a second state owner.
  - verify: `bun test tests/shared-project-state.test.ts --test-name-pattern "contract|schema|runtime shape"` (RED before implementation, then GREEN after the minimal type surface)

- [x] 1.2 Create the initial focused contract assertions in `tests/shared-project-state.test.ts` for schema version, required source sections, closed quality vocabulary, stable runtime defaults, and absence of transcript/command/persistence fields.
  - skills: `bun`, `ein-discipline`
  - why: The public shape must be proven before source composition can hide contract mistakes.
  - learn: RED evidence should fail for the missing contract, while the later GREEN run proves only the smallest required shape.
  - architecture: Tests consume only the public projector/types, not private helper details.
  - avoid: Building a broad fixture or coupling contract tests to current formatted status output.
  - verify: `bun test tests/shared-project-state.test.ts --test-name-pattern "contract|schema|runtime shape"`; record RED → GREEN evidence.

## // 002. Bounded exact Git summary and identity

- [x] 2.1 Implement the private fixed-argument Git reader/fingerprint inside `ein-pi/agent/lib/project-state.ts`, including repository root, full HEAD/unborn marker, branch or detached marker, sorted repository-relative status records, content/index identities, `git-v1:sha256:<digest>`, 256-entry overflow handling, and explicit non-repository/command-error states.
  - skills: `bun`, `architecture`, `ein-discipline`
  - why: Verification cannot bind safely until committed, staged, tracked-worktree, and untracked state has one deterministic identity.
  - learn: Hashing content is safer than exposing it, and incomplete parsing must fail closed rather than pretend the tree is clean.
  - architecture: Exact inspection stays private to the new projector; `GitBaseline` and its CLI/preflight renderers remain advisory compatibility surfaces.
  - avoid: Porcelain status alone, shell/caller-provided flags, absolute paths, history/stash data, mutation, or truncation that still emits a usable `stateRef`.
  - verify: `bun test tests/shared-project-state.test.ts --test-name-pattern "Git|HEAD|index|tracked|untracked|detached|overflow"` (RED → GREEN → TRIANGULATE → REFACTOR evidence required)

- [x] 2.2 Add Git transition fixtures/assertions for HEAD, staged/index, tracked content, untracked content, rename/delete, detached/unborn/non-repository, malformed output, and overflow; assert bounded relative summaries and no diff/content leakage.
  - skills: `bun`, `ein-discipline`
  - why: These transitions define the exact-state contract and prevent false-current verification.
  - learn: Triangulation changes one state dimension at a time so fingerprint regressions are attributable.
  - architecture: Tests use temporary repositories and public output; they do not change existing baseline contracts.
  - avoid: Depending on timestamps, locale, reflog, stash counts, or incidental directory ordering.
  - verify: `bun test tests/shared-project-state.test.ts --test-name-pattern "Git|HEAD|index|tracked|untracked|detached|overflow"`; preserve independent TRIANGULATE and REFACTOR runs.

## // 003. OpenSpec and EIN.md projections

- [x] 3.1 Compose `listActiveChanges`, `resolveSddStatus`, and `resolveSddNext` in `projectProjectState`/private helpers, exposing absent/done, uniquely selected, explicit selection, multi-change ambiguity/candidates, canonical versus legacy provenance, phase/next/artifacts/blockers, and router verification outcome without changing router fallback behavior.
  - skills: `bun`, `architecture`, `ein-discipline`
  - why: The shared view must reuse lifecycle authority while preventing an unselected alphabetical fallback from becoming shared intent.
  - learn: A compatibility adapter may add stricter ambiguity handling without rewriting the authority it adapts.
  - architecture: `sdd-router.ts` owns lifecycle semantics; `project-state.ts` only normalizes and gates selection.
  - avoid: Re-parsing phases, migrating `.sdd`, synchronizing specs, changing close gates, or silently selecting `active[0]` for multiple candidates.
  - verify: `bun test tests/shared-project-state.test.ts tests/sdd-router.test.ts --test-name-pattern "OpenSpec|active|legacy|ambiguous|provenance"` (RED → GREEN → TRIANGULATE → REFACTOR)

- [x] 3.2 Compose `einMdPath`/`readEinMd` read semantics into explicit absent, incomplete, unavailable, and current EIN source metadata, preserving revision and curated/AUTO boundary information without writing `EIN.md`.
  - skills: `bun`, `architecture`, `ein-discipline`
  - why: Consumers need stable project context while the existing reader/writer remains authoritative.
  - learn: Missing, unreadable, and placeholder context are different quality states and must not be filled with inferred facts.
  - architecture: `project-context.ts` remains the EIN owner; the projector is read-only and may only normalize its result.
  - avoid: Calling `writeEinMd`/`syncEinMdIndex`, refreshing stamps, reading prompt/transcript context, or replacing curated/AUTO semantics.
  - verify: `bun test tests/shared-project-state.test.ts tests/project-context.test.ts --test-name-pattern "EIN|context|revision|read-only"`; record RED → GREEN → TRIANGULATE → REFACTOR.

## // 004. Verification freshness and degradation

- [x] 4.1 Implement verification normalization using router outcome/staleness plus exactly one valid `project_state_git_ref` binding, producing current only for matching complete Git identity and pass; classify mismatch, legacy/unbound, absent, failed, malformed, stale, and unavailable with observed/current references and deterministic reasons.
  - skills: `bun`, `architecture`, `ein-discipline`
  - why: Existing pass/mtime evidence cannot prove the exact state consumed by a future adapter or launcher.
  - learn: Effective outcome and reported outcome must be separate when compatibility evidence lacks a trustworthy binding.
  - architecture: The projector consumes verification artifacts and Git identity; it never writes reports or refreshes evidence on resume/runtime changes.
  - avoid: Promoting `status: pass`, timestamps, runtime metadata, or session state to current without an exact matching reference.
  - verify: `bun test tests/shared-project-state.test.ts tests/sdd-router.test.ts --test-name-pattern "verification|fresh|stale|unbound|binding"`; RED → GREEN → TRIANGULATE → REFACTOR evidence required.

- [x] 4.2 Add partial-failure and determinism assertions: unaffected sources survive Git/EIN/OpenSpec failures, incomplete identity blocks current verification, repeated equal inputs yield deep equality, and projection creates no state/cache file or source mutation.
  - skills: `bun`, `ein-discipline`
  - why: Independent degradation and no-persistence are core safety properties of the projection.
  - learn: Determinism means identical inputs produce identical output, not merely the same broad status label.
  - architecture: Source sections degrade independently; no aggregate fallback fabricates readiness or clean Git state.
  - avoid: Returning raw stderr, timestamps, random IDs, environment-dependent ordering, or writing a snapshot to simplify later reads.
  - verify: `bun test tests/shared-project-state.test.ts --test-name-pattern "degradation|determin|no.*(file|write)|mutation"`; record RED → GREEN → TRIANGULATE → REFACTOR.

## // 005. Runtime defaults and public integration contract

- [x] 5.1 Complete `pi` and `claude` runtime normalization defaults and optional metadata handling so no provider yields deterministic `not-provided`/unavailable entries with empty capabilities/references, while public opaque references and stable errors never expose private paths or transcript data.
  - skills: `bun`, `architecture`, `ein-discipline`
  - why: Future adapters need a common reference shape without this slice probing or owning runtime sessions.
  - learn: A shared field shape does not imply identical runtime lifecycle semantics or authorize session inspection.
  - architecture: Runtime adapters remain C-owned; B accepts normalized data only and never lists, creates, resumes, launches, exports, or migrates sessions.
  - avoid: Reading Pi/Claude stores, embedding prompts/messages, probing providers, or adding launcher/status presentation.
  - verify: `bun test tests/shared-project-state.test.ts --test-name-pattern "runtime|privacy|not-provided|capabilit"`; RED → GREEN → TRIANGULATE → REFACTOR.

- [x] 5.2 Run the focused and compatibility contract suites as independent final evidence, confirming existing router, status output, project-context, and Git-baseline behavior is unchanged and the projector remains read-only.
  - skills: `bun`, `ein-discipline`
  - why: The new public seam must integrate without broadening lifecycle, CLI, preflight, or writer ownership.
  - learn: Independent verification reruns behavior from a fresh command rather than reusing apply evidence.
  - architecture: No changes are required in `sdd-router.ts`, `project-context.ts`, `git-baseline.ts`, preflight, or CLI unless a separately justified compatibility export is discovered.
  - avoid: Adding a second working-tree output channel, launcher/adapter behavior, OpenSpec synchronization, or unrelated cleanup.
  - verify: `bun test tests/shared-project-state.test.ts` and `bun test tests/sdd-router.test.ts tests/sdd-status-output.test.ts tests/project-context.test.ts tests/git-baseline.test.ts`; retain RED → GREEN → TRIANGULATE → REFACTOR records and inspect the filesystem for no writes.
