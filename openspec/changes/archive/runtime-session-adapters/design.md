# Design — runtime-session-adapters

## A. Proposal

### Intent

Add the smallest project-scoped Pi/Claude session-adapter contract that a future launcher can call. The contract normalizes capability and outcome handling while preserving runtime asymmetry, private histories, the archived `ProjectStateV1` authority, and the existing isolated launch environments.

### Scope

**In scope**

- One typed `list` / `create` / `resume` / `launch` adapter surface for `pi` and `claude`.
- Conservative project matching and exact binding to the supplied `ProjectStateV1` identity.
- Bounded Pi first-line metadata listing with opaque provider references.
- Request-only create intents; fail-closed resume behavior based on current evidence.
- Fixed executable/argv launch plans and an adapter-local injectable non-shell executor.
- A pure translation from adapter observations to existing `ProjectRuntimeMetadata` input.
- Deterministic unsupported, unavailable, error, cancellation, and process-exit results.

**Non-goals**

- Launcher TUI/CLI, project selection, presentation, or D orchestration.
- Claude session-store discovery, Pi or Claude resume-flag invention, transcript access, or cross-runtime migration.
- Shared session/project-state persistence, caches, indexes, callbacks, or parallel writers.
- Installer, Fish-function, updater, migration, secret-file, generated Claude, OpenSpec, EIN.md, Git, or verification ownership changes.
- Arbitrary caller argv, command strings, shell execution, runtime installation, configuration repair, or broad `sessions.ts` refactoring.

### Affected areas

| Area | Intended change |
|---|---|
| `ein-pi/agent/lib/runtime-session-adapters.ts` | New common types, provider descriptors, validation, opaque references, intents, launch planning/execution, outcome normalization, and transient B metadata translation. |
| `ein-pi/agent/lib/sessions.ts` | At most one additive project-filter-before-limit metadata seam; existing exports and all-project behavior remain unchanged. |
| `tests/runtime-session-adapters.test.ts` | New focused contract and privacy/negative-path tests. |
| `tests/sessions.test.ts` | Only narrowly necessary additive compatibility coverage. |

`project-state.ts`, installer source, Fish launchers, `cc-ein/CLAUDE.adapter.md`, generated `cc-ein/CLAUDE.md`, and existing callers are read-only dependencies for this change.

### Risks

- Weak path matching could select a neighboring project; symlink or basename inference is therefore rejected.
- Pi stores with many candidates could otherwise produce partial, misleading lists; bounds must fail closed rather than silently truncate the searchable set.
- A guessed resume flag would falsely claim continuity. Current evidence does not prove resume for either runtime.
- Direct launch could drift from Fish isolation or leak inherited secrets through diagnostics; plans and errors must remain closed and sanitized.

### Compatibility

- `humanizeAge`, `listRecentSessions`, `RecentSession.path`, global ordering, `excludePath`, and deduplication remain compatible for current Pi banner and `/ein:resume` consumers.
- `ProjectStateV1` and its reason-code vocabulary are not extended. Adapter-specific outcomes remain in C and are translated conservatively into existing B metadata.
- Existing Pi/Claude Fish functions and installer ownership remain unchanged. The adapter reproduces their process environment semantics without invoking Fish or installer code.
- Unsupported operations are an intentional capability difference, not a regression or a promise of future flags.

### Rollback

Remove the adapter module, its focused tests, and any additive project-scoped sessions helper. No data migration or restoration is needed because the design creates no persisted record and changes no installer/runtime-owned state.

### Success criteria

The common contract exposes the evidence-based capability matrix, Pi listing is exact and private, create is request-only, resume fails closed, launch uses a fixed non-shell plan, and all results remain bound to the supplied state without mutating it. Focused strict-TDD evidence and the existing sessions, B-state, and installer compatibility suites must pass in later phases.

## B. Spec

### Canonical context

| Path | Domain | SHA-256 | Bytes |
|---|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `sdd-lifecycle` | `c5f128f9bde1749bf802431a87ab2785a7cd71c73a68d01aa9222c9f49a9e5fa` | 24,857 |

This exact scope-selected reference is the only canonical context and remains within the three-file/32 KiB UTF-8 limit. The sole change declaration is `openspec/changes/runtime-session-adapters/specs/sdd-lifecycle/spec.md` (`openspec-delta/v1`, domain `sdd-lifecycle`). No `.sdd` or archived specification is canonical context.

