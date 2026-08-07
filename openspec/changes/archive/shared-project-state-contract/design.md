# Design — shared-project-state-contract

## A. Proposal

### Intent

Add one read-only deterministic projector that normalizes authoritative project state for future Pi/Claude adapters and the minimal launcher. The projector reads existing sources on demand, reports uncertainty explicitly, and never becomes a persistence layer or competing state store.

### Scope

**In scope**

- A stable typed projection for project identity, OpenSpec lifecycle status, EIN.md context metadata, bounded Git worktree status, verification freshness, and runtime capability/reference metadata.
- Composition of the existing OpenSpec router and EIN.md reader without changing their authority or compatibility behavior.
- A private, fixed-argument, read-only Git inspection boundary that returns repository-relative status classifications and a deterministic state reference.
- Focused Bun contract tests developed under strict TDD.

**Non-goals**

- Pi or Claude session adapters, session listing/creation/resume, transcript access, or conversation migration.
- Launcher UI/CLI, project selection, orchestration, updater, cleaner, architect, parallel worktrees, installer, or doctor behavior.
- A database, cache, JSON snapshot, `.pi` state record, migration, or any other persisted project-state copy.
- Git diffs or file contents in output, history/reflog, stash inspection, remote state, staging, commits, checkout, reset, repository initialization, repair, or caller-provided shell commands.
- Rewriting the SDD router, changing close gates, synchronizing OpenSpec deltas, migrating legacy `.sdd` artifacts, or writing EIN.md.
- Adding project-state presentation to the existing status output; adapter and launcher presentation belongs to later changes.

### Affected areas

- `ein-pi/agent/lib/project-state.ts` — new projector, public contract types, source-quality normalization, private bounded Git reader, and verification-binding comparison.
- `tests/shared-project-state.test.ts` — new focused contract suite.
- Existing `sdd-router.ts`, `project-context.ts`, `git-baseline.ts`, preflight, CLI, and their output types remain compatibility dependencies and are not expected to change.

### Risks

- A status-only fingerprint can miss a second edit to an already-dirty path unless the fingerprint includes content identities without exposing content.
- Large or unusual worktrees can exceed the bounded status contract; fail-open truncation would fabricate readiness.
- Existing verification reports do not carry an exact Git-state binding and could be mistaken for fresh.
- EIN.md read failures and absence currently collapse in `readEinMd`; the projector must preserve uncertainty without changing writer semantics.

### Rollback

Remove the new projector and its focused tests. No data rollback, migration, Git repair, or source restoration is required because the projector creates no persistent state and leaves existing router, context, Git baseline, and status surfaces unchanged.

### Success criteria

- Repeated projection over identical source bytes and Git state is deeply equal.
- Each source reports its authority, quality, and reason when non-current; one source failure does not erase valid data from another source.
- Multiple unselected active changes remain ambiguous, and legacy/unbound verification is `unknown`/`unbound`, never fresh.
- Git output is bounded and repository-relative, detects relevant HEAD/index/worktree/untracked changes, and exposes no diff, history, remote data, mutation, or shell surface.
- No state file, cache, EIN.md write, Git mutation, adapter, launcher, or additional working-tree presentation channel is created.

## B. Spec

### Canonical context

| Path | Domain | SHA-256 | Bytes |
|---|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `sdd-lifecycle` | `27300f80b6f47c1a41091242fb28c44136f2087bdd3872b64f8544cc29979d17` | 21,606 |

This one canonical reference is within the three-file and 32 KiB UTF-8 limit. No `.sdd` specification or other canonical domain is part of this design context.

The behavior declaration for this implementation change is the validated delta at `openspec/changes/shared-project-state-contract/specs/sdd-lifecycle/spec.md`. It is the sole declaration for this change; no `spec_delta: none` block is present or permitted in this scope artifact.

The declaration format is `openspec-delta/v1`, and its exact domain is `sdd-lifecycle`. This design preserves all four added scenarios in that delta: exact-Git-bound verification freshness, explicit incomplete or ambiguous sources, runtime-session privacy, and deterministic normalization without a competing store.

### Requirement 1 — Deterministic read-only projection

