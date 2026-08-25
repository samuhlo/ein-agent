# Session-owned SDD TODO focus

## A. Proposal

### Intent

Bind the TODO overlay to the currently active Pi session, so filesystem discovery supplies OpenSpec facts but never chooses UI focus. Explicit session intent binds immediately; fresh sessions remain empty and resumed sessions restore only their own entry.

### Scope

**In:** a versioned Pi custom-entry contract; one-shot validated launch metadata for Pi create/continue; synchronous inter-extension notification; explicit validation and clearing; focused tests for fresh, resume, isolation, invalidation, repaint, and transport.

**Out:** changing `resolveActiveSelection()`, changing CLI/tool fallback semantics, persisting UI focus in project files, changing Pi core/session files, redesigning the dashboard, or adding a general-purpose selection service.

### Affected areas

- `ein-pi/agent/lib/sdd-session-binding.ts` (new, deterministic schema/parsing/validation helpers and shared event/metadata constants)
- `ein-pi/agent/extensions/ein-sdd-overlay.ts` and `ein-pi/agent/extensions/ein-ai.ts`
- `ein-pi/agent/lib/runtime-session-adapters.ts`
- `ein-pi/agent/lib/terminal-app-controller.ts`
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts`
- `pi-ein/pi-ein.fish`
- Focused tests under `tests/`; `project-state.ts`, `sdd-router.ts`, and the pure overlay renderer remain behaviorally unchanged

### Risks

- A launch marker could be reused by a later `/new` or resume in the same process.
- A malformed newest entry could accidentally resurrect an older valid binding.
- Event-bus listeners could survive reload and paint through a stale context.
- Extending launch environment keys could weaken the existing launch-plan tamper guard.

### Rollback

Remove the binding module, event producer/listener, optional launch metadata, and controller continue argument; restore the overlay's filesystem-only refresh. Existing OpenSpec files and Pi sessions remain readable because custom entries are ignored by Pi and by the old extension.

### Success criteria

Fresh direct/Fish and dashboard create are unbound; picked resume restores its own valid entry; continue-as-new carries valid focus into a new Pi session; invalid bindings clear without fallback; an approved explicit bind paints before its initiating callback returns; existing non-UI selection and exact argv guards remain unchanged.

### Canonical OpenSpec context

`scope.md` supplied no canonical `openspec/specs/<domain>/spec.md` references and `map.md` added no explicit mapped domain hint. Canonical usage is **0 files, 0 UTF-8 bytes**; therefore there are no path/SHA-256/byte-count rows to record.

## B. Spec

### Requirement 1 — Session-local UI authority

The system **MUST** render SDD TODO only for the active Pi session's valid binding and **MUST NOT** derive an absent UI binding from sole-change filesystem fallback.

**Given** one active OpenSpec change exists and a fresh Pi session has neither a binding entry nor launch intent  
**When** the overlay receives `session_start`  
**Then** it clears `ein-sdd` and remains unbound.

### Requirement 2 — Durable restore and isolation

The system **MUST** persist binding state as Pi custom entries and **MUST** restore only entries from the resumed session's `SessionManager`.

**Given** two same-project Pi sessions have different latest binding entries  
**When** one is resumed with `--session <uuid>`  
**Then** `getEntries()` for that resumed session restores only its binding.

### Requirement 3 — Fail-closed invalidation

The system **MUST** treat an absent, malformed, unknown-version, cleared, missing, archived, unsafe, or unreadable binding as unbound and **MUST NOT** fall back to an older entry or sole active change.

**Given** the newest matching custom entry is malformed or names a change that is no longer active  
**When** restore or a lifecycle refresh validates it  
**Then** the system appends at most one clear transition, clears the widget, and stays unbound.

### Requirement 4 — Immediate explicit binding

An approved in-session selection producer **MUST** publish a valid named binding on Pi's shared event bus, and the overlay **MUST** persist and repaint it synchronously in the same interaction.

**Given** `/ein:sdd-next <change>` resolves an active named change  
**When** `ein-ai` emits the binding event  
**Then** `ein-sdd-overlay` appends the bind entry and calls `setWidget("ein-sdd", ...)` before `emit()` returns.

### Requirement 5 — Continue-as-new transport

The terminal app **MUST** capture the focused change at the continue action boundary, revalidate it, and carry it only into a newly created Pi process as one-shot metadata; picked resume **MUST NOT** receive that metadata.

**Given** the dashboard focuses a valid active change and continues into Pi  
**When** the create launch plan starts the child  
**Then** argv remains empty, the child consumes the metadata once, appends a bind entry, and paints before the continuity brief is delivered.

### Requirement 6 — Closed launch shape

The launcher **MUST** preserve Pi create argv as `[]`, Pi resume argv as `["--session", validatedUuid]`, `shell: false`, and exact validated environment ownership.

**Given** caller data attempts to add an argument, alter metadata, or attach binding intent to resume/Claude  
**When** the launch plan is built or executed  
**Then** the plan is rejected without spawning.

### Requirement 7 — Filesystem authority and non-UI compatibility

OpenSpec files **MUST** remain authoritative for change existence/status/tasks, while session binding controls only overlay focus; non-UI consumers **MUST** retain existing explicit/sole/ambiguous selection behavior.

**Given** a CLI or deterministic tool calls existing project/router selection without a Pi binding  
**When** this change is installed  
**Then** its result is unchanged.

## C. Decisions

### 1. State model and custom-entry schema

Runtime state is a closure owned by one loaded overlay instance:

```ts
type SessionBinding =
  | { kind: "unbound" }
  | { kind: "bound"; change: string };
