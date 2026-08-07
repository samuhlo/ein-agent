# Scope — runtime-session-adapters

## SCOPE PACKET

```yaml
scope: Implement the bounded first vertical slice of normalized Pi/Claude runtime-session adapters over the archived B ProjectStateV1 boundary: project-scoped recent-session metadata, new-session requests, same-runtime resume requests, and safe isolated runtime launch, with explicit unsupported/error results and no private-history migration.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 300000
```

## Execution context

- **Execution mode:** auto, as requested. The parent owns phase progression and delivery decisions.
- **Web:** disabled (`webfetch: false`). This scope uses repository-local evidence only.
- **Strict TDD:** enabled (`openspec/config.yaml` has `strict_tdd: true`). This phase records the requirement for later apply/verify; it does not run tests, builds, or typechecks.
- **Phase boundary:** this phase writes the scope artifact and the validated behavior delta only. It does not edit product source, focused tests, `apply-progress.md`, `verify-report.md`, the roadmap, the archived B record, `EIN.md`, installer ownership, or generated Claude output.
- **Working-tree safety:** preserve every pre-existing dirty and untracked path. In particular, preserve the modified `EIN.md`, modified/deleted documentation, prior SDD outputs, the untracked roadmap documents, `ein-pi/agent/lib/project-state.ts`, and `tests/shared-project-state.test.ts`. Do not clean, reset, stage, or normalize unrelated state.

## Project and testing context

The repository is a TypeScript/Node.js ESM project using Bun. `openspec/config.yaml` already exists and is user-maintained: it records `strict_tdd: true`, Bun as the package manager, and `cd installer && bun run typecheck` as the configured typecheck. Its test-runner framework and test-command fields are blank despite repository evidence that focused tests use `bun:test` and the root convention is `bun test`; this scope does not rewrite that configuration. No test, build, or typecheck command was run.

The project is split between the portable Ein core, Pi runtime assets under `ein-pi/agent/`, Claude-specific adaptation under `cc-ein/`, and installer-owned deployment under `installer/`. C adds runtime session behavior at the adapter boundary; it does not make the installer, `cc-ein/CLAUDE.md`, Fish launcher installation, or either runtime's private store a new owner.

## Dependency and authority boundary

The canonical roadmap `docs/roadmap-features-ein.md` defines C as the adapter slice after B. It requires a common list/create/resume/launch surface, keeps runtime histories private, transfers normalized project state rather than conversation history, and excludes launcher UI, updater work, parallel writers, and installer ownership changes.

Archived B is `openspec/changes/archive/shared-project-state-contract/`. Its scope, map, design, tasks, summary, sync report, and verify report establish the handoff:

- `ein-pi/agent/lib/project-state.ts` is the read-only `ProjectStateV1` boundary and source-attributed authority for identity, OpenSpec, EIN.md, Git, verification freshness, and runtime capability/reference metadata.
- The B contract does not contain session commands, transcript fields, persistence callbacks, private paths, or launcher operations. C must consume it, not extend it into a second state store.
- A runtime switch or session resume never refreshes verification. C must carry the project-state identity used by a request and leave freshness evaluation to B's contract.
- B's focused suite is `tests/shared-project-state.test.ts`; current Pi metadata coverage is `tests/sessions.test.ts`; current isolated launcher/deployment evidence is `tests/installer-runtime-menu.test.ts`.

The behavior declaration for this change is the validated delta at `openspec/changes/runtime-session-adapters/specs/sdd-lifecycle/spec.md`. It is the sole declaration for this change; no `spec_delta: none` block is present or permitted in this scope artifact.

## Canonical OpenSpec context

The bounded canonical domain selected for this scope is exactly:

| path | domain | SHA-256 | bytes |
|---|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `sdd-lifecycle` | `c5f128f9bde1749bf802431a87ab2785a7cd71c73a68d01aa9222c9f49a9e5fa` | 24857 |