The system **MUST** return one schema-versioned typed projection computed on demand from authoritative sources, **MUST** produce equal output for equal source bytes and Git state, and **MUST NOT** persist, cache, timestamp, randomize, or claim ownership of projected state.

**Scenario**

- **Given** identical OpenSpec artifacts, EIN.md bytes, Git state, verification evidence, runtime metadata, working directory, and selected change,
- **When** a caller requests the projection twice,
- **Then** both results are deeply equal and no project-state file, source write, or Git mutation occurs.

### Requirement 2 — OpenSpec authority and ambiguity

The system **MUST** derive lifecycle fields from `listActiveChanges`, `resolveSddStatus`, and `resolveSddNext`; **MUST** preserve canonical/legacy provenance, blockers, phase, next step, artifacts, and verification status; and **MUST NOT** use the router's alphabetical fallback when multiple active changes exist without an explicit selection.

**Scenario**

- **Given** multiple active changes and no selected change,
- **When** the projection resolves OpenSpec state,
- **Then** it reports `ambiguous`, returns the sorted candidate names, emits no guessed current change, phase, or next step, and leaves existing router consumers unchanged.

### Requirement 3 — EIN.md context metadata

The system **MUST** use the existing EIN.md read semantics, report whether `<cwd>/EIN.md` is absent, readable, blank/incomplete, or unavailable, preserve its revision and curated/AUTO boundary metadata when present, and **MUST NOT** write, refresh, scaffold, or infer missing project facts.

**Scenario**

- **Given** an EIN.md file with a revision stamp, unfinished curated placeholders, and generated AUTO material,
- **When** the projection reads project context,
- **Then** it preserves the source reference and revision, marks the context incomplete, identifies the curated/AUTO boundary, and leaves the file bytes unchanged.

### Requirement 4 — Bounded exact Git-state summary

The system **MUST** report repository presence, deterministic branch/ref state when available, dirty state, a bounded sorted set of repository-relative changed-path classifications, truncation/overflow quality, and a deterministic state reference that changes for relevant HEAD, index, tracked-worktree, or included untracked-file changes. It **MUST NOT** expose diff contents, history, remotes, absolute changed paths, Git mutation, repository initialization, or a shell/command parameter to callers.

**Scenario**

- **Given** a repository whose HEAD, staged entry, tracked file content, or included untracked file changes,
- **When** the projector reads Git state before and after that change,
- **Then** the state reference differs, the bounded summary classifies affected repository-relative paths, and no content, diff, history, remote information, or mutation is exposed.

### Requirement 5 — Verification fails closed

The system **MUST** present verification as current only when a recognized passing report carries a valid exact-state binding equal to the complete current Git-state reference and existing router freshness checks do not mark it stale. A legacy or otherwise unbound report **MUST** have effective outcome `unknown` and freshness `unbound`, even if its reported status is `pass`; failed, absent, malformed, mismatched, and unavailable evidence **MUST** remain distinguishable.

**Scenario**

- **Given** a legacy verification report that says `status: pass` but has no recognized exact-state binding,
- **When** the projection evaluates freshness,
- **Then** it preserves `pass` only as the reported legacy outcome, emits effective outcome `unknown` with freshness `unbound` and a reason, and never reports the evidence as current.

### Requirement 6 — Explicit partial degradation

The system **MUST** assign quality and a deterministic reason independently to each source, **MUST** retain unaffected source values after a partial source failure, and **MUST NOT** fabricate project identity, lifecycle readiness, context, clean Git state, runtime availability, or verification freshness.

**Scenario**

- **Given** readable OpenSpec and EIN.md sources but an unreadable Git status,
- **When** the projection is requested,
- **Then** OpenSpec and EIN.md remain available, Git reports unavailable with a reason, verification cannot be current, and the projection does not claim a clean or ready state.

### Requirement 7 — Runtime privacy boundary

The system **MUST** expose a stable runtime section limited to provider name, availability, normalized capabilities, public opaque references, and deterministic error metadata. Without an adapter/provider it **MUST** report `not-provided` or unavailable, and it **MUST NOT** inspect or expose prompts, transcript content, messages, private session stores, or runtime lifecycle operations.

**Scenario**

