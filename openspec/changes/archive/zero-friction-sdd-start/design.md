# Design — zero-friction SDD start

## A. Proposal

### Intent

Make an explicitly requested SDD prepare OpenSpec automatically when configuration is absent, then continue into `sdd-scope` in the same flow. At the same time, make status diagnostics distinguish future pending artifacts from actionable phase failures.

### Scope

In scope:

- Extract the existing OpenSpec config detection, rendering, directory preparation, and create-if-absent behavior behind a dependency-neutral reusable module.
- Use that module from both the manual `/sdd-init` handler and the explicit SDD startup path.
- Preserve the original request after startup preparation so the orchestrator can delegate `sdd-scope` immediately.
- Make task diagnostics phase-relative while preserving task, apply, and verify failure signals.
- Align the orchestrator startup wording and focused Bun tests with this behavior.

### Non-goals

- Read-only assessment mode, token optimization, or Engram changes.
- Automatic progression from scope through later SDD phases.
- Phase/artifact renaming or a broad redesign of `/ein:sdd-next`.
- Changes to project detection semantics, generated config schema, package manager, or `openspec/config.yaml` test-runner settings.
- Rewriting or re-adding the already-present `sdd-scope` inventory row.

### Affected areas

| Area | Intended change |
| --- | --- |
| `ein-pi/agent/lib/` | Add a neutral OpenSpec config-bootstrap module containing the current detection/rendering logic and one create-if-absent entry point. |
| `ein-pi/agent/extensions/sdd-init.ts` | Keep command registration and notifications; delegate config creation to the shared module. |
| `ein-pi/agent/extensions/ein-ai.ts` | Compose shared bootstrap after SDD preflight and before returning control to the original request. |
| `ein-pi/agent/lib/sdd-router.ts` | Classify absent `tasks.md` as non-actionable while scope, map, or design is current; retain actionable diagnostics. |
| `ein-pi/agent/assets/orchestrator.md` | Describe automatic startup bootstrap and immediate scope entry without changing later phase gates or the existing inventory row. |
| `tests/` | Add focused bootstrap/startup coverage and extend router, status-output, and flow-contract coverage. |

### Invariants

- An existing `openspec/config.yaml` is opaque user data and MUST NOT be read-modify-written, merged, normalized, truncated, or otherwise changed.
- Config creation is idempotent: existence means preserve; absence permits one generated creation.
- Dependency direction remains `sdd-init.ts → shared bootstrap` and `ein-ai.ts → shared bootstrap`; the shared module MUST NOT import either extension or `sdd-preflight.ts`.
- Preflight session caching and in-flight deduplication remain intact.
- Automatic bootstrap removes only initialization friction. Scope, map, design, tasks, apply, verify, and close remain distinct phases.
- Interactive confirmation remains between completed SDD phases. Bootstrap is startup preparation, not a phase transition requiring confirmation.
- `SddPhase` ordering and fail-closed apply/verify gates remain unchanged.
- The authoritative `sdd-scope` inventory row already present in `orchestrator.md` is baseline content and remains exactly one valid row.

### Compatibility constraints

- `/sdd-init` remains registered, keeps its create/preserve behavior, and continues to report whether it wrote a config or found one already present.
- New config content continues to be produced by the existing detector and renderer; extraction alone does not alter the YAML contract.
- Existing config preservation applies to both manual initialization and automatic startup, including repeated and overlapping calls.
- `/ein:sdd-status`, `ein_sdd_status`, and `/ein:sdd-next` consume the same phase-relative diagnostic semantics.
- Legacy `.sdd/changes/` routing remains supported.
- Bun remains the test runtime; no package-manager or dependency change is introduced.

### Risks

- Moving the large detector/renderer surface could accidentally change generated YAML.
- A check-then-write race could let overlapping startup paths overwrite a config created between those operations.
- Returning early after bootstrap could consume the original request instead of reaching `sdd-scope`.
- Filtering all task problems, rather than only future absence, could hide malformed or blocked tasks.
- Editing orchestrator startup guidance could unintentionally weaken real interactive phase gates or disturb the pre-existing inventory row.

### Rollback

Revert the shared-module extraction, startup call, phase-relative filtering, orchestrator wording, and focused tests as one behavioral change. No config migration is required; rollback MUST leave every existing or automatically created `openspec/config.yaml` in place rather than deleting potentially user-owned data.

### Success criteria

- A missing config is created during an explicit SDD startup and the same request remains eligible to enter `sdd-scope`.
- An existing config has identical raw bytes before and after manual or automatic bootstrap.
- `/sdd-init` remains usable and delegates to the shared bootstrap behavior.
- Scope, map, and design status do not present absent `tasks.md` as a blocker.
- Actionable missing/malformed/blocked tasks, incomplete apply, and failed or unknown verify outcomes remain visible at their applicable phases.
- Later interactive gates and the existing `sdd-scope` inventory row remain intact.