### Requirement 1 — One normalized, asymmetric surface

The system **MUST** expose `list`, `create`, `resume`, and `launch` for both providers through one discriminated result shape; every result **MUST** identify provider, operation, outcome, and the supplied project binding. A method name **MUST NOT** imply capability support.

**Scenario**

- **Given** valid state and either provider,
- **When** a caller invokes any common operation,
- **Then** it receives `success`, `unsupported`, `unavailable`, `error`, or `cancelled` with provider, operation, and project binding, while provider-specific capability differences remain explicit.

### Requirement 2 — Exact project and state binding

The system **MUST** validate schema v1, an absolute selected `cwd`, exact normalized equality between selected `cwd` and `state.identity.cwd`, and internally consistent repository identity. It **MUST** bind create/resume/launch intents to the exact available Git `stateRef`, **MUST** require a complete `stateRef` when `git.repository` is true, and **MUST** accept an exact-cwd binding without a Git reference only when `git.repository` is false. Unknown repository state **MUST** fail closed. Listing **MAY** proceed without a Git reference when its project scope is otherwise exact because it is metadata-only.

For session matching, a complete repository state uses `identity.repositoryRoot === git.root` as its scope root and accepts metadata `cwd` equal to or boundary-contained below that root. A non-repository uses exact normalized `cwd` equality only. The system **MUST NOT** match by basename, encoded session-directory name, textual prefix, guessed realpath, or neighboring repository.

**Scenario**

- **Given** a selected subdirectory inside a complete repository, a matching `ProjectStateV1`, and sessions inside that repository plus a same-named neighboring repository,
- **When** Pi listing resolves project scope,
- **Then** repository-contained sessions match, neighboring sessions do not, and any mismatched selected/state identity fails before runtime work.

### Requirement 3 — Minimal metadata and opaque references

The system **MUST** expose session metadata only as provider, opaque reference, and modification recency; the project binding belongs at result level. Pi references **MUST** have the fixed public form `pi:v1:sha256:<64 lowercase hex>` derived from the runtime session id, and resolution **MUST** re-read bounded metadata in the selected project rather than use a persisted index. Raw ids, metadata `cwd`, absolute JSONL paths, private store paths, transcript lines, prompts, messages, command text, secrets, and process ids **MUST NOT** appear in normalized output or diagnostics.

**Scenario**

- **Given** a Pi JSONL whose first line has id/cwd and whose later lines contain private conversation content,
- **When** the adapter lists it,
- **Then** the output contains only an opaque Pi reference and modification time plus the already-supplied project binding, and serialization contains none of the raw id, session-derived cwd field, JSONL path, or later content.

### Requirement 4 — Bounded Pi listing

The Pi adapter **MUST** read at most the existing 1,024-byte first-line prefix per inspected file, filter exact project scope before applying the requested result limit, sort by descending `mtimeMs` with a deterministic internal tie-breaker, and enforce a result limit of 1–20 (default 10). It **MUST** inspect at most the 4,096 newest candidates. It **MUST** omit malformed, empty, missing-id, missing-cwd, unreadable, and out-of-project entries. If the requested number of selected-project matches is found within that window, older entries cannot affect the result; otherwise, when more candidates remain, it **MUST** return `unavailable/scan-limit-exceeded` instead of a partial success. It **MUST** reject duplicate matching opaque references as ambiguous.

**Scenario**

- **Given** newer sessions from other projects ahead of valid selected-project sessions, plus malformed and overflowing candidates,
- **When** Pi listing runs with a bounded limit,
- **Then** other projects do not consume the result limit, valid selected-project entries remain newest-first, invalid entries do not become sessions, and search overflow is explicit rather than partial.

### Requirement 5 — Request-only create and fail-closed resume

`create` **MUST** return only a state-bound `mode: "create"` launch intent and **MUST NOT** claim a session exists or write any file. `resume` **MUST** reject malformed or cross-provider references before capability use and, when a provider eventually supports resume, **MUST** re-resolve exactly one reference in the selected project and require the intent binding to match the supplied current state. In this change Pi and Claude resume **MUST** return `unsupported/operation-not-supported` after common envelope/reference validation because no safe invocation contract is proven.

**Scenario**

