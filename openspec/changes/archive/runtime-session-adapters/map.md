status: pass
scope_status: bounded
change: runtime-session-adapters
phase: sdd-map
budget:
  max_tokens: 15000
  max_reads: 30
  budget_source: scope.md
  webfetch: false
  budget_exceeded: true
  exploration_stopped: true

ledger:
  reads:
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/ein-discipline/SKILL.md, lines: "1-101", estimated_tokens: 900 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt-modules/SKILL.md, lines: "1-76", estimated_tokens: 500 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/cognitive-doc-design/SKILL.md, lines: "1-67", estimated_tokens: 450 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/next/SKILL.md, lines: "1-150", estimated_tokens: 950 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt/SKILL.md, lines: "1-76", estimated_tokens: 600 }
    - { path: openspec/changes/runtime-session-adapters/scope.md, lines: "full validated scope packet", estimated_tokens: 4200 }
    - { path: "codegraph: Pi sessions/listing/resume callers", lines: "sessions.ts and callers; verbatim symbols", estimated_tokens: 2800 }
    - { path: "codegraph: ProjectStateV1/runtime metadata", lines: "query returned partial unrelated indexed symbols", estimated_tokens: 900 }
    - { path: "codegraph: Claude isolated launcher/continuation", lines: "indexed Claude-related symbols; output partially trimmed", estimated_tokens: 1200 }
    - { path: "codegraph: process execution/privacy helpers", lines: "exec.ts and related indexed symbols", estimated_tokens: 1200 }
    - { path: "codegraph: focused tests", lines: "sessions.test.ts and test callers; output partially trimmed", estimated_tokens: 1200 }
    - { path: openspec/changes/runtime-session-adapters/specs/sdd-lifecycle/spec.md, lines: "full validated delta", estimated_tokens: 900 }
    - { path: openspec/specs/sdd-lifecycle/spec.md, lines: "full selected canonical spec", estimated_tokens: 5000 }
    - { path: ein-pi/agent/lib/project-state.ts, lines: "full current source", estimated_tokens: 5000 }
    - { path: cc-ein/cc-ein.fish, lines: "1-17", estimated_tokens: 180 }
    - { path: cc-ein/CLAUDE.adapter.md, lines: "1-57", estimated_tokens: 800 }
    - { path: installer/src/core/exec.ts, lines: "1-119", estimated_tokens: 900 }
    - { path: installer/src/core/executable.ts, lines: "1-150", estimated_tokens: 1200 }
    - { path: openspec/changes/archive/shared-project-state-contract/map.md, lines: "full archived B map", estimated_tokens: 3500 }
    - { path: openspec/changes/archive/shared-project-state-contract/design.md, lines: "full archived B design", estimated_tokens: 3200 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed:
    tokens: 15000
    reads: 30

# Map — runtime-session-adapters

## Executive map

The bounded C slice can be implemented as a new adapter module under `ein-pi/agent/lib/` plus focused tests. It should consume `ProjectStateV1`, compose the existing Pi first-line metadata reader, and expose provider/capability/outcome discriminants without adding persistence, launcher UI, installer ownership, or a second project-state store.

The strongest existing runtime seam is Pi metadata listing. Claude evidence proves isolated setup/launch and adaptation/synchronization, but does not prove a Claude session reader or resume contract. Pi resume invocation was not verified by the bounded evidence; design/apply must prove an actual mechanism or return `unsupported` rather than invent a flag.

## Authority and spec context

- The sole behavior declaration is `openspec/changes/runtime-session-adapters/specs/sdd-lifecycle/spec.md`; its six scenarios require a normalized list/create/resume/launch surface, Pi project-scoped metadata, private histories, safe isolated launch, same-runtime/state-bound resume, and explicit unsupported outcomes.
- The selected canonical domain is only `openspec/specs/sdd-lifecycle/spec.md`. Relevant authority is the archived B project-state boundary and its runtime privacy/freshness rules; C must consume B and must not extend it with session commands, transcript fields, private paths, persistence callbacks, or a second state type.
- The archived B seam is `ein-pi/agent/lib/project-state.ts`; B's runtime section is intentionally metadata-only. Runtime switches/resumes do not refresh verification, and a request must carry the identity used by the supplied state.
- Strict TDD is enabled by `openspec/config.yaml`. This map ran no tests, builds, or typechecks. Later apply must record RED → GREEN → TRIANGULATE → REFACTOR and verify must rerun focused evidence independently.

## Existing public seams and exact evidence

### `ProjectStateV1` boundary — `ein-pi/agent/lib/project-state.ts`

Public types relevant to C:

- `ProjectStateV1` has `schemaVersion`, `identity`, `openspec`, `ein`, `git`, `verification`, and `runtimes`.
- `ProjectIdentity` is source-attributed and contains `cwd`, optional `repositoryRoot`, `quality`, `reason`, and optional detail.
- `ProjectGitState` carries repository/root/head/branch/dirty/complete/change metadata and optional exact `stateRef`.
- `ProjectRuntimeProvider` is `"pi" | "claude"`; `ProjectRuntimeMetadata` permits `availability`, `quality`, `reason`, `capabilities`, `references`, and `errors`; `ProjectRuntimeState` normalizes the same fields for each provider.
- `ProjectRuntimeError` has a stable `ProjectStateReasonCode` plus optional detail. C should carry the selected identity and available exact `git.stateRef`, not recompute or refresh it.

The existing runtime normalizers are a privacy seam, not an adapter operation seam: public tokens are bounded by `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; tokens/details containing `prompt`, `transcript`, `message`, or `command` are rejected; details reject path separators, NUL, and newlines. Adapter output should reuse the same privacy vocabulary and keep opaque provider references separate from B's normalized runtime metadata. No runtime metadata type currently contains list/create/resume/launch requests.

`projectProjectState` is read-only and computes state on demand. Its Git reader uses fixed `execFileSync("git", ["--no-optional-locks", ...args])`; it is not a shell-command API. C must not mutate or widen this boundary.

### Pi metadata — `ein-pi/agent/lib/sessions.ts`

Current exact seam:

- `SESSIONS_DIR = join(AGENT_DIR, "sessions")`; `AGENT_DIR` comes from `../extensions/ein-paths` and honors the isolated Pi agent home.
- `RecentSession` currently exposes `project`, `id`, `ageMs`, `cwd`, and `path`. The absolute `path` is an internal compatibility field for current Pi UI and must not cross the normalized adapter boundary.
- `collectCandidates()` scans every top-level project directory below the isolated sessions directory, keeps `.jsonl` files, and sorts by file `mtimeMs` descending in `listRecentSessions`.
- `readFirstLine()` opens a session file, reads only a 1024-byte prefix, takes the first line, and closes the file. It never reads the transcript body.
- `readSessionMeta()` parses the first line, requires a non-empty string `id`, and returns `cwd` only when it is a string; malformed/empty lines become `null`.
- `listRecentSessions(limit, opts)` applies `limit` while scanning the globally sorted candidates, then derives a display `project` with `basename(cwd)` (or `"sesion"`). `excludePath` and optional `dedupeByProject` are existing options. This global limit is the selected-project starvation hazard called out by scope.

Existing callers are Pi banner/resume-related surfaces (`ein-pi/agent/extensions/ein-banner.ts` and `ein-pi/agent/extensions/ein-ai.ts`). Preserve `humanizeAge`, the all-project ordering, `excludePath`, deduplication, and the current `RecentSession` compatibility shape. The additive C seam should either filter by exact selected identity before applying its own bound or collect a bounded project-correct set without changing the old function's behavior. Any path needed for internal lookup must remain private and transient; no index/cache/state file is allowed.

### Pi launch/resume evidence

- The validated scope records the existing isolated Pi launcher contract in `pi-ein/pi-ein.fish`: it exports `PI_CODING_AGENT_DIR=$HOME/.pi-ein/agent` and `EIN_PI_AGENT_HOME=$HOME/.pi-ein/agent`, then launches `pi`.
- The inspected Pi session module establishes metadata ids and private JSONL locations, but does not itself expose a resume invocation API or a verified external resume flag. The bounded codegraph evidence did not establish a safe Pi resume command. Treat Pi resume as `unsupported` until apply verifies a real mechanism; do not infer a flag from the file name or id.
- Pi list is the only runtime lifecycle operation with a strong existing implementation seam. Pi create can be a request-only normalized intent, but must not claim a persisted session before Pi starts. Pi launch is a candidate supported capability only after the direct executable/environment contract is verified.

### Claude isolated launch and continuation

`cc-ein/cc-ein.fish` is the current isolated user-facing contract:

- Function-scoped `CLAUDE_CONFIG_DIR` is `$HOME/.claude-ein`.
- Function-scoped `PATH` prepends `$HOME/.claude-ein/bin` so `cc-ein-sdd` resolves from the isolated config.
- If `CONTEXT7_API_KEY` is absent, the function reads the configured secret file and exports the trimmed value; secrets remain environment/file owned, not baked into config.
- It invokes `command claude $argv`.

`cc-ein/CLAUDE.adapter.md` is adaptation policy, not a session API. It identifies Claude native tools, `Task` delegation, and `cc-ein-sdd` lifecycle commands; it explicitly treats `cc-ein/CLAUDE.md` as generated output. The inspected evidence contains no Claude session metadata reader, private session format, same-runtime resume operation, or verified resume flag. Therefore Claude list and resume must be explicit `unsupported`/`unavailable`; no Pi-derived emulation is safe. Claude create and launch may be supported only as request/launch-plan operations reusing the isolated environment semantics, without invoking `sync.ts`, installation, or generated-output writes.

### Process execution boundary

`installer/src/core/exec.ts` provides a reusable safe process shape: `run(cmd, args, opts)` calls `Bun.spawn([cmd, ...args])`, passes `cwd`, builds an environment from inherited values plus explicit overrides/extra PATH, and uses pipe/inherit/ignore stdio choices with optional timeout. `lookPath`, `resolveFromCandidates`, and `commandExists` resolve executables without a shell. This is installer-owned code and is not automatically a C owner; design must decide whether to compose its shape or define a minimal adapter-local injectable executor rather than creating an installer dependency.

The adapter launch plan must be typed as fixed executable plus fixed argv plus selected `cwd` and isolated env. Caller input must never be assembled into a shell string. Launch failure must be normalized and must not create a shared session record. Do not log stdout/stderr that could contain secrets or prompts.

`installer/src/core/secrets.ts` is a secret-storage boundary, not an adapter helper. The Claude Fish function's fallback demonstrates why the adapter should not read, expose, or log secret material.

## Project-scoping rules and unresolved design decisions

Evidence supports conservative scope matching only:

1. The selected request has `ProjectStateV1.identity.cwd` and possibly `identity.repositoryRoot`.
2. Pi metadata has an exact `cwd` string in its first line. The sessions directory name and `basename(cwd)` are not sufficient identity; neighboring projects can share names.
3. A normalized list item should expose only bounded recency, opaque provider-scoped reference, and safe scope metadata (if any), never the absolute JSONL path.
4. Out-of-project, missing/invalid `cwd`, missing id, malformed first lines, unreadable files, and ambiguous/unavailable identity must fail closed or be omitted with deterministic diagnostics.

Design must pin whether the first slice requires exact `identity.cwd` equality, permits a safely defined repository-root/subdirectory relation, or rejects non-exact relations. It must not silently use basename, encoded session-directory name, or a guessed neighboring repository. A resume reference must be checked against the selected identity again by bounded metadata re-read when no persistent lookup exists.

## Capability and outcome matrix (evidence-based)

| Provider | list | create | resume | launch | Evidence/constraint |
|---|---|---|---|---|---|
| Pi | **candidate supported** | **request-only supported** | **unsupported pending proof** | **candidate supported** | First-line JSONL seam exists; no verified resume invocation; isolated Fish env is established by scope. |
| Claude | **unsupported/unavailable** | **request-only supported** | **unsupported/unavailable** | **candidate supported** | Isolated config/launcher exists; no verified metadata reader or resume semantics. |

Every matrix cell must be exposed as an explicit capability/outcome, not inferred from the common method name. A provider/runtime unavailable, missing executable, missing required isolated env, invalid selected project, or missing required state identity must produce deterministic `unavailable`/safe error results. `unsupported` means the runtime has no verified equivalent in this slice; `unavailable` means a known capability cannot be used in the current environment.

## Expected implementation seams and blast radius

### New production seam

- Preferred: `ein-pi/agent/lib/runtime-session-adapters.ts` (final name/design-owned), containing normalized provider/operation types, Pi and Claude adapter composition, opaque-reference validation, capability translation, launch plan/executor boundary, and deterministic outcomes.
- A small internal Pi metadata helper may be added only if `sessions.ts` cannot provide project-filter-before-limit behavior without changing existing callers. Keep `RecentSession.path` internal and avoid broad refactoring of `sessions.ts`.
- `project-state.ts` is an input boundary only; do not edit it or add session fields to `ProjectStateV1`.

### Focused tests

- New `tests/runtime-session-adapters.test.ts` should cover the common contract, provider-specific capability matrix, Pi first-line fixtures and exact filtering/bounds/recency/privacy, request-only create/no writes, same-runtime/state-bound resume, cross-runtime/wrong-project/unknown/missing-state failures, fixed argv/cwd/isolated env/no shell, secret non-logging, unsupported Claude/Pi outcomes, and no transcript/path/history transfer.
- Preserve `tests/sessions.test.ts`: its fixture writes first-line metadata plus transcript-like trailing content, asserts mtime ordering/project basename, limit, and `excludePath`. Preserve `tests/shared-project-state.test.ts` for B runtime normalization/privacy/state identity. Preserve `tests/installer-runtime-menu.test.ts` for launcher ownership and Pi/Claude install-target separation. Do not add launcher UI/CLI tests.

### Existing compatibility surfaces and blast radius

| Surface | Current role | C action/risk |
|---|---|---|
| `ein-pi/agent/lib/sessions.ts` | Pi all-project banner and `/ein:resume` metadata reader | Additive project-scope helper only; global limit behavior must remain unchanged. |
| `ein-pi/agent/extensions/ein-banner.ts`, `ein-ai.ts` | Existing Pi consumers | No behavior change; do not leak path or alter resume UI. |
| `ein-pi/agent/lib/project-state.ts` | B read-only state authority | Consume `ProjectStateV1`; do not rewrite, cache, or refresh verification. |
| `pi-ein/pi-ein.fish` | Pi isolated environment/user launcher | Reuse semantics; no installer or Fish edits. |
| `cc-ein/cc-ein.fish` | Claude isolated config/PATH/secret-env launcher | Reuse semantics through safe direct plan; do not make adapter own secret lookup or shell installation. |
| `cc-ein/CLAUDE.adapter.md` | Claude adaptation source | Read-only input; do not edit generated `CLAUDE.md`. |
| `installer/src/core/exec.ts` | Existing non-shell spawn seam | Possible shape/reference only; installer remains out of scope. |
| `installer/src/core/launcher.ts` and `tests/installer-runtime-menu.test.ts` | Launcher installation ownership | No changes; adapter must not install or persist. |
| `openspec/`, `EIN.md`, `cc-ein/sync.ts` | SDD/project/Claude generated or sync ownership | No changes in C. |

### Privacy boundary

Normalized adapter data may contain provider, operation, capability, opaque provider-scoped reference, bounded recency, project/state identity, and stable error code/detail. It must exclude JSONL body/transcript, prompt, message, absolute session path, private runtime store path, shell command text, secrets, shared persistence references, and cross-runtime history. `ProjectStateV1.runtimes` accepts only sanitized public capability/reference/error tokens; it must not be used as a transcript or session index.

## Strict-TDD handoff

Map performed no test/build/typecheck execution. Design should turn the matrix and seams into a small typed contract and fixture-first test plan. Apply must start with failing focused tests, then implement only the adapter seam, triangulate all negative/privacy/capability cases, and refactor after evidence. Verify must independently rerun the focused adapter suite plus the required compatibility contracts without relying on apply results.

## Risks

- **High:** Pi resume semantics are not proven by the current metadata reader; a guessed flag would violate the spec.
- **High:** exact `cwd` versus repository-root/subdirectory matching can select the wrong neighboring project if weakened to basename or encoded directory names.
- **High:** direct adapter execution must preserve Fish isolation without importing installer ownership, shell interpolation, secret access, or launcher writes.
- **Medium:** the existing Pi global limit can starve selected-project results; project filtering must precede the adapter bound while preserving old callers.
- **Medium:** opaque reference lifetime requires transient metadata re-read or equivalent non-persistent validation; no shared index is permitted.

## Next phase

Recommend `sdd-design`: pin the public discriminated types, project-match rule, opaque-reference format/validation, Pi capability result, unsupported matrices, direct launch-plan/executor contract, and strict-TDD focused test order.

## Skill applicability

- `ein-discipline`: applied for bounded SDD mapping, strict-TDD boundary, and no implementation.
- `cognitive-doc-design`: applied for answer-first map structure, seam tables, explicit matrix, and review-oriented risks.
- `nuxt-modules`, `next`, `nuxt`: skipped; this is a TypeScript/Node/Bun runtime-adapter seam with no Nuxt module, Next.js, or Nuxt route/server surface.
- `skill_resolution: paths-injected`.