```

Persistence uses `customType: "ein:sdd-session-binding"` with exact-key versioned data:

```ts
type SessionBindingEntryV1 =
  | { version: 1; state: "bound"; change: string }
  | { version: 1; state: "unbound" };
```

Pi owns entry `id`, `parentId`, and `timestamp`; the payload does not duplicate them. The binding is session-wide rather than branch-wide, so restoration uses `ctx.sessionManager.getEntries()` (the append-only session order), not `getBranch()`.

**Restore order:**

1. Reset closure state to unbound and invalidate the paint cache.
2. Read all entries and locate the newest entry whose `type` is `custom` and whose `customType` matches exactly.
3. If it is a valid V1 clear, remain unbound. If it is a valid V1 bind, validate its exact change against current canonical active OpenSpec state.
4. If the newest matching entry is malformed, unknown-version, or its change is invalid, do not scan backward. Append one V1 clear and remain unbound. This prevents an older binding from being resurrected.
5. Only when there is no matching entry at all may a valid, startup-only launch intent initialize the new session. Persist it immediately as a V1 bind.
6. Paint from the resulting state. Every later lifecycle refresh revalidates a bound change explicitly; the first invalidation appends a clear, subsequent refreshes merely keep the widget clear.

A change is valid for UI binding only when its name passes the existing safe-name rule and explicit canonical lookup proves that exact name is in active `openspec/changes/` (not `archive`) and can produce explicit status. Incomplete/blocked phase artifacts remain a valid active change and render their filesystem facts; identity absence, unsafe names, or unavailable OpenSpec inspection fail closed.

### 2. Synchronous communication between extensions

Use Pi's existing per-runtime `pi.events`, channel `ein:sdd-session-binding:v1`, with an exact validated payload:

```ts
type SessionBindingEventV1 =
  | { version: 1; action: "bind"; change: string }
  | { version: 1; action: "invalidate"; change: string }
  | { version: 1; action: "clear" };