- **Given** valid Pi or Claude state and a create request or same-provider resume reference,
- **When** create or resume is requested,
- **Then** create returns an unpersisted bound intent, while resume returns explicit unsupported with no guessed flag, metadata mutation, history copy, or verification refresh; a cross-provider reference is rejected as `provider-mismatch`.

### Requirement 6 — Evidence-based capability matrix

The system **MUST** publish exactly this initial matrix and **MUST** distinguish unsupported design evidence from environment unavailability:

| Provider | list | create | resume | launch |
|---|---|---|---|---|
| Pi | supported | supported, request-only | unsupported | supported when isolated inputs and executable are available |
| Claude | unsupported | supported, request-only | unsupported | supported when isolated inputs and executable are available |

`unsupported` means this slice has no verified safe equivalent. `unavailable` means a supported cell cannot run because required state, metadata source, `HOME`, executable, environment, or process service is unavailable.

**Scenario**

- **Given** Claude has an isolated launcher but no verified list/resume API, and Pi has metadata listing but no verified resume invocation,
- **When** capabilities are queried or those operations are called,
- **Then** only the matrix cells above are advertised and absent operations return unsupported without emulation or fabricated data.

### Requirement 7 — Fixed non-shell launch boundary

The system **MUST** create launch plans containing a resolved allowlisted executable, fixed adapter-owned argv, selected project `cwd`, and environment overrides; it **MUST** execute them through an injectable file/argv executor with shell disabled. Create plans use empty runtime argv. Pi **MUST** set `PI_CODING_AGENT_DIR` and `EIN_PI_AGENT_HOME` to `$HOME/.pi-ein/agent`. Claude **MUST** set `CLAUDE_CONFIG_DIR` to `$HOME/.claude-ein` and prepend `$HOME/.claude-ein/bin` to inherited `PATH`. The adapter **MUST NOT** accept caller argv, invoke Fish, read the Context7 fallback secret file, run sync/install/update, or write runtime-owned state.

**Scenario**

- **Given** a valid state-bound create intent whose project path contains shell metacharacters,
- **When** launch is prepared and executed,
- **Then** the path appears only as the executor `cwd`, executable and argv remain fixed, shell is disabled, isolation variables are exact, and no installer, sync, secret-file, or shell operation occurs.

### Requirement 8 — Runtime metadata feeds B without ownership inversion

The adapter **MUST** provide a pure transient translation to the existing `ProjectRuntimeMetadata` shape, containing only availability, supported capability tokens (`session.list`, `session.create`, `runtime.launch` as applicable), bounded opaque references, and sanitized existing B reason codes. It **MUST NOT** mutate the supplied `ProjectStateV1`, call `projectProjectState`, persist metadata, add session operations to B, or treat B runtime references as an adapter index. A future caller **MAY** pass translated metadata into a subsequent independent B projection.

Unsupported adapter diagnostics map to B `not-provided`; unavailable executable/process conditions map to `command-error`; source-read failures map to `read-error`; invalid identity maps to `invalid-source`; and binding mismatch maps to `state-mismatch`. Adapter-specific codes remain in the adapter result and are not added to B.

**Scenario**

- **Given** a Pi list result and Claude unsupported capabilities,
- **When** a future launcher requests transient B metadata translation,
- **Then** Pi public references and supported tokens plus sanitized Claude limitation metadata are returned, the original state is unchanged, and no projector call or persistence occurs inside the adapter.

### Requirement 9 — Deterministic failures, cancellation, and exit

The adapter **MUST** use a closed safe code vocabulary: `invalid-request`, `unsupported-state-version`, `project-identity-unavailable`, `project-mismatch`, `state-ref-unavailable`, `provider-mismatch`, `operation-not-supported`, `runtime-unavailable`, `reference-invalid`, `reference-not-found`, `reference-ambiguous`, `session-source-unavailable`, `scan-limit-exceeded`, `executable-unavailable`, `spawn-failed`, `process-exit`, and `process-signalled`. It **MUST** validate state, provider/reference envelope, capability, environment/source availability, then operation data in that order. Raw exceptions, stderr/stdout, stack traces, paths, and secret values **MUST NOT** enter results.