- **Given** no Pi or Claude adapter input,
- **When** the projection is created,
- **Then** both runtime entries use the stable unavailable/not-provided shape with empty capabilities and references, and no private session data is accessed or emitted.

### Requirement 8 — Stable contract and strict TDD

The system **MUST** expose a discriminated, schema-versioned TypeScript contract suitable for later adapters and launcher consumption without implementing either consumer. Development **MUST** follow RED, GREEN, TRIANGULATE, and REFACTOR with focused contract evidence before independent verification.

**Scenario**

- **Given** the new focused suite and strict TDD enabled,
- **When** the projector contract is developed and verified,
- **Then** evidence shows an initial contract failure, the smallest passing implementation, triangulation across ambiguity/failure/Git/freshness/privacy cases, refactoring with focused tests still passing, and no adapter or launcher implementation.

## C. Decisions

### 1. Public contract

`projectProjectState({ cwd, selectedChange?, runtime? })` is the only new projector entry point. It returns `ProjectStateV1` and accepts data, not commands or persistence callbacks.

The top-level shape contains:

- `schemaVersion: 1`;
- `identity` with the requested working directory, canonical repository root when safely available, deterministic non-Git identity for a valid directory, and quality;
- `openspec`, `ein`, `git`, `verification`, and `runtimes` source sections;
- source-level provenance, quality, and deterministic reason codes.

Quality uses a closed discriminated vocabulary: `current`, `absent`, `incomplete`, `ambiguous`, `legacy`, `stale`, `unbound`, and `unavailable`. Optional human detail supplements stable reason codes but never replaces them. Missing values remain absent rather than being filled with guesses.

**Trade-off:** Versioning and discriminants add a small amount of type surface, but they prevent later consumers from treating unavailable or ambiguous data as ready state.

### 2. OpenSpec ownership

The projector lists active changes before requesting status. Zero candidates produce explicit absent/done state; one candidate may be selected automatically; an explicitly named existing candidate is used; multiple candidates without selection produce ambiguity and skip per-change current/next resolution. The projector delegates selected-change phase, blockers, provenance, artifacts, and next-action semantics to the existing router.

Existing router fallback behavior, status formatting, close readiness, OpenSpec synchronization, and legacy aliases remain owned by their current modules. The projector does not alter those APIs.

### 3. EIN.md ownership

`project-context.ts` remains the owner of EIN.md read/write conventions. The projector combines a non-mutating existence/readability check with `readEinMd`: a missing path is `absent`; a path that exists but cannot be returned by the reader is `unavailable`; blank or placeholder-only curated context is `incomplete`; otherwise it is available. The output preserves the revision and boundary metadata and may carry the exact read context, but it does not synthesize facts or invoke any writer.

### 4. Git boundary and fingerprint

The Git reader is private to `project-state.ts` so the change adds one production module and does not expand `GitBaseline`. It invokes the Git executable directly with fixed argument arrays and bounded output; callers cannot provide commands, flags, environment-dependent formatters, or shell text.

The reader uses locale-independent porcelain data and sorts parsed entries bytewise by repository-relative path. The exposed summary contains at most 256 changed-path records. Each record carries only path, optional rename source path, and normalized index/worktree classification. Ignored paths are excluded. If parsing, path decoding, command output, or the entry limit prevents a complete identity, Git quality becomes `incomplete` or `unavailable`, `stateRef` is omitted, and verification fails closed; truncation never yields a current reference.

For a complete state, `stateRef` is `git-v1:sha256:<digest>` over a version-tagged canonical sequence containing:

- full HEAD object ID, or an explicit unborn/empty marker;
- deterministic symbolic branch name or detached marker;
- every included status entry in sorted order;
- index object IDs/classifications for staged tracked entries;
- content hashes, never content bytes, for changed tracked-worktree and untracked entries; and
- explicit deleted, renamed, copied, conflict, and file-kind markers.

Hashing reads content only to derive the internal identity. Neither content nor diffs appear in the projection. All non-ignored untracked entries are relevant. Therefore any committed, staged, tracked-worktree, or untracked change invalidates prior evidence. This conservative whole-worktree rule may stale evidence for an unrelated file, but it avoids incorrectly presenting verification as current and is simpler than inventing an unproven relevant-file manifest.