```

`ein-ai` emits `bind` only after a named approved interaction succeeds; this slice approves successful `/ein:sdd-next <change>`. A successful in-process creator may call the same small publisher only after the new change is explicitly validated; filesystem creation or generic lifecycle events alone never bind. Successful close may emit `invalidate(change)` so the overlay clears immediately only when that change is focused. Generic model-callable/non-UI tools do not become selection producers merely because they accept a `change` argument.

The overlay registers one synchronous listener, keeps only its current session context in its extension closure, validates again, calls `pi.appendEntry()`, resets `painted`, and calls `refresh()` without `await`. Installed Pi implements `pi.events` with Node `EventEmitter`; listener invocation is synchronous, and `appendEntry` is a synchronous `void` API. Thus the state write and `setWidget` occur before `emit()` returns. Pi reload/session replacement tears down and rebinds extension instances; no exported mutable singleton or project-global state is introduced.

### 3. Fresh, resume, and continue flows

| Flow | Binding source | Result |
|---|---|---|
| Plain `pi-ein` / fresh Pi | Reserved metadata is removed by Fish; no entry | Unbound, empty widget |
| Dashboard plain create | Create intent has no binding metadata; argv `[]` | Unbound |
| Picked resume | Existing `--session <uuid>` plus that session's entries | Restore newest authoritative entry; no launch metadata |
| Dashboard continue-as-new to Pi | Captured `focusedChange` in typed create intent | New session consumes metadata, persists bind, paints |
| Continue without focus / to Claude | No Pi binding metadata | Existing behavior unchanged |

The controller captures `focusedChange` before asynchronous continuity preparation and extends only `continueLaunch(provider, brief, focusedChange?)`. Ordinary `launch(provider, reference?)` and picked resume remain unchanged. `productionContinue` revalidates the captured name at launch time and either builds a Pi create plan with intent or fails unavailable; it never silently launches an explicitly requested but invalid focus as bound.

### 4. Launch-intent carrier

Use a reserved one-shot environment key, `EIN_SDD_SESSION_BINDING_V1`, whose value is canonical JSON containing only `{version:1, change, projectCwd}`. It is derived by `buildLaunchPlan` from a typed Pi-create intent after safe-name, exact project binding, and active-change validation.

- `launchArgvFor()` and `isDeclaredLaunchArgv()` remain byte-for-byte authoritative; no change name enters argv.
- `LaunchPlan` environment validation allows the reserved key only on a validated Pi create plan that owns binding intent. The existing WeakMap-backed exact environment snapshot still rejects copied or mutated plans.
- Resume and Claude plans reject binding intent and retain their existing exact environment key sets.
- `runContinueInPty` continues to transport only the continuity brief through bracketed paste; it receives the plan environment unchanged. Binding is not injected into LLM text.
- On the first `session_start` with reason `startup`, the overlay captures and deletes the reserved process environment key before parsing it. It applies it only when the session has no binding entries. Reload, `/new`, `/resume`, and later session starts therefore cannot reuse it.
- `pi-ein.fish` explicitly erases this reserved key before ordinary/default delegation and before starting the terminal app. The trusted adapter adds it only to the eventual Pi child when continue intent is valid. This keeps direct/Fish fresh launch empty even if a parent shell contains a stale exported value.

Environment metadata is preferred over argv because the argv contract is deliberately closed, and over handoff text because selection is UI metadata that must be available before the continuity prompt and must never enter model context.

### 5. Authority boundaries

- `sdd-session-binding.ts`: schemas, exact parsing, safe serialization, and pure transition/validation helpers; no I/O and no mutable state.
- `runtime-session-adapters.ts`: trusted process-plan validation and serialization to one-shot environment metadata.
- Terminal controller/entrypoint: capture and route explicit continue intent; no persistence.
- `ein-ai.ts`: approve and publish explicit interaction outcomes; no overlay rendering or binding storage.
- `ein-sdd-overlay.ts`: own current session closure, Pi custom entries, explicit OpenSpec validation, invalidation, and widget repaint.
- OpenSpec filesystem/router: authoritative facts. `resolveActiveSelection()`, `projectProjectState()` default behavior, and non-UI callers remain unchanged.

### 6. Alternatives rejected

- **Process-global singleton:** rejected because Pi can replace/reload sessions in one process; stale mutable state and listeners would leak across session lifecycles.
- **Project file or controller-global selection:** rejected because two sessions in one project must differ and OpenSpec files are not UI preference storage.
- **New argv flag:** rejected because it expands an intentionally closed injection surface and is unnecessary.
- **Continuity brief/handoff text:** rejected because it reaches model context after startup and cannot guarantee immediate pre-turn repaint.
- **Scan backward to the latest parseable entry:** rejected because a malformed newest transition could revive stale focus. Newest matching entry is authoritative and malformed means clear.
- **Make every named SDD tool a selection:** rejected because deterministic/non-UI inspection must not mutate UI focus.

## D. Success Criteria

### Observable checks

- With exactly one active change, a fresh overlay writes only an empty/clear `ein-sdd` widget and appends no implicit bind.
- A valid V1 bind restores; a clear, malformed newest entry, unsafe name, missing directory, archived change, or unavailable inspection clears and never selects another active change.
- Two fake session managers for the same cwd restore independently.
- Successful `/ein:sdd-next <change>` records a custom entry and paints the named change synchronously; duplicate lifecycle refreshes retain current deduplication and stable key/placement.
- Continue captures the focused change, Pi create argv stays empty, metadata reaches the child environment, and startup persists it before the PTY brief; no-focus create and picked resume carry no metadata.
- Fish clears inherited reserved metadata while preserving isolated homes, `app` forwarding, installer/surface dispatch, and ordinary `command pi $argv` behavior.
- Existing router/project-state tests continue to prove explicit, sole, and ambiguous non-UI selection semantics.

### Verification strategy

Focused contracts should cover:

- `tests/sdd-session-binding.test.ts`: exact schema, newest-entry authority, clear precedence, malformed/unknown-version fail-closed behavior, launch metadata parsing/one-shot rules, and active-name validation.
- `tests/sdd-overlay-repaint.test.ts`: fresh empty despite one change, valid restore, two-session isolation, lifecycle invalidation, custom entry append, stable widget identity/dedup, and same-stack event repaint.
- `tests/terminal-app-controller.test.ts`: focus captured before async prepare; continue receives it; no focus stays absent; ordinary launch/resume signatures remain unchanged.
- `tests/runtime-session-adapters.test.ts` and `tests/runtime-session-resume.test.ts`: typed Pi-create metadata, exact conditional env keys, create `[]`, resume `--session uuid`, rejection on resume/Claude/invalid change, and tamper/copy rejection.
- `tests/terminal-app-pty.test.ts`: continue child receives binding metadata separately from the brief and preserves provider isolation.
- `tests/surface-wiring.test.ts`: Fish removes inherited reserved metadata while exact ordinary argv forwarding and isolated environment remain intact.
- Existing `tests/sdd-router.test.ts`, project-state/status contracts, and pure `tests/sdd-overlay.test.ts`: no non-UI or renderer regression.

Known acceptance commands for apply/verify are:

```sh
bun test tests/sdd-session-binding.test.ts tests/sdd-overlay-repaint.test.ts tests/terminal-app-controller.test.ts tests/runtime-session-adapters.test.ts tests/runtime-session-resume.test.ts tests/terminal-app-pty.test.ts tests/surface-wiring.test.ts tests/sdd-router.test.ts tests/sdd-overlay.test.ts
bun test
bun run typecheck
```

No installer production file is in the design, so the installer-specific typecheck is not introduced as a change-specific check.