## B. Spec

### R1. Reusable config bootstrap

The system MUST expose one dependency-neutral OpenSpec config-bootstrap boundary used by both `/sdd-init` and SDD startup, and it MUST NOT introduce an import cycle between `sdd-init.ts` and `sdd-preflight.ts`.

**Scenario**

- **Given** the manual command and SDD startup both need OpenSpec configuration
- **When** either path performs bootstrap
- **Then** both call the same create-if-absent boundary and neither imports the other extension

### R2. Existing config preservation

The system MUST preserve an existing `openspec/config.yaml` byte-for-byte and MUST treat its existence as a successful no-op rather than regenerating or merging it.

**Scenario**

- **Given** `openspec/config.yaml` contains user formatting, comments, or line endings
- **When** manual initialization, automatic startup, or a repeated bootstrap runs
- **Then** the file's raw bytes are identical to their pre-bootstrap value

### R3. Safe missing-config creation

When `openspec/config.yaml` is absent, the system MUST create the required OpenSpec directories and config using the existing project detector and renderer. Concurrent or repeated calls MUST use create-only semantics so a config that appears during bootstrap is preserved.

**Scenario**

- **Given** an explicit SDD request in a project without OpenSpec configuration
- **When** startup bootstrap runs
- **Then** one generated config exists, required OpenSpec directories exist, and no later call overwrites that config

### R4. Same-flow scope continuation

After successful creation or preservation, explicit SDD startup MUST return control to the original request so the orchestrator can delegate `sdd-scope` in the same flow. It MUST NOT require `/sdd-init`, a repeated SDD command, or a separate bootstrap confirmation.

**Scenario**

- **Given** the user explicitly requests a new SDD and configuration is missing
- **When** preflight and bootstrap complete
- **Then** startup continues with the original request and `sdd-scope` is the first SDD phase

### R5. Manual command compatibility

The system MUST retain `/sdd-init` and its user-visible distinction between a newly written config and an already existing config. The command SHOULD preserve its current detection summary when it creates a file.

**Scenario**

- **Given** a user invokes `/sdd-init` directly
- **When** config is absent or present
- **Then** the shared bootstrap respectively creates and reports it, or preserves and reports the existing file

### R6. Phase-relative pending diagnostics

While the current recommended phase is scope, map, or design, the system MUST treat absent `tasks.md` as future pending work and MUST NOT include `tasks.md ausente.` in blocker/problem output. The missing artifact MAY remain visible in the artifact inventory.

**Scenario**

- **Given** a change has only artifacts through scope or map
- **When** status or next-step diagnostics are resolved
- **Then** the correct next phase is recommended and absent `tasks.md` is not listed as a blocker

### R7. Actionable failure diagnostics

The system MUST continue to expose task diagnostics once tasks are actionable, including absent, unreadable, malformed, or explicitly blocked tasks. It MUST also retain incomplete/blocked apply diagnostics and failed/unknown verify diagnostics when their gates are reached.

**Scenario**

- **Given** a change has reached tasks, apply, or verify and the current artifact is invalid, incomplete, blocked, failed, or has no clear outcome
- **When** status is resolved
- **Then** the affected phase remains recommended and its concrete diagnostic remains visible

### R8. Phase gate compatibility

Automatic bootstrap MUST NOT imply automatic progression between actual SDD phases. In interactive mode, the system MUST retain confirmation after one phase completes and before the next actual phase starts.

**Scenario**

- **Given** automatic bootstrap has entered and completed `sdd-scope` in interactive mode
- **When** map is the next recommended phase
- **Then** the orchestrator asks to continue before delegating map, rather than auto-running it

### R9. Orchestrator inventory compatibility

The system MUST preserve exactly one authoritative `sdd-scope` inventory entry and MUST keep scope as the first delegated phase after startup preparation.

**Scenario**

- **Given** the inventory already contains `sdd-scope`
- **When** startup guidance is updated
- **Then** that row remains present once and the documented phase flow still begins with scope

### R10. Focused automated coverage

The change MUST include focused automated tests for missing-config creation, existing-config raw-byte preservation, startup continuation, phase-relative task diagnostics, and preserved downstream blocker behavior.

**Scenario**

- **Given** isolated temporary project fixtures for each startup and phase state
- **When** the focused Bun tests run
- **Then** they distinguish create from preserve, prove the original flow continues, suppress only future task absence, and retain real task/apply/verify diagnostics

## C. Decisions

### 1. Extract a neutral functional module, not an extension dependency

Move the current detector, renderer, directory preparation, and create-if-absent operation into a small public module under `ein-pi/agent/lib/`. Its main function returns a discriminated result such as `created` with detection metadata or `preserved` without touching file contents.