Only this one canonical `openspec/specs/<domain>/spec.md` path was selected and read. No `.sdd` specification and no other canonical domain is context for this phase. The selected lifecycle scenarios constrain the archived B project-state boundary, runtime-private session references, deterministic normalization, legacy/ambiguous source handling, and the separation between lifecycle state and runtime launch. The selection is within the three-file/32 KiB UTF-8 phase limit.

## Objective

Deliver the smallest usable adapter seam that lets a future launcher ask one normalized surface to inspect or prepare a runtime session for a selected project. The seam must pass a verified `ProjectStateV1` snapshot/boundary through every operation, preserve runtime-specific capability differences, and use existing isolated Pi/Claude launch contracts without installing or persisting anything.

The first vertical slice is intentionally adapter-only:

1. list recent **project-scoped** sessions using safe metadata already available from the runtime;
2. create a new runtime-session request without writing a shared session record;
3. resume an existing session only when its opaque reference belongs to the same runtime and selected project; and
4. prepare/execute a safe launch through fixed arguments and the existing runtime isolation.

A request/result can expose an opaque, provider-scoped session reference needed for same-runtime resume. It must not expose a session file path, transcript, prompt, message, or private runtime store.

## In-scope behavior

### 1. One normalized adapter surface over `ProjectStateV1`

- Define a small common TypeScript contract for `pi` and `claude` providers with operations for `list`, `create`, `resume`, and `launch`.
- Every result is provider-scoped and reports capability/outcome explicitly: successful normalized data, `unsupported`, `unavailable`, or a deterministic safe error. A common field shape must not imply that Pi and Claude have identical lifecycle capabilities.
- Inputs are selected project identity plus the verified `ProjectStateV1` boundary and operation data. The adapter does not re-project OpenSpec, Git, EIN.md, or runtime state, and does not create a second `ProjectState` type or cache.
- A resume or launch request carries the project-state identity used (at minimum the selected identity and available exact Git `stateRef`); it does not turn a runtime operation into new verification evidence.
- The common surface returns bounded metadata and launch intent/result, not a launcher TUI/CLI. The future launcher remains the orchestrator and presentation owner.

### 2. Pi metadata listing, bounded to the selected project

- Reuse the existing isolated Pi session layout and `ein-pi/agent/lib/sessions.ts` reader seam. Existing files are `~/.pi/agent/sessions/<project-encoded>/<session>.jsonl` under the active isolated Pi agent home, and the first JSONL line contains the session id and `cwd` metadata.
- Read only the bounded first-line metadata needed to identify an opaque session reference, working directory/project scope, and recency. Do not read the rest of a JSONL transcript.
- Match metadata to the selected project identity conservatively (no neighboring-project or basename guess). Missing/invalid `cwd`, missing id, malformed first line, unreadable file, and out-of-project entries must not become a successful session.
- Avoid the current reader's cross-project `limit` causing a selected project's recent sessions to disappear; map/design must choose a bounded project-filter seam that preserves existing `listRecentSessions` behavior for the Pi banner and `/ein:resume` callers.
- Keep internal absolute JSONL paths private. The adapter may use an internal lookup or re-read metadata to resolve an opaque same-runtime reference, but it must not return the path or create a persisted index.
- Preserve existing `humanizeAge`/`listRecentSessions` compatibility and existing `tests/sessions.test.ts` behavior unless a focused compatibility decision is recorded in design.

### 3. New-session and same-runtime resume requests

- `create` produces a normalized request for the selected provider and project; it does not migrate an old conversation, write a shared session database, or claim that a session already exists before the runtime starts.
- `resume` accepts only an opaque reference issued by the same adapter/provider and validated against the selected project. A Pi reference cannot be handed to Claude, and a Claude reference cannot be handed to Pi.
- Resume must include the `ProjectStateV1` identity used by the request and must fail closed for ambiguous/unavailable project identity, a missing required exact state identity selected by design, mismatched project metadata, unknown reference, or unsupported provider resume semantics.
- Resuming or changing runtime does not copy, import, export, merge, or refresh private conversation history or verification evidence. Continuity is only the normalized project state consumed by the adapter.
- The adapter must not invent a Pi/Claude resume flag. Apply must verify the actual supported invocation mechanism from repository/runtime evidence and return `unsupported` when equivalent safe semantics are not available.