An already-aborted request or executor termination attributable to its `AbortSignal` **MUST** return `cancelled`; cancellation **MUST NOT** be reported as success or process failure. Exit code 0 **MUST** be success, a non-zero exit **MUST** be `error/process-exit` with only the numeric code, and an unrelated signal termination **MUST** be `error/process-signalled` with only a normalized signal token. No pid is exposed.

**Scenario**

- **Given** injectable executors that abort, exit 0, exit non-zero, throw on spawn, or terminate by signal,
- **When** launch executes,
- **Then** each case maps deterministically to cancelled, success, process-exit, unavailable/spawn-failed, or process-signalled without raw process output or partial persistence.

### Requirement 10 — No migration or freshness claim

The system **MUST NOT** copy, export, import, merge, summarize, or persist conversation history across providers. A runtime switch, create, resume attempt, or launch **MUST NOT** alter `verification`, synthesize fresh evidence, or claim cross-runtime continuity; continuity is limited to the supplied project binding.

**Scenario**

- **Given** a Pi reference and selected Claude runtime with the same project state,
- **When** the caller attempts handoff or resume,
- **Then** the adapter rejects cross-provider resume, may create a new Claude intent only as a separate request, transfers no private history, and leaves verification unchanged.

## C. Decisions

### 1. Public contract is data-first and discriminated

The module exposes one provider lookup and four operations over request data. The minimal conceptual shape is:

```ts
type RuntimeProvider = "pi" | "claude";
type RuntimeOperation = "list" | "create" | "resume" | "launch";
type AdapterOutcome = "success" | "unsupported" | "unavailable" | "error" | "cancelled";

type ProjectBinding = {
  schemaVersion: 1;
  cwd: string;
  repositoryRoot?: string;
  gitStateRef?: string;
};

type SessionMetadata = {
  reference: string;
  modifiedAtMs: number;
};

type LaunchIntent = {
  provider: RuntimeProvider;
  mode: "create" | "resume";
  project: ProjectBinding;
  reference?: string;
};

type AdapterResult<T> = {
  provider: RuntimeProvider;
  operation: RuntimeOperation;
  outcome: AdapterOutcome;
  project: ProjectBinding;
  data?: T;
  error?: { code: AdapterErrorCode; exitCode?: number; signal?: string };
};
```

Concrete unions must make `data` legal only for success and `error` legal only for non-success outcomes. A single module/factory is preferred over a class hierarchy: only two provider strategies exist, and a function map is easier to test and change.

### 2. State readiness is operation-specific

Metadata listing needs an exact project scope but does not need exact Git content identity. Create/resume/launch produce executable intent and therefore require a complete Git `stateRef` for repositories. A confirmed non-repository can bind by exact cwd; an unknown or incomplete repository cannot. The binding records identity, not verification freshness. `verification` is copied nowhere and never recalculated.

A launch intent must exactly equal the binding re-derived from the state supplied to `launch`; changing Git state between create and launch therefore produces `state-mismatch` and requires a new create intent. This prevents stale handoff without making C a state owner.

### 3. Pi references are hashes, not encoded paths or ids

Hashing the raw Pi session id yields a fixed provider-scoped public token accepted by B's existing token sanitizer and resolvable by transient re-scan. It avoids leaking raw runtime ids or project/session paths and needs no random registry, cache, secret, or persistence. Duplicate matches fail closed rather than selecting by recency.

### 4. Project filtering precedes result limiting

The existing `listRecentSessions` remains untouched for compatibility. An additive helper may return internal records plus completeness information to C, retaining private `id`, `cwd`, and `path` only inside the module boundary. Adapter output strips those fields. The searchable candidate bound is fixed at 4,096 newest files and covered by boundary tests. Reaching it before enough selected-project matches are found returns `scan-limit-exceeded`, never a deceptively complete list.

### 5. Resume stays unsupported in C

The common method exists so D can be runtime-neutral, but neither inspected runtime has a proven safe resume invocation. Pi metadata ids do not prove a CLI/API flag, and Claude adaptation/launch does not prove a private store or resume contract. Supporting either would invent behavior. A later bounded change may move a cell to supported only with verified runtime evidence and new tests; no generic fallback exists.

### 6. Launch reproduces isolation directly, not through Fish or installer

Fish functions are evidence for environment semantics, not an execution API. C owns a tiny process-plan/executor boundary and executable resolver, while installer remains deployment owner. The executor receives executable and argv separately, uses inherited environment plus fixed overrides, sets `cwd`, and never enables a shell. Claude inherits an already-present Context7 key but C neither finds nor logs one.