`/sdd-init` owns command UI and notifications. `ein-ai.ts` owns startup composition. `sdd-preflight.ts` continues to own preferences, git baseline, asset installation, model routing, caching, and in-flight deduplication. This keeps the dependency graph acyclic and avoids a class/factory abstraction that would add no value.

### 2. Compose bootstrap after preflight but before request continuation

The `runSddPreflight` startup wrapper will await existing preflight work, invoke the shared bootstrap, then let the input hook return `action: "continue"`. The `before_agent_start` fallback uses the same wrapper. This preserves the baseline snapshot before project-local mutation and ensures both explicit-input and lazy-agent entry paths prepare config.

Bootstrap success is not a terminal command result. The orchestrator receives the original explicit SDD intent and immediately routes the first actual phase, `sdd-scope`.

### 3. Preserve manual command output at the command edge

The manual command continues to run preflight first and then calls the shared bootstrap directly. Its handler maps `created` to the existing detection summary and `preserved` to the existing warning. Startup may ignore that presentation metadata because it must continue silently into scope.

### 4. Use exclusive create semantics

The bootstrap checks existence before expensive detection and uses an exclusive create operation for the final write. If another caller creates the file first, the loser returns `preserved`; it never retries with overwrite semantics. This is the smallest way to make byte preservation hold under the input plus `before_agent_start` overlap.

### 5. Filter only future absence at the diagnostic boundary

`readTasksStatus` may keep parsing raw task state. After `nextRecommended` is known, `resolveSddStatus` removes only the absent-task problem while scope, map, or design is current. It does not globally erase task parsing failures or blocked state. The status object then becomes the consistent source for `formatSddStatus` and `resolveSddNext`, avoiding separate presentation-only rules.

The existing artifact inventory remains unchanged, so future files are still discoverable as missing without being labeled blockers.

### 6. Keep apply and verify gates fail-closed

No phase ordering or outcome parser changes are needed. `apply-progress.md` without `status: complete`, explicit apply blockage, verify failure, and verify without a clear pass/fail remain blockers when prior phases permit those gates to be evaluated.

### 7. Test at stable seams

A new bootstrap test uses temporary projects and raw byte comparison. Router tests cover phase-relative diagnostic objects; status-output tests cover visible blocker rendering. Startup/flow contract coverage proves the explicit input path invokes bootstrap and continues, the orchestrator enters scope without `/sdd-init`, later interactive gates remain, and the inventory contains one `sdd-scope` row.

### Alternatives rejected

- **Import config helpers from `sdd-init.ts` into preflight/startup:** rejected because command extensions are not neutral libraries and this invites the named cycle or hidden extension coupling.
- **Duplicate detection/rendering for automatic startup:** rejected because generated configs would drift between manual and automatic paths.
- **Put automatic bootstrap directly inside every `ensureSddPreflight` caller:** rejected because `/sdd-init` would lose reliable knowledge of whether its own operation created or preserved the file, complicating compatibility.
- **Suppress all `tasks.problems`:** rejected because malformed and blocked task artifacts must remain actionable.
- **Auto-run the complete SDD chain after bootstrap:** rejected because it removes real phase gates and exceeds the requested friction reduction.
- **Rewrite the status formatter only:** rejected because `/ein:sdd-next` and deterministic tool consumers would still receive misleading task problems.

## D. Success Criteria

### Observable acceptance checks

1. In a temporary project without `openspec/config.yaml`, an explicit SDD startup creates the config and proceeds with the original request toward `sdd-scope` without another command or confirmation.
2. Direct bootstrap, automatic startup, repeated startup, and `/sdd-init` leave arbitrary pre-existing config bytes unchanged.
3. Generated config output remains compatible with the current detector/renderer contract.
4. Scope-, map-, and design-phase status recommend the correct next phase without showing `tasks.md ausente.` under blockers or `/ein:sdd-next` review items.
5. At tasks or later, absent/unreadable/malformed/blocked tasks remain visible; partial/blocked apply remains on apply; failed or unknown verify remains on verify.
6. Interactive flow still stops for confirmation between actual phases, beginning after scope before map.
7. `orchestrator.md` contains exactly one unchanged `sdd-scope` inventory row.
8. Legacy `.sdd/changes/` routing and manual `/sdd-init` registration remain covered.

### Focused verification strategy

The implementation phase should confirm the repository's existing focused Bun invocation before recording evidence because `openspec/config.yaml` intentionally has no configured test runner. The expected focused set is:

```text
bun test tests/sdd-config-bootstrap.test.ts tests/sdd-router.test.ts tests/sdd-status-output.test.ts tests/sdd-flow-contract.test.ts tests/sdd-preflight-tdd-gate.test.ts
```

The already-recorded type check remains:

```text
cd installer && bun run typecheck
```

No full build, package-manager change, config rewrite, or broad test-suite requirement is part of this design.