### 4. Safe isolated launch

- Reuse the existing isolation contracts already embodied by the launch surfaces, without changing installer ownership:
  - Pi: `pi-ein/pi-ein.fish` exports `PI_CODING_AGENT_DIR=$HOME/.pi-ein/agent` and `EIN_PI_AGENT_HOME=$HOME/.pi-ein/agent`, then launches `pi`.
  - Claude: `cc-ein/cc-ein.fish` exports `CLAUDE_CONFIG_DIR=$HOME/.claude-ein`, prepends `$HOME/.claude-ein/bin` for the isolated SDD entrypoint, and launches `claude`; `cc-ein/CLAUDE.adapter.md` remains the Claude adaptation source.
- Build or execute a fixed executable/argument/environment launch plan with the selected project `cwd`; caller data must never be interpolated into a shell command string. Prefer a non-shell process boundary and an injectable executor in focused tests.
- Do not install Fish functions, run `cc-ein/sync.ts`, modify `CLAUDE_CONFIG_DIR`, migrate Pi state, update dependencies, read or log secrets, or rewrite runtime-owned files as part of an adapter launch.
- Fail closed when the isolated runtime mechanism, executable, required environment, project identity, or requested capability is unavailable. A partial launch must return a normalized failure and must not write a shared session record.

### 5. Claude asymmetry and explicit capability translation

- Current Claude evidence covers adaptation/synchronization and isolated launch, not a verified Claude session metadata reader or same-runtime resume contract. Do not infer a Claude session store, transcript format, or resume flag from Pi.
- Claude `list` and/or `resume` must therefore remain explicit `unsupported`/`unavailable` until a bounded, verified mechanism exists. `create` and `launch` may be supported only through the existing isolated mechanism and only with the safe invocation evidence selected in design.
- Pi operations must likewise return explicit unsupported/unavailable outcomes if the runtime does not provide a verified equivalent rather than claiming a false common capability.
- Feed only public capability names, opaque provider references, and stable error metadata into the B runtime metadata shape. Never feed transcript/path/command/prompt fields into `ProjectStateV1`.

### 6. Focused contract tests for later apply/verify

Later apply must add or extend focused Bun tests in strict RED → GREEN → TRIANGULATE → REFACTOR order. At minimum, cover:

- one common contract for Pi and Claude with normalized operation outcomes and provider-specific capability matrices;
- Pi JSONL fixtures for valid first-line metadata, recency, exact project filtering, malformed/empty lines, missing ids/cwds, unreadable files, out-of-project sessions, and bounded results;
- create requests that are request-only and do not create a shared state/session file;
- same-runtime resume success with project-state identity, cross-runtime rejection, wrong-project rejection, unknown-reference rejection, and fail-closed missing/ambiguous state;
- safe launch plans for Pi and Claude asserting fixed executable/argv, selected `cwd`, isolated environment variables, no shell interpolation, no secret logging, and no installer writes;
- Claude/Pi unsupported capability results with deterministic reason codes and no fabricated resume behavior;
- privacy assertions proving no JSONL transcript content, prompt, message, absolute session path, shared persistence, or cross-runtime history transfer appears in normalized output;
- compatibility of existing `tests/sessions.test.ts`, `tests/shared-project-state.test.ts`, and `tests/installer-runtime-menu.test.ts` contracts, without adding launcher UI/CLI tests.

No tests are run in this scope phase.

## Existing implementation seams and evidence