### 7. Cancellation is not an error; non-zero runtime exit is

Cancellation is caller intent and gets its own outcome. Spawn inability is `unavailable` when the executable/process service cannot be used; a spawned runtime that exits non-zero is an operation `error`. Diagnostics intentionally discard process text because an interactive runtime may emit prompts, messages, paths, or secrets.

### 8. B consumes summaries, not operations

`ProjectStateV1.runtimes` stays metadata-only. C's pure translator can construct existing `ProjectRuntimeMetadata` for a caller, but the caller decides whether to request a new B projection. This one-way sequence—B snapshot → C operation → optional transient metadata → caller-requested B snapshot—avoids persistence and circular calls.

### 9. Boundaries and rejected alternatives

| Alternative | Rejected because |
|---|---|
| Basename, encoded-directory, or broad textual-prefix project matching | Can select neighboring projects and does not prove repository identity. |
| Exact selected cwd only for repositories | Hides valid sessions started in a subdirectory of the same verified repository. |
| Reusing `RecentSession` as public output | Leaks absolute JSONL path, raw id, cwd, and presentation-specific age. |
| Base64 raw id or a persisted opaque-token registry | Base64 is reversible; a registry creates a second store and lifetime owner. |
| Pretending resume is supported through a guessed flag | No bounded repository evidence proves equivalent safe semantics. |
| Shell/Fish command strings | Permit interpolation and couple runtime execution to launcher installation. |
| Importing installer `exec.ts` | Reverses ownership from portable adapter code into deployment infrastructure. |
| Extending `ProjectStateV1` with operation/error types | Reopens archived B, creates circular responsibility, and makes state metadata an execution API. |
| Transcript-based continuity or cross-runtime migration | Violates runtime privacy and cannot be safely normalized in C. |

### 10. Skill applicability

`ein-discipline`, `architecture`, and `cognitive-doc-design` were applied to phase boundaries, the smallest function/module seam, explicit trade-offs, and review-oriented structure. `nuxt-modules` was skipped because no Nuxt module/runtime surface is involved. `omarchy` was skipped because no desktop or user configuration is changed.

## D. Success Criteria

The change is acceptable when later apply records strict **RED → GREEN → TRIANGULATE → REFACTOR** evidence and independent verify confirms all of the following:

- `bun test tests/runtime-session-adapters.test.ts tests/sessions.test.ts` passes the common discriminated contract, exact project matching, filter-before-limit behavior, candidate overflow, malformed/unreadable metadata, opaque-reference privacy, capability matrix, request-only create, unsupported resume, stale binding, fixed plans, cancellation, and exit semantics.
- `bun test tests/shared-project-state.test.ts` passes unchanged, including runtime token/reference/privacy normalization and deterministic state identity.
- `bun test tests/installer-runtime-menu.test.ts` passes unchanged, proving installer and Fish launcher ownership remain separate.
- `cd installer && bun run typecheck` is run during verification as the configured typecheck; any baseline-only failure is reported distinctly and no new adapter/test diagnostic is accepted.
- Focused filesystem assertions show create/list/resume/launch planning and failure paths create no shared session/index/cache/state file and do not modify Pi/Claude private stores, Fish functions, installer files, OpenSpec, EIN.md, Git, or verification artifacts.
- Serialized public results and B metadata contain no raw session id, session-derived cwd field, JSONL/private runtime path, transcript body, prompt, message, command string, stdout/stderr, stack trace, pid, or secret; the selected project cwd appears only in the supplied project binding.
- Pi advertises list/create/launch only; Claude advertises create/launch only; both resume operations and Claude list return deterministic unsupported outcomes.
- Repository-contained Pi sessions are selected across subdirectories, same-named neighbors are excluded, non-repositories require exact cwd, and ambiguous/incomplete state or opaque-reference resolution fails closed.
- Launch tests observe resolved `pi`/`claude` executables, empty create argv, exact selected cwd, exact isolation overrides, shell disabled, and no caller-controlled argv or interpolation.
- Abort, zero exit, non-zero exit, spawn failure, missing executable, and unrelated signal termination produce the specified deterministic outcomes without partial writes or private diagnostics.

No test, build, typecheck, or source implementation is performed in this design phase.
