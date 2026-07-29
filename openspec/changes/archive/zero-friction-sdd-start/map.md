# SDD Map — zero-friction-sdd-start

status: partial
scope_status: partial_budget_exceeded
change: zero-friction-sdd-start
phase: map
skill_resolution: paths-injected
budget_source: scope.md
budget:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 600000
budget_exceeded: true

## Scope and context

The map stayed within SDD bootstrap/entry, the manual `sdd-init` command, deterministic status diagnostics, orchestrator inventory/flow instructions, and focused tests. `openspec/config.yaml` was read as authoritative context only and remains out of scope for mutation. Its current `strict_tdd: false` and empty test-runner configuration are important constraints.

The injected `ein-discipline` skill was applied. The injected `architecture` skill was read but no architecture/design choice was made in this map phase.

## Current call paths

### Explicit SDD entry and preflight

1. User text reaches `pi.on("input")` in `ein-pi/agent/extensions/ein-ai.ts`.
2. `isSddPreflightTrigger()` in `ein-pi/agent/lib/sdd-preflight.ts:181-199` recognizes `/sdd…` and explicit English/Spanish SDD requests, rejects questions and negative intent.
3. `runSddPreflight()` in `ein-ai.ts` calls `ensureSddPreflight()`.
4. `ensureSddPreflight()` (`sdd-preflight.ts:521-571`) caches by `sddPreflightSessionKey`, deduplicates in-flight work, collects preferences, snapshots the git baseline, installs global SDD assets, applies model configuration, and caches the result.
5. The `before_agent_start` hook in `ein-ai.ts` repeats that lazy preflight only for a starting SDD agent that lacks cached preferences, then injects the preflight/context/skill directives.

There is no project-local OpenSpec config bootstrap in this path today. Consequently a request can receive preflight assets and preferences but still lack `openspec/config.yaml` before the orchestrator routes scope.

### Manual config bootstrap

`ein-pi/agent/extensions/sdd-init.ts` currently owns both detection and mutation:

- `CONFIG_REL_PATH` is `openspec/config.yaml` (`:21`).
- `walkProject()` has a 20,000-file cap and excluded noisy/dependency directories; `detectProject()` and `renderConfig()` build the detection and YAML.
- `ensureOpenSpecDirs()` creates `openspec/specs` and `openspec/changes/archive` (`~:777`).
- The registered `sdd-init` handler (`:790-825`) first calls `ensureSddPreflight()`, then checks `existsSync(configPath)`. An existing file emits a warning and returns; otherwise it detects, creates directories, and writes `renderConfig(detection)`.

This makes the command preservation behavior correct today, but its write path is private to the extension. Reusing it by importing the extension from `sdd-preflight.ts` would create a cycle because `sdd-init.ts` already imports `ensureSddPreflight`; the reusable bootstrap must be located at a dependency-neutral seam.

### Status resolution and rendering

1. `/ein:sdd-status` (`ein-ai.ts:760-771`) calls `resolveSddStatus(cwd, change)`, `listActiveChanges()`, and `readSddRealCost()`, then renders through `formatSddStatus()`.
2. `resolveSddStatus()` in `ein-pi/agent/lib/sdd-router.ts:361-452` discovers artifacts, parses apply/verify/tasks/budget state, sets the first missing phase as `nextRecommended`, and creates `blocked` only for apply/verify failures and a blocked `tasks.md` with `blocked_by`.
3. `readTasksStatus()` (`:252-287`) currently returns `tasks.md ausente.` in `tasks.problems` whenever the file is absent, regardless of current phase.
4. `formatSddStatus()` (`ein-ai.ts:237-265`) always concatenates `tasks.problems` and `budget.problems` beneath the visible blockers heading. `resolveSddNext()` also includes `tasks.problems` in its `blocked` report (`sdd-router.ts:455-487`).

Therefore, for a change in scope, map, or design, routing correctly recommends the current next phase, but the status output and next-step reason still make the future `tasks.md` absence look actionable. The phase-relative rule belongs at the diagnostic/actionability boundary; it must not globally suppress parsing or genuine malformed/blocked tasks diagnostics once tasks are actionable.

## Exact change surface and blast radius

