status: pass
scope_status: bounded
change: shared-project-state-contract
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
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt/SKILL.md, lines: "1-76", estimated_tokens: 600 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/work-unit-commits/SKILL.md, lines: "1-82", estimated_tokens: 500 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/cognitive-doc-design/SKILL.md, lines: "1-67", estimated_tokens: 450 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/hono/SKILL.md, lines: "1-300", estimated_tokens: 1400 }
    - { path: openspec/changes/shared-project-state-contract/scope.md, lines: "1-260", estimated_tokens: 4300 }
    - { path: EIN.md, lines: "1-57", estimated_tokens: 500 }
    - { path: openspec/specs/sdd-lifecycle/spec.md, lines: "full selected canonical spec", estimated_tokens: 2600 }
    - { path: openspec/changes/shared-project-state-contract/specs/sdd-lifecycle/spec.md, lines: "full validated delta", estimated_tokens: 950 }
    - { path: openspec/config.yaml, lines: "1-58", estimated_tokens: 400 }
    - { path: ein-pi/agent/lib/sdd-router.ts, lines: "21-239, 240-521, 522-759, 760-839", estimated_tokens: 6800 }
    - { path: ein-pi/agent/lib/project-context.ts, lines: "18-66, 68-128, 335-400", estimated_tokens: 2900 }
    - { path: ein-pi/agent/lib/git-baseline.ts, lines: "1-121", estimated_tokens: 1100 }
    - { path: ein-pi/agent/lib/sdd-preflight.ts, lines: "23-64, 475-557", estimated_tokens: 1700 }
    - { path: tests/sdd-router.test.ts, lines: "full focused suite", estimated_tokens: 3300 }
    - { path: tests/sdd-status-output.test.ts, lines: "full focused suite", estimated_tokens: 2300 }
    - { path: tests/project-context.test.ts, lines: "full focused suite", estimated_tokens: 1300 }
    - { path: tests/git-baseline.test.ts, lines: "full focused suite", estimated_tokens: 2300 }
    - { path: tests/sdd-next-dispatcher.test.ts, lines: "1-168 via codegraph", estimated_tokens: 1200 }
    - { path: tests/harness-discipline.test.ts, lines: "working-tree/bootstrap describe blocks", estimated_tokens: 1700 }
    - { path: cc-ein/sdd-cli/cli.ts, lines: "1-280", estimated_tokens: 2800 }
    - { path: tests/sdd-tdd-phase-boundary.test.ts, lines: "1-112 via codegraph", estimated_tokens: 800 }
    - { path: tests/sdd-phase-runtime-contract.test.ts, lines: "1-155 via codegraph", estimated_tokens: 700 }
    - { path: ein-pi/agent/extensions/ein-ai.ts, lines: "1-120, 230-494, 498-700 via codegraph", estimated_tokens: 2600 }
    - { path: ein-pi/agent/lib/sdd-close.ts, lines: "1-114 via codegraph", estimated_tokens: 700 }
    - { path: ein-pi/agent/lib/sdd-guardrails.ts, lines: "selected task/verify guardrails via codegraph", estimated_tokens: 750 }
    - { path: ein-pi/agent/lib/openspec-spec-sync.ts, lines: "selected OpenSpec state symbols via codegraph", estimated_tokens: 900 }
    - { path: ein-pi/agent/lib/mode.ts, lines: "1-108 via codegraph", estimated_tokens: 450 }
    - { path: openspec/changes/archive/beta-truth-and-exit-criteria/map.md, lines: "1-190", estimated_tokens: 1800 }
    - { path: "codegraph: 29 read-only symbol/exploration queries, consolidated", lines: "sdd-router/status, project-context, Git/preflight, CLI/status, focused tests and callers", estimated_tokens: 17500 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed:
    tokens: 56100
    reads: 30

## Map conclusion

The smallest safe seam is a new read-only projector under `ein-pi/agent/lib/`, with a focused contract suite under `tests/`. It should compose the existing OpenSpec router and EIN reader, retain the existing Git baseline as an advisory compatibility signal, and add a narrowly defined exact-Git reader/fingerprint without changing existing status/close semantics. The current implementation has no shared project-state owner and no exact-state verification binding.

The map is usable for design, but exploration reached the configured read/token budget while consolidating repeated codegraph evidence; no further reads were performed after the budget stop. No test, build, typecheck, or source/document edit was performed.

## Canonical authority and behavior delta

- The only selected canonical domain is `openspec/specs/sdd-lifecycle/spec.md`; scope records its SHA-256 as `27300f80b6f47c1a41091242fb28c44136f2087bdd3872b64f8544cc29979d17` and 21,606 bytes. No other canonical domain and no `.sdd` specification is an authority for this slice.
- Relevant canonical scenarios are early-phase status/blocker handling, legacy `.sdd` fallback, OpenSpec provenance gating, fresh independent verification/close gating, repository bootstrap and the single working-tree signal. Existing router and CLI contracts below must remain compatible.
- The sole change declaration is `openspec/changes/shared-project-state-contract/specs/sdd-lifecycle/spec.md`, whose four added scenarios require: exact-Git-bound verification freshness, explicit missing/unreadable/ambiguous/stale values, runtime privacy, and deterministic normalization without a competing store.
- `openspec/config.yaml` retains `strict_tdd: true`; test commands are blank even though repository evidence uses Bun tests. This map did not alter configuration or infer a new runner.

## Current implementation seams

### OpenSpec routing and status — `ein-pi/agent/lib/sdd-router.ts`

- Public status shape `SddChangeStatus` (around lines 84-105) currently contains `change`, per-phase presence, artifact lists, summary, parsed tasks/budget, `apply`, `verify`, `verifyStale`, `specState`, `summaryStale`, `nextRecommended`, and textual `blocked` reasons. It is the closest reusable status projection, but it is not a source-attributed shared contract.
- `resolveChangesDir` (232-239) selects `openspec/changes/` when present, otherwise `.sdd/changes/`, and otherwise returns the canonical path. `phaseArtifactPath` preserves legacy aliases: `explore.md` can satisfy scope/map and `apply.md` can satisfy design. `listActiveChanges` (257-275) enumerates subdirectories, excludes `archive`, catches unreadable entries, and returns alphabetical names.
- `resolveSddStatus` (around 470-650) calls `listActiveChanges`; with no explicit name it picks the first alphabetical active change. With no target it returns `change: null`, `currentPhase: done`, and no blockers. This fallback is compatibility behavior, not suitable as the shared current change when multiple candidates exist. The new projector must inspect the active list first, expose ambiguity/candidates, and only call the router for an explicit or uniquely selected target.
- The phase route is fail-closed: missing scope/map/design/tasks/apply/verify advances to the first missing phase; apply only advances when its parsed status is `complete`; verify `fail`, unknown/malformed, or stale pass routes back to verify; pass plus non-stale evidence routes to close. Early scope/map/design suppress the downstream `tasks.md ausente.` problem, while tasks/apply/verify blockers remain actionable.
- `readOpenSpecState` (around 445-470) composes `readSpecDeltaDeclaration` and `evaluateOpenSpecState`; canonical changes expose `unresolved`, `pending`, `conflict`, or `synchronized` state, while `.sdd` fallback is `legacy`. No spec synchronization or write happens in this reader.
- A canonical change at map with `unresolved` or `conflict` receives the stable `estado de specs OpenSpec: ...; map bloqueado...` blocker and is routed back to scope. The new state must preserve this blocker/provenance rather than inventing a map-ready phase.
- `resolveSddNext` (around 760-820) requires an explicitly named active change for a named request, otherwise delegates to `resolveSddStatus`; it returns human reason/action/blockers and treats `--auto` as mode-only with `autoEnabled: false`. Its reason prioritizes provenance blockers. It must remain an adapter/diagnostic surface, not become a competing projection store.
- `listActiveChangeSummaries` and budget aggregation are consumers of `resolveSddStatus`; they are not required for the first shared projector unless design finds a bounded aggregate use.

### Existing verification freshness — same router

- `readVerifyOutcome` (around 389-407) reads only `verify-report.md`, recognizes explicit `status|result|resultado: pass|fail` (plus a soft fail heuristic), and returns `pass`, `fail`, `unknown`, or `absent`. It does not parse an exact Git identity or a report binding.
- `newestDeliveredMtime` extracts file-looking paths from `tasks.md`, including production and tests while excluding OpenSpec/SDD process paths. `computeStaleness` compares the newest delivered-file mtime with verify/summary mtime, falling back to `apply-progress.md` when the delivered surface cannot be enumerated; comparison is strict `>`.
- Existing tests intentionally preserve the mtime semantics: a later apply artifact alone does not stale evidence when the delivered file remains unchanged; a delivered production file touched after verify does stale it. This is a compatibility distinction, not proof of exact Git freshness.
- The gap for B is material: a passing legacy report with no exact binding can currently be `verify: pass` and non-stale. The projector must keep outcome (`pass`) separate from freshness (`current`, `stale`, `unbound/unavailable`, `failed/unknown/absent`) and fail closed for `current` unless the report binding matches the exact observed state. It must expose reason plus observed/current references when stale or unbound. Resume/runtime changes cannot refresh the evidence.

### Project context — `ein-pi/agent/lib/project-context.ts` and current `EIN.md`

- `einMdPath` resolves only `<cwd>/EIN.md`. `EinMdInfo` is `{ exists, content, rev? }`; `readEinMd` returns `{ exists: false, content: "" }` for absent or unreadable files, otherwise returns UTF-8 content and parses `rev` from `<!-- ein:init rev=...`.
- `einContextDirective` is read-only: it returns empty for missing/blank content and otherwise injects the full trimmed file under the curated project-context heading. `writeEinMd` and `syncEinMdIndex` are separate mutating paths and must not be called by the projector.
- The current `EIN.md` is pre-existing dirty state, has a generated revision/date stamp, and contains pending curated sections plus generated AUTO material. It is authoritative input only; this change must not refresh, normalize, rewrite, or infer facts from it. Empty/placeholder content must remain visibly incomplete.
- `einMdCommitsBehind` is a separate advisory check based on the stamped revision and `git rev-list --count rev..HEAD`; it returns undefined for missing stamps, non-Git contexts, or unresolved revisions. It is commit-distance only and does not represent exact worktree/index freshness. The shared contract should expose it only as source/reference metadata if design needs it, never as proof of current state.
- `readEinMd` is consumed by `ein-ai.ts`/the context directive and by `tests/project-context.test.ts`. The existing reader collapses missing and read-error into one result, so design must either add a diagnostic-preserving read seam or classify inability conservatively as unavailable without changing the writer contract.

### Git/worktree signals — `git-baseline.ts`, preflight, and Claude status CLI

- `GitBaseline` (lines 17-33) intentionally reports only `isRepo`, `dirty`, stash count, and recent reflog reset. `readGitBaseline` (74-85) runs `git rev-parse --is-inside-work-tree`, `git status --porcelain`, reflog, and stash list; command failures collapse to null/empty baseline. `renderGitBaselineLine` is the Pi preflight advisory, where reset is a warning and stash is informational. `renderWorkingTreeLine` (115-121) is the pure single-channel clean/dirty formatter.
- `sdd-preflight.ts` stores an optional baseline in session preferences and injects the baseline only into the parent preflight (`includeBaseline`); phase executors omit it. `ensureSddPreflight` snapshots it once per session before other preflight effects. This is deliberately advisory/session input, not a shared state owner and not a freshness refresh mechanism.
- `cc-ein/sdd-cli/cli.ts` is the actual Claude status channel. `bootstrapRepoIfNeeded` initializes Git only when outside a repository, `openspec/changes/` exists, and neither `CC_EIN_NO_GIT_INIT` nor `CI` is set; failure is text, not a thrown status failure. `buildStatusOutput` composes router status/plan preview, then reads the baseline and appends exactly one `renderWorkingTreeLine` block; it appends `repo: none (...)` only when bootstrap failed. `statusCmd` is a thin console wrapper.
- Current Git has no exact-state seam: no canonical repository root, full HEAD object ID, branch/detached identity, empty-repository state, index object, or deterministic status/untracked fingerprint is returned. `status --porcelain` is not itself an identity and its command failure can be mistaken for clean output. The projector must distinguish non-repository, empty, detached, command-error/unreadable, and clean states; it must never mutate Git.
- Preserve the existing single-channel CLI behavior and Pi preflight warning. Do not move working-tree text into a second status/envelope channel as part of B. The projector may expose normalized Git data for future consumers, but existing status formatters remain compatibility surfaces.

### Runtime/reference boundary

- No existing shared project-state module or runtime capability schema was found. Pi preflight has optional Engram/session memory and `mode.ts` has local work-mode config, but neither is authoritative project state and neither should be inspected for private transcript contents.
- B should emit a stable runtime section with capability/reference/error metadata defaulting to unavailable/not-provided. It must not list, resume, launch, export, migrate, or inspect Pi/Claude conversation history. C owns adapters and D owns launcher presentation/orchestration.

## Existing focused tests and compatibility evidence

| File | Current coverage relevant to B | Required preservation/addition |
|---|---|---|
| `tests/sdd-router.test.ts` | No active change/done; canonical unresolved/pending/conflict/synchronized states; map provenance gate; early-phase task absence; tasks parsing and resume; apply complete/partial/blocked; verify pass/fail; mtime stale/non-stale delivered-file cases; artifact order; legacy `.sdd` aliases/root priority; close readiness. | Preserve router output and legacy fallback. Add projector assertions without changing the router's alphabetical fallback for existing status consumers. |
| `tests/sdd-status-output.test.ts` | Mirrors the Pi status formatter: active list, current/next, artifacts, apply/verify, tasks/budget, blockers, explicit change selection, and no budget blocker for advisory overrun. | Keep status output as the existing compatibility channel; do not duplicate the shared projection into formatted text unless design explicitly selects a minimal integration. |
| `tests/sdd-next-dispatcher.test.ts` | Explicit `resolveSddNext`, missing named change, `--auto` dry-run, unresolved/conflict reason and no implicit change selection in command wiring. | Prove the new projector does not alter `sdd-next` behavior or execute phases. |
| `tests/project-context.test.ts` | EIN scaffold/AUTO generation, curated index/description preservation, missing/directive behavior, missing stamp and `einMdCommitsBehind` undefined. | Add read-only projection cases for absent, blank/incomplete, revision-preserving, and unreadable context; assert no EIN write. |
| `tests/git-baseline.test.ts` | Pure reset parser/renderers, clean/dirty/no-repo, real temporary Git repo, reset warning, stash advisory, preflight baseline compatibility. | Retain old `GitBaseline` object/renderer contracts. Add exact-state tests only through the new seam if it is placed in this module. |
| `tests/harness-discipline.test.ts` | `buildStatusOutput` bootstrap constraints, CI/opt-out behavior, init failure degradation, clean/dirty single-channel output and exactly-once working-tree text. | No CLI change is required by the bounded projector; preserve this channel and add only a compatibility assertion if design exposes the same exact Git reader. |
| `tests/sdd-tdd-phase-boundary.test.ts` and `tests/sdd-phase-runtime-contract.test.ts` | Strict-TDD apply/verify separation, fresh verify plan/no result caching, close gate, phase read-only boundary, and runtime handoff text contracts. | Later apply must add focused Bun tests in RED→GREEN→TRIANGULATE→REFACTOR order; map phase ran none. |

The allowed new suite is `tests/shared-project-state.test.ts` (or equivalent narrowly named suite). It should exercise deterministic repeat equality, source quality, ambiguity, legacy routing, exact Git transitions, freshness binding, runtime privacy, and absence of a competing state file. Tests belong in the same implementation work unit as the projector.

## Smallest implementation seam and proposed blast radius

### Preferred seam for design

1. **New:** `ein-pi/agent/lib/project-state.ts` (or the repo's final equivalent) exports the read-only deterministic projector and public normalized types. It owns no cache, snapshot, database, `.pi` record, or session transcript.
2. **Compose unchanged:** `resolveChangesDir`, `listActiveChanges`, `resolveSddStatus`, `resolveSddNext`, `readEinMd`, `einMdPath`, and the existing status/diagnostic types. The projector handles ambiguity before invoking the router; it does not fork phase parsing.
3. **Git extension decision:** prefer a narrowly named exact reader/fingerprint alongside the existing `git-baseline.ts` seam if design wants one reusable Git command boundary, while leaving `GitBaseline`, `renderGitBaselineLine`, `renderWorkingTreeLine`, and all preflight outputs unchanged. Alternatively, keep exact Git reading private to the new projector if that is materially smaller; design must document why this does not create a second competing Git authority. In either case, the old baseline remains advisory and is not upgraded into the exact-state contract by implication.
4. **New focused tests:** `tests/shared-project-state.test.ts`; only small additions to existing focused suites if a compatibility guarantee cannot be proven in the new suite.
5. **No integration required in B:** do not wire C/D runtime adapters, launcher UI, session operations, or status formatting. Existing `cc-ein-sdd status` remains the single working-tree presentation channel.

### File-level blast-radius table

| Area | Existing consumers | Safe B change | Avoid |
|---|---|---|---|
| `sdd-router.ts` | `ein-ai.ts`, `sdd-close.ts`, CLI, router/status/next tests | Export/compose existing results only; if a tiny diagnostic helper is unavoidable, preserve output fields and route order | Router rewrite, implicit ambiguity selection change, close-gate relaxation, legacy migration |
| `project-context.ts` | `ein-ai.ts`, context tests, EIN writer paths | Read-only diagnostic/reference helper or direct `readEinMd` composition | Calling `writeEinMd`/`syncEinMdIndex`, refreshing revision, replacing curated/AUTO source |
| `git-baseline.ts` | `sdd-preflight.ts`, CLI, Git tests | Add isolated exact reader without changing `GitBaseline` or renderer behavior | Treating dirty boolean/reflog as exact identity; mutating/init/stage/stash/reset |
| `sdd-preflight.ts` | Pi session start and parent prompt | None expected; baseline remains advisory | Making session preflight the projector owner or making resume refresh verify |
| `cc-ein/sdd-cli/cli.ts` | Claude status command and harness tests | None expected; consume future state later in D | Adding a second working-tree channel or changing bootstrap policy |
| `tests/` | Existing Bun contract suites | New focused projection suite and compatibility checks | Running tests/build/typecheck in map; broad fixture/indexing work |

Expected first production work unit is therefore one projector plus its focused contract suite, with at most one narrowly additive exact-Git helper. No existing source must be modified unless design selects a compatibility export or test seam that cannot be expressed from the new module.

## Contract decisions design must pin before apply

1. **Project identity:** selected `cwd` plus `git rev-parse --show-toplevel` when readable; deterministic non-Git identity for a valid working directory; unavailable for missing/unreadable roots; never use a neighboring repository.
2. **Exact Git identity:** stable full HEAD object ID when present; branch symbolic name or detached identity; explicit empty-repository and non-repository states; deterministic index/worktree status representation covering staged, unstaged, tracked, and included untracked paths. Select commands/quoting and hash input explicitly, avoiding locale, timestamps, reflog, stash count, or nondeterministic ordering.
3. **Relevant-surface boundary:** reconcile exact Git identity against the verifier's declared delivered production/tests and the change's relevant files. Decide how untracked files, index changes, test files, deleted/renamed paths, OpenSpec artifacts, and unrelated user dirt affect freshness. Fail closed for a relevant difference; do not use timestamps as the identity.
4. **Legacy report handling:** preserve `VerifyOutcome` and old router `verifyStale` for compatibility, but classify a report lacking an exact binding as unbound/unavailable in the new contract even if it says `status: pass`. Report observed and current state references plus reason.
5. **Source quality:** distinguish absent, unreadable/unavailable, blank/incomplete, ambiguous, known/current, stale, and legacy where possible. Do not turn `readEinMd`'s current missing/read-error collapse into a guessed value.
6. **Ambiguous active work:** no implicit `active[0]` in shared state when multiple active changes lack selection; expose candidates and retain per-change diagnostics if useful. Single active/no active behavior may reuse router semantics.
7. **Runtime defaults:** no provider/session input means `availability: unavailable` or `not-provided` with deterministic metadata; no prompt, transcript, private path, or session-store payload.
8. **Determinism/no persistence:** identical source bytes and Git state produce byte-for-byte equal normalized output. Avoid `Date`, random IDs, mtime in normalized identity, caches, writes, or environment-dependent ordering.

## Strict-TDD handoff

- The map phase is read-only and did not execute tests. Later apply must make the focused projection test fail first, then implement the smallest seam, then triangulate Git/source/freshness/privacy cases, and refactor only after independent evidence. The repository's focused tests import `bun:test`; confirm the final `bun test` command in apply/verify rather than changing `openspec/config.yaml` here.
- Existing strict-TDD contract tests explicitly require fresh independent verify execution, no result/timestamp/file-hash cache substitution, complete RED/GREEN/TRIANGULATE/REFACTOR evidence, and close requiring current passing verify. The projector must not weaken those lifecycle gates.

## Risks and exclusions

- **High:** exact Git inclusion boundary can accidentally make unrelated dirty files stale or, worse, omit relevant untracked/index changes. Design must choose and test this explicitly.
- **High:** adding exact Git fields to `GitBaseline` risks changing preflight/CLI consumers; preserve the existing interface unless a compatibility plan proves additive behavior.
- **Medium:** current `readEinMd` cannot distinguish missing from read failure and its stamp is short SHA/dated; design must expose uncertainty without rewriting EIN.md.
- **Medium:** existing router silently selects alphabetical active change when no name is supplied; only the new projector must fail visibly on ambiguity, not silently alter existing status/next APIs.
- **Medium:** legacy verify reports have no exact binding; treating them as current violates the delta, while treating every historical report as lifecycle failure would overreach. Keep the new freshness status separate and honest.
- **Low:** status output already has a single working-tree channel in `cc-ein/sdd-cli`; adding projector presentation there would expand B into D and duplicate output.

Out of scope remains: adapters, launcher, session lifecycle/history, updater, cleaner/architect, parallelism, installer, persistent state, OpenSpec synchronization, close changes, roadmap/docs cleanup, and all unrelated dirty/deleted files including the existing `EIN.md`.

## Skill applicability

- `ein-discipline`: applied; scope-first SDD boundary, source ownership, strict-TDD handoff, and no implementation in map.
- `cognitive-doc-design`: applied; answer-first conclusion, authority/seam tables, explicit handoff and risks.
- `work-unit-commits`: applied to identify one projector-plus-contract-tests work unit; no commit or source write was made.
- `nuxt`: skipped; no Nuxt route, component, server, or configuration surface is in scope.
- `hono`: skipped; no Hono app, route, middleware, or request surface is in scope.

## Next phase

Recommend `sdd-design`: turn the seam and eight contract decisions above into a bounded type/API design, exact Git command/inclusion algorithm, freshness compatibility rule, focused RED test matrix, and apply work unit without broadening the scope.
