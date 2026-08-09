status: partial
scope_status: bounded
change: minimal-workbench-launcher
phase: map
budget:
  max_tokens: 15000
  max_reads: 30
  budget_source: scope.md
budget_exceeded: true

# Map — minimal-workbench-launcher

## 000. Executive map

The smallest safe slice is a new, separate workbench entrypoint plus a pure orchestration module. It should receive a bounded candidate list/project roots, project each candidate through the existing `ProjectStateV1` projector, require explicit confirmation, then route only through the normalized runtime-adapter boundary. It must not become an installer-menu branch, a project/session store, or a second status projector.

Recommended ownership split for design:

- **New orchestration seam:** `ein-pi/agent/lib/workbench.ts` (pure flow/state machine; injected input, projector, adapters, doctor delegate, and process/input boundary).
- **New separate entrypoint:** `ein-pi/workbench.ts` (thin CLI adapter; no installer lifecycle logic). Exact package/bin packaging is currently absent from `installer/package.json`; design must choose the smallest dedicated launcher wiring without turning `installer/src/main.ts` into workbench ownership.
- **Existing contracts consumed:** `ein-pi/agent/lib/project-state.ts`, `ein-pi/agent/lib/runtime-session-adapters.ts`, `ein-pi/agent/lib/sessions.ts`, `ein-pi/agent/extensions/ein-doctor.ts`, and the existing language/output helpers.
- **Focused new test seam:** `tests/minimal-workbench-launcher.test.ts`, testing the pure orchestration with fakes; preserve the predecessor contract tests unchanged.

This map is partial because the 30-read cap was reached while the two newly delivered source files were pending the codegraph index. Runtime adapter source was read directly; `project-state.ts` exact export signatures should be re-read in design before implementation. The archived B/C summaries and current adapter imports establish the contract and ownership boundaries below.

## 001. Canonical SDD/spec references

- Scope and persisted delta: `openspec/changes/minimal-workbench-launcher/scope.md`.
- Active behavior declaration: `openspec/changes/minimal-workbench-launcher/specs/sdd-lifecycle/spec.md`.
- Canonical domain spec: `openspec/specs/sdd-lifecycle/spec.md`.
- Predecessor B: `openspec/changes/archive/shared-project-state-contract/summary.md` and its `design.md`.
- Predecessor C: `openspec/changes/archive/runtime-session-adapters/summary.md` and its `design.md`.

The five active scenarios are the authoritative behavior delta: capability-aware sessions, compact doctor, project/runtime flow, safe runtime launch, and state freshness. Strict TDD is enabled in scope/config; this phase does not run tests or typecheck.

## 002. Exact runtime-adapter contract (read directly)

Source: `ein-pi/agent/lib/runtime-session-adapters.ts`.

### Public types/constants

- `RuntimeProvider = "pi" | "claude"`.
- `RuntimeOperation = "list" | "create" | "resume" | "launch"`.
- `AdapterOutcome = "success" | "unsupported" | "unavailable" | "error" | "cancelled"`.
- `AdapterErrorCode` is closed and privacy-safe (`invalid-request`, `project-mismatch`, `operation-not-supported`, `reference-invalid`, `executable-unavailable`, `spawn-failed`, `process-exit`, etc.). The workbench renders codes/normalized diagnostics, never provider output.
- `ProjectBinding` carries only `schemaVersion`, normalized `cwd`, optional `repositoryRoot`, and optional Git `stateRef`.
- `SessionMetadata = { reference, modifiedAtMs }`; references are opaque provider-scoped values.
- `AdapterResult<T> = AdapterSuccess<T> | AdapterFailure`; success carries provider, operation, outcome, project, data; failure carries normalized outcome/project/error.
- `RuntimeCapabilityDescriptor` and `RuntimeCapabilityMatrix` describe provider/operation support; use `RUNTIME_CAPABILITY_MATRIX` and `getRuntimeCapabilities`, never a shared-method inference.
- `LaunchIntent` is discriminated (`mode: "create"` or `"resume"`); resume requires a reference.
- `LaunchPlan` is adapter-owned: provider, `mode: "create"`, validated project, fixed executable, empty argv, selected cwd, isolated env, `shell: false`.
- Process seam: `LaunchExecutorInput`, `LaunchExecutorResult`, `LaunchExecutor`, `LaunchExecutionOptions`, and `LaunchResult`.