The existing stash/reflog baseline warnings remain owned by preflight/CLI. They are neither removed nor copied into this projector because history and stash data are outside the closed Git boundary.

### 5. Verification binding and compatibility

A verification report may carry one machine-readable binding line: `project_state_git_ref: git-v1:sha256:<64 lowercase hex characters>`. The projector accepts exactly one valid binding. Missing, duplicate, malformed, or unsupported bindings are unbound/invalid rather than current.

The verification section separates:

- `reportedOutcome`: the router-compatible `pass | fail | unknown | absent` value;
- `effectiveOutcome`: `pass | fail | unknown | absent` after binding validation;
- `freshness`: `current | stale | unbound | unavailable | invalid`;
- current and observed state references when safely available; and
- stable reason code plus detail.

A report is current only if the reported outcome is `pass`, the binding exactly matches a complete current `stateRef`, and `verifyStale` is false. A mismatch is stale and carries both references. Missing Git identity is unavailable. A legacy pass without binding becomes effective `unknown`/`unbound`. Session resume and runtime metadata do not participate in freshness.

The projector reads but never writes `verify-report.md`. A future verifier may emit the binding; this slice defines and consumes the contract without broadening lifecycle writers.

### 6. Runtime boundary

The v1 output reserves deterministic `pi` and `claude` entries. Optional future normalized input may populate availability, capability names, opaque public references, and stable errors. The projector defaults both entries to `not-provided` and performs no provider probing. Runtime-specific capability differences remain visible; a shared shape does not imply identical operations.

### 7. Failure model

Each source resolves independently. Operational messages are normalized to stable reason codes; nondeterministic stack traces, timestamps, process IDs, and raw command stderr are not part of output. A source failure can lower aggregate readiness but cannot erase or fabricate another source's value.

### 8. Rejected alternatives

- **Persisted snapshot/cache:** rejected because it creates a second owner and introduces synchronization and staleness problems.
- **Extending `GitBaseline` into the full contract:** rejected because it risks preflight/CLI compatibility and mixes advisory stash/reset signals with exact state identity.
- **Using porcelain path/status alone as the fingerprint:** rejected because repeated content edits on an already-dirty path could retain the same classification.
- **Using diffs, history, remotes, or shell commands:** rejected by the privacy, safety, determinism, and closed Git boundary.
- **Trusting `status: pass` or mtime freshness without binding:** rejected because legacy evidence cannot prove which exact state it verified.
- **Selecting the first active change:** rejected because deterministic ordering is not user intent and would hide ambiguity.
- **Adding adapter/launcher presentation now:** rejected because C/D own those boundaries and no current consumer is needed to prove the projection contract.

## D. Success Criteria

The change is acceptable when all of the following observable checks pass:

- `bun test tests/shared-project-state.test.ts` passes focused deterministic, source-quality, ambiguity, EIN.md, Git transition, verification binding, runtime privacy, and no-persistence scenarios.
- `bun test tests/sdd-router.test.ts tests/sdd-status-output.test.ts tests/project-context.test.ts tests/git-baseline.test.ts` passes unchanged compatibility contracts.
- Strict-TDD evidence records RED, GREEN, TRIANGULATE, and REFACTOR for the focused suite; independent verify reruns the final focused and relevant compatibility commands rather than reusing apply results.
- Repeated calls against an unchanged fixture produce deeply equal `ProjectStateV1` values.
- HEAD, index, tracked-worktree content, untracked content, rename/delete, detached HEAD, unborn repository, non-repository, overflow, and Git-command failure cases remain distinguishable and fail closed where identity is incomplete.
- A bound passing report matching the current complete state is current; a mismatch is stale; a legacy pass is effective `unknown`/`unbound`; failed, malformed, absent, and unavailable evidence remain distinct.
- A filesystem comparison before and after projection shows no new state/cache file and no changes to EIN.md, OpenSpec artifacts, verification artifacts, Git index, or worktree.
- Output inspection confirms changed paths are repository-relative and bounded, and no diff, file content, history, remote data, prompt, transcript, private session path, or executable command surface appears.
- No adapter, launcher, status presentation, close behavior, OpenSpec synchronization, installer, updater, or session operation is added.