| Evidence | Current responsibility | C handoff constraint |
|---|---|---|
| `docs/roadmap-features-ein.md` | Canonical A–L sequence; C owns adapters and D owns the launcher. | Respect B dependency, private histories, and all roadmap exclusions. |
| `openspec/changes/archive/shared-project-state-contract/{scope,map,design,tasks,summary,verify-report,sync-report}.md` | Archived B contract, implementation decisions, verified acceptance, and canonical-sync provenance. | Consume the public `ProjectStateV1` boundary; do not reopen B or add a second state store. |
| `openspec/specs/sdd-lifecycle/spec.md` | Canonical lifecycle behavior, including the four B project-state scenarios and runtime privacy boundary. | Preserve source authority, explicit incomplete/unsupported states, and no competing store. |
| `ein-pi/agent/lib/project-state.ts` | `ProjectStateV1`, runtime availability/capability/reference/error metadata, Git/verification identity. | Do not change this contract in C; adapters consume it and carry its identity. |
| `ein-pi/agent/lib/sessions.ts` | Best-effort recent Pi listing; scans isolated session directories, reads only first JSONL line, returns id/cwd/recency plus an internal path. | Add only the smallest project-scoped adapter seam; preserve existing all-project callers and keep path internal. |
| `tests/sessions.test.ts` | Pi metadata fixture and recency/limit/exclude behavior. | Preserve it; add adapter-specific project scope and privacy cases. |
| `cc-ein/CLAUDE.adapter.md` | Claude-specific coordinator/adaptation policy and isolated SDD command boundary. | Treat as source input, not a session-history API; do not edit generated `cc-ein/CLAUDE.md`. |
| `cc-ein/cc-ein.fish` and `pi-ein/pi-ein.fish` | Existing isolated Claude/Pi environment and runtime launch functions. | Reuse exact isolation semantics without changing installer-owned launcher files. |
| `installer/src/core/launcher.ts` | Installs exactly one named Fish launcher while preserving unrelated functions. | No installer changes; C must not make adapters installer/updater owners. |
| `tests/installer-runtime-menu.test.ts` | Verifies launcher ownership, Claude payload/setup, and Pi/Claude install target separation. | Keep these contracts unchanged; adapter tests must not turn installation into runtime-session persistence. |

## Proposed implementation surface

Map/design should confirm final names, but the bounded likely surface is:

- one common adapter contract and orchestration seam under `ein-pi/agent/lib/` (for example `runtime-session-adapters.ts`);
- one small Pi adapter/helper that composes the existing session metadata reader, with a project filter or equivalent internal lookup only if required;
- one Claude adapter that exposes the verified isolated launch capability and explicit unsupported/unavailable results for capabilities without repository evidence;
- focused tests under `tests/` (likely `tests/runtime-session-adapters.test.ts`) plus only narrowly necessary additions to `tests/sessions.test.ts`;
- no changes to `installer/src/`, `installer/README.md`, `cc-ein/CLAUDE.md`, `cc-ein/sync.ts`, Fish launcher installation, `project-state.ts`, OpenSpec router, EIN.md, updater, or shared persistence.

The implementation must remain bounded to adapters, metadata normalization, safe launch execution/planning, and their focused tests. If equivalent Pi/Claude operation semantics cannot be proved within this surface, the adapter returns unsupported rather than expanding into a launcher, installer, or runtime-store project.

## Acceptance criteria for later design/apply/verify

1. Pi and Claude are addressable through one typed normalized list/create/resume/launch surface over an input `ProjectStateV1`; each operation identifies the provider, project identity, capability/outcome, and deterministic error when unavailable.
2. Pi listing uses the existing isolated JSONL metadata boundary, is limited to the selected project, reads no transcript body, returns opaque provider-scoped references, and preserves existing Pi session-reader callers.
3. A new-session operation creates only a bounded runtime request; no shared session record, project-state snapshot, transcript export, or persistence store is written.
4. Resume succeeds only for a same-runtime, same-project opaque reference and carries the project-state identity used. Cross-runtime, mismatched, unknown, ambiguous, unavailable, and unsupported cases fail closed without refreshing verification.
5. Safe launch uses the existing isolated Pi/Claude environment contracts, fixed argv and selected `cwd`, a non-shell execution boundary, and no installer/launcher installation or updater mutation. Caller-controlled input cannot become shell syntax.
6. Claude and Pi capability differences remain visible. A missing verified list/resume/launch mechanism yields explicit unsupported/unavailable output, never a guessed flag, fake session, or false equivalence.
7. Normalized adapter output contains no transcript, prompt, message, private session path, secret, shared persistence reference, or cross-runtime history migration. Only bounded metadata, opaque provider references, capability/error data, and `ProjectStateV1` identity cross the boundary.
8. Focused Bun tests cover metadata scope, privacy, capability asymmetry, state-bound resume, safe launch, and no writes; existing Pi session, B project-state, and installer ownership contracts remain compatible.
9. The change remains bounded to C. It does not add launcher UI/CLI, project selection orchestration, installer/update behavior, shared persistence, transcript migration/export, parallel writers, cleaner/architect work, or E2E hardening.