### Public functions/factories

- `projectBindingFromState(state)` — derive the public binding; do not copy the full state into runtime code.
- `validateProjectState(state, operation, expectedProject?)` — fail closed before provider reads/launches.
- `validateOpaqueReference(provider, reference)` / alias `isOpaqueReference`.
- `listPiProjectSessions(project, options?)` — bounded Pi metadata reader composed from `scanProjectSessions`.
- `listSessionRequest(providerOrRequest, state?, options?, request?)` — common list surface; Claude is explicit unsupported.
- `createSessionRequest(providerOrRequest, state?, request?)` — request-only intent; no persisted session claim.
- `resumeSessionRequest(providerOrRequest, state?, referenceOrIntent?, request?)` — validates same-provider opaque reference and project binding, then currently fails closed as unsupported for both providers.
- `getRuntimeCapabilities(provider)`; `createPiSessionAdapter()`, `createClaudeSessionAdapter()`, `createRuntimeSessionAdapter(provider)`.
- `toProjectRuntimeMetadata(result)` — one-way adapter observation translation; it does not project, persist, or refresh project state.
- `resolveLaunchExecutable(provider, options?)` — adapter-owned trusted executable resolution.
- `buildLaunchPlan(first, second?, third?)` — validates state/intent and returns fixed non-shell plan or normalized failure.
- `normalizeLaunchSignal(value)`, `normalizeLaunchExitCode(value)`, `normalizeLaunchExecution(value)`.
- `executeLaunchPlan(plan, executorOrOptions?, signal?)` — validates the plan and executes through injectable non-shell process boundary; returns normalized success/failure/cancelled.

### Capability matrix (must remain visible in UI)

| Provider | list | create | resume | launch |
|---|---|---|---|---|
| Pi | supported | supported, `requestOnly` | unsupported | supported |
| Claude | unsupported | supported, `requestOnly` | unsupported | supported |

A supported launch may still return `unavailable` when executable/home/isolation inputs are absent. Never show resume flags, infer a Claude listing, or fall back from one provider to another.

### Launch/privacy rules

The workbench passes the confirmed project binding and provider to `createSessionRequest`/`buildLaunchPlan`. It then hands only the validated plan to `executeLaunchPlan`. It must not accept or construct command strings, argv, shell fragments, guessed resume flags, raw IDs, paths, transcripts, or private runtime output. The adapter fixes `argv: []`, `shell: false`, `cwd` to the validated project, and provider isolation (`PI_CODING_AGENT_DIR`/`EIN_PI_AGENT_HOME` or `CLAUDE_CONFIG_DIR`/`PATH`).

## 003. ProjectStateV1 boundary

Source: `ein-pi/agent/lib/project-state.ts` (B predecessor) and `openspec/changes/archive/shared-project-state-contract/summary.md`.

The workbench must consume the existing projector result, not recreate any of these rules:

- project identity and repository boundary;
- OpenSpec status, active phase, next recommendation, and source quality/reason;
- Git repository/state reference and completeness;
- verification status, freshness, and source reason;
- runtime metadata (only as supplied by adapter translation).

B guarantees a deterministic read-only projection, no cache/database/persistence, explicit ambiguity, invalid/unreadable OpenSpec degradation, conservative Git fingerprinting, and verification `current` only when the bound pass evidence matches the exact Git reference and is not stale. Legacy/unbound evidence must remain non-current. The presentation layer should retain the projector's quality/reason values and distinguish current, incomplete, ambiguous, unavailable, invalid, stale, absent, and other non-current states rather than flattening them into a green/unknown status.

**Design re-read required:** confirm the exact exported projector function and the precise `ProjectStateV1` field names from `project-state.ts` before writing code. The adapter's type-only imports confirm `ProjectRuntimeMetadata`, `ProjectStateReasonCode`, and `ProjectStateV1`; `ProjectBinding` deliberately reads only `schemaVersion`, `identity.cwd`, `identity.repositoryRoot`, and `git.stateRef`.

## 004. Existing CLI, menu, process, and output conventions

### Installer boundary (do not absorb)