| File | Symbols / area | Why it is in scope and affected callers |
| --- | --- | --- |
| `ein-pi/agent/extensions/sdd-init.ts` | `CONFIG_REL_PATH`, `walkProject`, `detectProject`, `renderConfig`, `ensureOpenSpecDirs`, default command handler | Extract the existing safe create-if-absent operation while preserving command output and the current detector. Direct manual command compatibility depends on this file. |
| `ein-pi/agent/lib/sdd-preflight.ts` | `isSddPreflightTrigger`, `ensureSddPreflight`, `getSddPreflightPreferences`, session/in-flight maps | The explicit entry and SDD-agent fallback are the two preflight routes. `ensureSddPreflight` has three known callers (the two extensions); bootstrap must run once per request/session without turning later phase gates automatic. |
| `ein-pi/agent/extensions/ein-ai.ts` | `runSddPreflight`, `input`, `before_agent_start` hooks, `formatSddStatus`, `ein:sdd-status` handler | Wires explicit user intent to preflight and agent startup, injects phase instructions, and renders diagnostics. It is the likely integration point for project-local bootstrap and any status presentation change. |
| `ein-pi/agent/lib/sdd-router.ts` | `SddPhase`, `readTasksStatus`, `artifactLists`, `resolveSddStatus`, `resolveSddNext` | Deterministic source of phase/actionability. `resolveSddStatus` has nine known callers; behavior changes propagate to `/ein:sdd-status`, `/ein:sdd-next`, summaries, and deterministic SDD routing. |
| `ein-pi/agent/assets/orchestrator.md` | authoritative Subagent Inventory row `sdd-scope` at line 17; SDD Flow, Scope Gate, Lazy preflight, interactive execution sections | The row already exists and must remain unchanged. The flow text currently says missing config should be asked for or run through preflight; startup instructions must align with automatic idempotent bootstrap and still explicitly retain phase-by-phase interactive gates. |
| `tests/sdd-router.test.ts` | `resolveSddStatus` fixture tests | Main behavior coverage for phase selection, absent tasks, task parsing/blocking, apply and verify gates. It directly contains the obsolete expectation that scope-only state reports `tasks.md ausente.` as a problem. |
| `tests/sdd-status-output.test.ts` | local `formatSddStatus` replica and output assertions | Covers user-visible blocker rendering, but duplicates the formatter and must be kept synchronized if diagnostic semantics/output change. |
| `tests/sdd-flow-contract.test.ts` | static orchestrator and command-registration contract | Protects phase flow and `/ein:sdd-status` command presence. It should be extended only for precise flow/inventory assertions needed by this scope. |
| `tests/sdd-preflight-tdd-gate.test.ts` | `renderSddPreflightPrompt` behavior | Existing preflight coverage is limited to TDD prompt inclusion; it does not cover bootstrap. |

## Invariants to preserve

- Existing `openspec/config.yaml` is an opaque user artifact: existence means no regeneration, merging, or byte change.
- The manual `/sdd-init` command remains registered and uses the same creation behavior as automatic startup.
- Preflight remains session-cached and in-flight deduplicated; adding config bootstrap must not cause duplicate scans/writes in input plus `before_agent_start`.
- Automatic behavior removes only manual initialization. It must enter `sdd-scope` for an explicit SDD request, not silently progress through map, design, tasks, apply, or verify; interactive phase confirmations remain controlled by the existing orchestrator flow.
- The authoritative `sdd-scope` inventory row already exists (`orchestrator.md:17`); do not add, remove, or rewrite it.
- `SddPhase` ordering and the fail-closed apply/verify gates remain intact. `apply-progress.md` without `status: complete`, `status: blocked`, verify failures, and actionable blocked tasks must still surface.
- Phase-relative diagnostics classify an absent future artifact as pending/future rather than a blocker; they do not hide malformed or blocked `tasks.md` when the phase is tasks or later.

## Existing coverage and focused gaps

- `tests/sdd-router.test.ts` already covers no change, scope→map, design→tasks, tasks parsing and `blocked_by`, apply partial/blocked/complete, verify pass/fail, artifacts, budgets, and legacy `.sdd` compatibility. It does **not** distinguish future absent tasks from actionable absent/malformed tasks.
- `tests/sdd-status-output.test.ts` covers status labels, standard blockers, active-change selection, task counts, and budgets. It lacks a scope-phase assertion that the user-facing blocker section omits `tasks.md absent`.
- No discovered test imports or invokes `sdd-init`; no focused test presently proves missing-config creation or existing-config byte preservation.
- `tests/sdd-preflight-tdd-gate.test.ts` only tests prompt wording. No test covers the explicit input/bootstrap path or `before_agent_start` fallback.
- The suite convention is Bun (`bun:test` imports across the focused tests), but `openspec/config.yaml` intentionally records no reliable test command and `installer/package.json` only supplies `typecheck`. Implementation must establish the existing focused invocation convention without changing package managers or config merely to record it.

## Risks