## Non-goals and hard exclusions

- **No launcher TUI/CLI:** D owns selection, presentation, orchestration, and doctor access.
- **No private-history continuity:** never migrate, export, import, merge, summarize, or persist Pi/Claude transcripts, prompts, or messages.
- **No shared session/project-state store:** no database, JSON snapshot, cache, session index, or adapter-owned persistence. Runtime-private stores remain runtime-owned.
- **No installer ownership change:** do not edit installer install/update paths, Fish launcher installation, payload synchronization, migration, backups, or secrets handling.
- **No updater or configuration advisor:** later roadmap work owns those behaviors.
- **No parallel writers/worktrees:** later roadmap work owns safe parallelism; adapters are read/launch seams only.
- **No OpenSpec/EIN/Git authority rewrite:** B remains the source-attributed project-state owner; adapters do not refresh verification or write project artifacts.
- **No assumed Claude session reader or resume flag:** absent verified evidence is an explicit unsupported/unavailable outcome.
- **No guessed Pi resume semantics:** verify the actual runtime mechanism before implementing; fail closed otherwise.
- **No runtime UI, broad CLI, installer shell, or command-string API:** expose typed plans/results and use fixed process boundaries.
- **No broad refactor of `ein-pi/agent/lib/sessions.ts`:** preserve existing banner and `/ein:resume` behavior; make only the smallest additive project-scope seam if necessary.
- **No roadmap/catalog/README cleanup and no normalization of unrelated dirty/deleted files.**

## Risks and handoff questions

- **Pi resume semantics:** the current evidence proves metadata listing but not the exact external resume invocation. Design/apply must identify a supported safe mechanism or mark resume unsupported; it must not infer a flag.
- **Claude asymmetry:** current Claude evidence proves isolated setup/launch, not session listing/resume. The capability matrix must make that limitation visible instead of emulating Pi from private files.
- **Project scope identity:** exact `cwd` versus repository-root/subdirectory matching needs one deterministic rule. A basename match is unsafe; ambiguous/unavailable identity must never select a neighboring project.
- **Opaque reference lifetime:** a resume reference must be resolvable without a shared index or leaking an absolute path. Design must choose transient lookup versus bounded metadata re-read and test stale/unknown references.
- **State binding:** `ProjectStateV1` may have no usable exact Git `stateRef` for a non-repository, incomplete, or unavailable Git source. Design must state which operations can proceed and which fail closed, without weakening B verification semantics.
- **Safe process boundary:** Fish functions are the established user-facing isolation mechanism, while adapter execution may need a direct executable plus equivalent environment. Design must preserve the exact environment contract without shell interpolation, secret logging, or installer writes.
- **Recency and bounds:** the current reader uses mtime/`Date.now()` for presentation age and applies a global limit before project filtering. Adapter results must remain bounded and project-correct without breaking existing callers.
- **Private metadata leakage:** Pi's current `RecentSession` includes an absolute path for internal banner use. The normalized adapter type must not reuse that field publicly or feed it into B runtime references.
- **Review workload:** implementation should remain one adapter work unit with focused tests; if the bounded slice grows beyond the configured review budget, the parent must split before implementation.

## Scope phase boundary

This artifact bounds roadmap C and records the stack, configuration, canonical context, authority seams, acceptance criteria, and exclusions for the next SDD phases. No source, test, installer, generated Claude, or unrelated project file was edited, and no test/build/typecheck command was executed. The validated behavior declaration is the separate `sdd-lifecycle` delta at `openspec/changes/runtime-session-adapters/specs/sdd-lifecycle/spec.md`; it is the only spec declaration for this change.