- `installer/src/main.ts` is the installer CLI router. It owns `install`, `update`, `uninstall`, `restore`, `doctor`, version/internal updater entries, and no-argument TUI dispatch.
- `installer/src/cli/menu.ts` is the installer lifecycle menu: `runMenu(options?)`, injected `actionPrompt`, `runtimePrompt`, `runInstall`, `playBanner`, and `isCancel`; it guards non-TTY stdin and routes only installer actions.
- `installer/src/cli/doctor.ts` exposes `runDoctorCommand()` and `renderReport(report)`. It delegates to `detectPlatform` + `runDoctor`, emits `/// DOCTOR EIN`, bounded check levels, and returns `0` for OK/WARN or `1` for FAIL.
- `installer/package.json` has Bun `dev`, bundle, build, and `typecheck` scripts but no `bin` field. This is an important packaging seam: a workbench entrypoint must be separately wired, not silently added to the installer TUI or made an installer lifecycle owner.

Do not import installer install/update/repair logic into the workbench. For doctor, delegate to the established read-only `ein_pi_doctor`/`ein-doctor.ts` contract (or a thin existing entrypoint adapter) and return to the workbench with a bounded result; do not call installer repair flows.

### Pi and interactive input

- Existing Pi extensions register commands through `pi.registerCommand(name, { description, handler })` and use `ctx.cwd`, `ctx.ui.select`, and `ctx.ui.notify`; `ein-ai.ts` uses compact `/// 000. SDD STATUS`/`SDD NEXT` formatting plus `t`/`tf` localization helpers.
- Existing installer prompts use `@clack/prompts` (`p.select`, `p.confirm`, `p.isCancel`) and explicitly treat cancellation as a first-class outcome. Reuse the behavioral convention through an injected workbench input abstraction; do not add a UI package or couple the new workbench to installer lifecycle code.
- Process execution convention relevant to this slice is not generic `installer/src/core/exec.ts`: use the adapter's `LaunchExecutor` and `executeLaunchPlan` boundary so input, cwd, env, argv, shell, abort, and normalized process results stay controlled.

### Output/localization

- Reuse `ein-pi/agent/lib/lang.ts` (`pick`/chat-language selection) and `ein-pi/agent/lib/i18n/strings.ts` (`t`/`tf`) where the new CLI can depend on them; do not invent a second localization store.
- Keep output compact and numbered/sectioned in the established Ein style (`/// 000. ...`), showing safe project identity and provider context. Use stable labels for `unsupported`, `unavailable`, `cancelled`, `error`, stale/non-current evidence, and actionable doctor unavailability. Never print private paths, raw IDs, transcript content, or raw process errors.
- Existing brand/theme helpers (`ein-brand.ts`, installer `tui/theme.ts`) are presentation references only; a separate entrypoint should not acquire a new UI dependency.

## 005. Supported command flow

1. **Enter:** thin separate workbench entrypoint accepts bounded project candidate input (current project and/or explicit project roots); no project/session index or persisted selection.
2. **Discover/project:** run the existing `ProjectStateV1` projector for each candidate through an injected projector boundary. Reject invalid/unavailable candidates explicitly; do not silently select alphabetically or synthesize state.
3. **Select + confirm:** render safe identity (cwd/project/repository context) and summary; require explicit selection and confirmation before runtime/session actions. Keep the confirmed `ProjectStateV1` snapshot and derived `ProjectBinding` together for the rest of this flow.
4. **Summary:** show status context, known phase and next, source quality/reason, verification freshness/reason, and non-current labels. Refreshing/reprojecting is not a launcher-owned mutation; if state must be refreshed, start a new confirmed flow.
5. **Runtime select:** show exactly Pi and Claude. Read capabilities from `getRuntimeCapabilities`/`RUNTIME_CAPABILITY_MATRIX` and render unavailable/unsupported cells rather than parity assumptions.
6. **Session choice:**
   - list only when `list` is supported (currently Pi); use `listSessionRequest` and display only opaque references/recency metadata;
   - create for supported providers via `createSessionRequest`; label request-only and do not claim persistence;
   - resume only when capability and adapter validation allow it; current matrix/C behavior is fail-closed unsupported for both, so do not offer an executable resume action;
   - normalize every adapter result into safe output; cancelled/unavailable/error return to bounded menu or stop with an actionable message.