1. **Import cycle / duplicated detector:** directly sharing from the current extension into preflight risks `sdd-init → sdd-preflight → sdd-init`; duplicating detector/rendering logic instead risks configuration drift. Extract at the current pure helper seam.
2. **Accidental overwrite:** any bootstrap API that treats automatic startup differently from `/sdd-init` can violate byte-for-byte preservation. Test raw existing content, not parsed YAML equivalence.
3. **Double startup work:** both `input` and `before_agent_start` may run in one requested flow. Bootstrap needs its own idempotence in addition to the existing preflight cache.
4. **Over-broad status filtering:** deleting absent-task problems globally would hide actionable tasks-phase failures and alter `resolveSddNext` semantics. Gate diagnostics by current/next phase.
5. **Flow regression:** making startup continue to scope must not turn the orchestrator's later interactive confirmations into auto execution.
6. **Working-tree boundary:** the already-applied inventory row is unrelated pre-existing work. Do not rewrite or revert it while aligning the surrounding flow text.

## Mapping conclusion

The bounded implementation surface is clear: a dependency-neutral reusable OpenSpec bootstrap shared by `sdd-init` and SDD preflight/entry, deterministic phase-aware task diagnostics in `sdd-router` (with presentation checked through `ein-ai`), a narrowly aligned orchestrator entry-flow update that preserves its existing `sdd-scope` row and phase gates, and focused Bun tests for creation/preservation plus phase-relative status.

## Ledger

ledger:
  reads:
    - path: /home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md
      lines: 101
      estimated_tokens: 1450
    - path: /home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md
      lines: 94
      estimated_tokens: 1500
    - path: openspec/changes/zero-friction-sdd-start/scope.md
      lines: 77
      estimated_tokens: 1050
    - path: openspec/config.yaml
      lines: 51
      estimated_tokens: 700
    - path: codegraph explore: SDD startup/preflight/config bootstrap/status inventory
      lines: 173
      estimated_tokens: 1900
    - path: grep: ein-pi/agent/assets (sdd-scope|sdd-init|sdd-status)
      lines: 2
      estimated_tokens: 120
    - path: grep: tests (SDD bootstrap/status symbols)
      lines: 29
      estimated_tokens: 850
    - path: grep: ein-pi/agent (sdd-init|sdd-status)
      lines: 37
      estimated_tokens: 1200
    - path: grep: ein-pi (orchestrator)
      lines: 31
      estimated_tokens: 1000
    - path: codegraph explore: init/preflight/status/tests
      lines: 126
      estimated_tokens: 1500
    - path: codegraph explore: exact init/start/status symbols
      lines: 157
      estimated_tokens: 2000
    - path: codegraph explore: status task parsing and tests
      lines: 249
      estimated_tokens: 2800
    - path: codegraph explore: config writer and startup hooks
      lines: 225
      estimated_tokens: 2100
    - path: ein-pi/agent/extensions/sdd-init.ts (1-220, 760-834)
      lines: 295
      estimated_tokens: 4000
    - path: ein-pi/agent/extensions/ein-ai.ts (1-150, 310-459, 740-819)
      lines: 370
      estimated_tokens: 4800
    - path: ein-pi/agent/lib/sdd-preflight.ts (510-584)
      lines: 75
      estimated_tokens: 1050
    - path: tests/sdd-router.test.ts
      lines: 211
      estimated_tokens: 2850
    - path: tests/sdd-status-output.test.ts
      lines: 199
      estimated_tokens: 2750
    - path: ein-pi/agent/assets/orchestrator.md (1-120)
      lines: 120
      estimated_tokens: 3300
    - path: tests/sdd-flow-contract.test.ts
      lines: 100
      estimated_tokens: 1400
    - path: tests/sdd-preflight-tdd-gate.test.ts
      lines: 49
      estimated_tokens: 620
    - path: installer/package.json
      lines: 20
      estimated_tokens: 250
    - path: codegraph explore: isSddPreflightTrigger and callers
      lines: 230
      estimated_tokens: 2500
    - path: grep: assets/chains (ein-sdd|sdd-scope)
      lines: 0
      estimated_tokens: 0
    - path: grep: tests (sdd-init)
      lines: 0
      estimated_tokens: 0
    - path: grep: tests (ensureSddPreflight|isSddPreflightTrigger|runSddPreflight)
      lines: 0
      estimated_tokens: 0
  webfetch_used: false
  budget_consumed:
    tokens: 39390
    reads: 26

Budget was exceeded by verbose codegraph/source output before mapping concluded; exploration stopped immediately afterward. The mapped surface is sufficient for a bounded design, but the phase is honestly marked partial under the executor budget contract.