7. **Launch:** pass the confirmed state + create intent to `buildLaunchPlan`; on success call `executeLaunchPlan` with the injected executor/signal. Report only normalized launch result and preserve return/control flow.
8. **Doctor:** invoke the existing read-only doctor delegate as a compact action at any bounded menu point; show its safe report or an actionable unavailable result, then return to the workbench. No install/update/repair.
9. **Exit:** end without writing project, installer, updater, session, cache, transcript, or runtime state.

## 006. Input/process abstractions to design around

Keep the orchestration testable without TTY or real runtimes. Suggested injected seams (types to be designed, not implementation here):

- candidate provider: bounded `ProjectCandidate[]` or project-root resolver;
- projector: `(cwd) => ProjectStateV1`/normalized unavailable result;
- input: `select`, `confirm`, and cancellation result (mirrors `ctx.ui.select`/Clack semantics);
- renderer/output sink: text lines/notifications, no direct process output in the core;
- adapter registry: Pi/Claude `RuntimeSessionAdapter` objects plus capability descriptors;
- launch: `buildLaunchPlan` + `executeLaunchPlan` with `LaunchExecutor` fake in tests;
- doctor: read-only delegate returning bounded status/text, never installer mutation functions.

Use `AbortSignal`/cancellation consistently through launch and menu boundaries. Non-TTY behavior should be an explicit bounded diagnostic, not a hanging prompt; this mirrors `runMenu`'s guard but remains owned by the new entrypoint.

## 007. Exact files: read/consume vs new/touch candidates

### Read/consume, do not reopen ownership

| File | Why |
|---|---|
| `ein-pi/agent/lib/project-state.ts` | B `ProjectStateV1` projector and quality/freshness contract; exact function signature needs design re-read. |
| `ein-pi/agent/lib/runtime-session-adapters.ts` | C common adapter, matrix, validation, safe plan/executor. |
| `ein-pi/agent/lib/sessions.ts` | bounded `scanProjectSessions`; no direct transcript/session-store access from workbench. |
| `ein-pi/agent/extensions/ein-doctor.ts` | existing Pi/doctor tool/entrypoint delegation surface. |
| `ein-pi/agent/extensions/ein-ai.ts` | Pi command, status formatting, localization, and compatibility conventions. |
| `ein-pi/agent/lib/lang.ts` and `ein-pi/agent/lib/i18n/strings.ts` | output/localization helpers. |
| `installer/src/cli/menu.ts`, `installer/src/cli/doctor.ts`, `installer/src/main.ts` | installer routing/menu/doctor conventions and hard ownership boundary; do not extend TUI. |
| `installer/package.json` | confirms no existing bin declaration for a workbench. |
| `openspec/changes/archive/shared-project-state-contract/{summary,design}.md` | B guarantees and non-goals. |
| `openspec/changes/archive/runtime-session-adapters/{summary,design}.md` | C guarantees and known resume limitation. |
| `tests/shared-project-state.test.ts` | focused B projector/privacy/freshness seam. |
| `tests/runtime-session-adapters.test.ts` | focused C capability/binding/privacy/launch seam. |
| `tests/sessions.test.ts` | bounded Pi session scan/metadata seam. |

### Smallest new/touch set proposed for design

1. `ein-pi/agent/lib/workbench.ts` — pure orchestration and safe view-model/result normalization.
2. `ein-pi/workbench.ts` — separate thin CLI entrypoint and input/output adapter.
3. `tests/minimal-workbench-launcher.test.ts` — strict-TDD tests for flow, confirmation, capability branches, privacy, doctor return, and launch boundary.
4. One dedicated package/bin/release wiring file only if required by the existing distribution path; do not modify installer lifecycle ownership. The absence of a current `bin` declaration is an explicit design decision/blocker, not permission to add workbench code to `installer/src/cli/menu.ts`.

## 008. Focused test seams and behavior matrix

| Behavior | Test seam | Required assertion |
|---|---|---|
| candidate selection | injected candidates/projector/input | explicit confirmation gates runtime actions; selected identity is retained |
| state display | fixture `ProjectStateV1` variants | phase/next/reason/freshness preserved; stale/ambiguous/absent not promoted |
| capability branches | fake Pi/Claude adapters or matrix | Pi list only; Claude list unsupported; create request-only; resume unsupported both |
| adapter result rendering | normalized result fixtures | unsupported/unavailable/cancelled/error explicit; no private fields/raw output |
| safe launch | fake `LaunchExecutor` + real `buildLaunchPlan` | confirmed project/provider bound; empty argv; shell false; no guessed resume; executor receives only validated plan |
| launch failures | executor returns exit/signal/invalid/throws/cancel | normalized result only; no raw process details; cancellation returns safely |
| doctor | injected read-only delegate | compact result/actionable unavailable; control returns; no installer calls |
| non-TTY/cancel | input abstraction | bounded exit, no hang, no mutation |
| no writes | temp project/installer/runtime fixture | project, installer, updater, sessions, caches, transcripts unchanged |

Predecessor suites remain the contract evidence: `shared-project-state.test.ts` covers B state quality/freshness/privacy and `runtime-session-adapters.test.ts` covers C capabilities, project binding, privacy, unsupported resume, launch safety, and no-write behavior. The new suite should test orchestration only and avoid duplicating their internals.

## 009. Blast radius and risks

- **Production blast radius:** primarily two new workbench files plus one focused test; adapter/project-state/installer files should be read-only dependencies. Package/release wiring is the only possible extra production surface and must be independently justified.
- **High risk — stale index/signatures:** `project-state.ts` was not returned by the current codegraph query because it is pending index state; design must read the file directly before naming projector APIs.
- **High risk — installer ownership drift:** importing installer menu/install/update/repair into the workbench would make the installer a second owner or expand its TUI. Keep doctor delegation read-only and separate.
- **High risk — privacy:** never leak cwd/path/session id/transcript/raw runtime output beyond the safe display policy; `SessionMetadata.reference` is opaque but should still be rendered only as a bounded reference label.
- **Medium risk — distribution:** `installer/package.json` has no `bin`; a dedicated entrypoint needs a minimal packaging decision without altering installer lifecycle code.
- **Medium risk — capability asymmetry:** matrix is evidence-driven and intentionally non-parity; UI must show unsupported rather than hide or infer.

## 010. Next phase handoff

`sdd-design` should first re-read `ein-pi/agent/lib/project-state.ts` and the active delta/design references, settle the exact projector export and separate binary wiring, then define the pure orchestration interfaces and strict-TDD task groups. No source implementation belongs in map.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/minimal-workbench-launcher/scope.md", lines: 140, estimated_tokens: 2400 }
    - { path: "openspec/specs/sdd-lifecycle/spec.md (grep: runtime-adapter)", lines: "201-233", estimated_tokens: 550 }
    - { path: "openspec/changes/archive/shared-project-state-contract/summary.md", lines: 42, estimated_tokens: 900 }
    - { path: "openspec/changes/archive/runtime-session-adapters/summary.md", lines: 38, estimated_tokens: 800 }
    - { path: "installer/package.json", lines: 22, estimated_tokens: 170 }
    - { path: "installer/src/main.ts", lines: 116, estimated_tokens: 850 }
    - { path: "installer/src/cli/menu.ts (codegraph)", lines: "1-100", estimated_tokens: 620 }
    - { path: "installer/src/cli/doctor.ts (codegraph)", lines: "1-57", estimated_tokens: 380 }
    - { path: "ein-pi/agent/lib/runtime-session-adapters.ts", lines: 657, estimated_tokens: 7100 }
    - { path: "ein-pi/agent/lib/sessions.ts (codegraph)", lines: "1-191", estimated_tokens: 1300 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts (codegraph)", lines: "9-114, 415-493", estimated_tokens: 1100 }
    - { path: "ein-pi/agent/extensions/ein-doctor.ts (codegraph query)", lines: "symbol search", estimated_tokens: 500 }
    - { path: "ein-pi/agent/lib/project-state.ts (codegraph query; pending index)", lines: "unresolved", estimated_tokens: 400 }
    - { path: "tests/sessions.test.ts (codegraph)", lines: "1-127", estimated_tokens: 850 }
    - { path: "tests/shared-project-state.test.ts (scope/archive reference)", lines: "focused contract", estimated_tokens: 250 }
    - { path: "tests/runtime-session-adapters.test.ts (scope/archive reference)", lines: "focused contract", estimated_tokens: 250 }
  webfetch_used: false
  budget_consumed:
    tokens: 15000
    reads: 30

skill_resolution: paths-injected
