status: mapped
scope_status: bounded-partial
change: bind-todo-to-session
phase: map

# Implementation map

## Current data flow

- `pi-ein/pi-ein.fish:1-31` establishes `PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME`, and `ENGRAM_DATA_DIR`. `app` invokes the trusted terminal app directly; `cleaner`/`workbench` invoke the surface runner; all other argv is delegated to vanilla `pi`. Ordinary delegation and isolated environment are invariants.
- Terminal dashboard state is controller-local: `createTerminalAppController()` (`terminal-app-controller.ts:61-258`) owns `focusedChange` (`:62`), passes it to `readSummary` on initialization/refresh (`:63-65,201-205`), and changes it only through the `focus-change` effect (`:220-224`). It is not persisted or carried by a launch callback.
- `TerminalAppOptions.runtime` currently exposes `launch(provider, reference?)` and `continue(provider, brief)` (`terminal-app-entrypoint.ts:131-153`). The factory wires these to `productionLaunch`/`productionContinue` (`:173-180,185-201`). `productionLaunchPlan` (`:507-549`) recomputes `projectProjectState({cwd})`, then calls adapter `resume` when a reference exists or `create` otherwise, builds a validated plan, and preserves isolated Pi env. Continue currently uses the create path and only injects the continuity brief into the new process.
- Runtime launch contracts are intentionally closed. `LaunchPlan` (`runtime-session-adapters.ts:203-212`) permits only create `argv=[]` or resume `argv=[--session,<validated uuid>]` for Pi (`launchArgvFor`, `isDeclaredLaunchArgv`); `buildLaunchPlan` validates provider/mode/project/reference, resolves opaque resume references, and constructs the isolated environment. `executeLaunchPlan` rejects tampered/copied plans. Any intent carrier must not become arbitrary argv.
- The Fish `app` branch forwards `argv[2..-1]` directly to `bun app.ts`; no current change-intent transport exists. The terminal app parser (`parseTerminalAppArgs`, `:85-107`) accepts only help/once/no-intro/project and preserves installer delegation as a first-argument branch.
- The overlay extension (`ein-sdd-overlay.ts:19-82`) currently calls `resolveSddStatus(ctx.cwd)` at `refresh()` (`:42-56`), caches rendered text in `painted`, and refreshes on `session_start`, `turn_end`, `tool_execution_end`, `agent_end`, plus collapse shortcut. It has no session binding, no custom-entry read/write, and only the startup cache reset guarantees repaint after UI reconstruction.
- The pure renderer (`ein-pi/agent/lib/sdd-overlay.ts:163-235`) already clears on `status.change === null`, preserves stable widget key `ein-sdd`, and handles ambiguous filesystem selection specially. The extension must supply an unbound/cleared status rather than allowing filesystem fallback to reach this renderer.
- `projectOpenSpecState` (`project-state.ts:797-842`) explicitly validates a supplied change against `activeChanges`, but absent selection adopts a sole active change. `resolveActiveSelection` (`sdd-router.ts:526-533`) has the same explicit/sole/ambiguous semantics. These are shared non-UI semantics and must remain unchanged.

## Launch-path distinctions

1. **Fresh/create:** Dashboard launch without a picked reference reaches `productionLaunchPlan(..., reference=undefined)`, adapter `create`, and a Pi launch with empty argv. It must remain unbound unless a separately validated explicit intent accompanies the launch. A sole OpenSpec change must not bind this session.
2. **Picked resume:** Controller session-list selection produces `launch(provider, opaque reference)` (`executeExternal`, `:91-131`). The adapter resolves the opaque reference to the isolated session UUID and emits `--session <uuid>`. The resumed Pi session must restore only its own persisted binding during `session_start`; no controller/project-global binding may participate.
3. **Dashboard continue-as-new:** `executeContinue` (`:134-189`) prepares a continuity brief, releases the dashboard, and calls `continueLaunch(provider, brief)`. `productionContinue` currently calls the create plan and `runContinueInPty` (`terminal-app-entrypoint.ts:507-549`). The focused change is available only in controller memory and is not in this handoff. This is the narrowest path requiring explicit intent propagation into the newly-created Pi process/session.
4. **Surface distinction:** `pi-ein app` reaches the terminal app directly and therefore may bypass Fish's default branch; the Fish `app` branch still matters for user-facing launcher invocation and exact forwarding tests. Verify the installed/packaged app path before assuming all dashboard launches traverse Fish.

## Candidate production touch points

- `pi-ein/pi-ein.fish:1-31`: preserve env assignments, `app`/surface dispatch, and `command pi $argv`; add only the exact validated forwarding contract if intent is transported here. `tests/surface-wiring.test.ts` is the contract seam, though its current focus is surface runner rather than app intent.
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts:68-107,131-201,507-549`: typed terminal args, runtime callback shapes, factory wiring, `productionLaunchPlan`, `productionContinue`, and `productionLaunch`. This is the production boundary where create/resume/continue must remain distinguishable and where explicit intent must reach `buildLaunchPlan`/the child environment without arbitrary argv.
- `ein-pi/agent/lib/runtime-session-adapters.ts:203-268,797-816,1020-1144,1288+`: `LaunchPlan`, `LaunchIntent`, `createSessionRequest`/adapter `create`, resume resolution, `buildLaunchPlan`, `validLaunchPlan`, and `executeLaunchPlan`. Existing trust model constrains intent shape and environment keys; adding a field requires corresponding plan validation and tests.
- `ein-pi/agent/lib/terminal-app-controller.ts:28-65,134-189,201-231`: `focusedChange`, `TerminalAppControllerPorts`, `executeExternal`, `executeContinue`, and `focus-change`. Continue must capture the focused change at the action boundary and pass it through a typed port; picked resume must continue using its opaque reference and session id.
- Dashboard consumers: `ein-pi/agent/surfaces/terminal-dashboard-root.tsx` and `terminal-dashboard-runner.tsx` consume the controller and lifecycle; runner recreates the renderer on resume (`terminal-dashboard-runner.tsx:32-84`). They are likely verification/notification edges, not launch-plan owners.
- `ein-pi/agent/extensions/ein-sdd-overlay.ts:19-82`: narrow UI edge for reading/restoring session entries, validating the selected change, writing a binding/clear entry, and forcing `painted = null` before immediate `refresh`. Preserve `OVERLAY_KEY`, deduplication, lifecycle refreshes, and no-UI behavior.
- `ein-pi/agent/lib/project-state.ts:797-842` and `ein-pi/agent/lib/sdd-router.ts:526-533,558+`: validator/facts provider only. Call explicit selection for a saved/transported identifier; never alter `resolveActiveSelection()` or the sole-change fallback.
- `ein-pi/agent/extensions/ein-ai.ts:604-618,1612-1645`: explicit SDD command/tool surfaces parse named change arguments and call `resolveSddStatus`/close flows. These are candidate notification seams for explicit select/create/close/continue interactions, but the inspected portions do not expose an overlay callback. Map the exact command registration and any create/change lifecycle before implementation.

## Session persistence seam

- Scope-approved API is Pi custom non-LLM-context entries: append with `pi.appendEntry()` and inspect `ctx.sessionManager.getEntries()` from `session_start`; Pi core storage must not be changed.
- The existing `sddPreflightSessionKey` (`sdd-preflight.ts:184-198`) demonstrates session-manager identity access (`getSessionFile`, then `getSessionId`, cwd fallback), but it is not a binding store. It is a useful identity/test seam and warns against module-global state.
- Required persisted contract still needs to be fixed in design: versioned entry type, valid change identifier, and an explicit clear representation. Restoration must scan multiple entries deterministically (scope expects latest valid entry, but malformed/latest-clear behavior needs a precise rule), validate active OpenSpec state, and clear the widget on any invalid/missing/stale/closed result.
- Entries must be session-local: tests need two same-project fake contexts/session managers and must prove no cross-session or project-global leakage.

## Focused tests and coverage additions

- `tests/sdd-overlay-repaint.test.ts:1-103`: existing fake Pi event registry, fake context, stable widget assertions, startup repaint/dedup/no-UI contracts. Extend this seam for immediate explicit binding, clear, and same-interaction repaint.
- `tests/sdd-overlay.test.ts:1-220`: pure renderer contracts for no change, ambiguous selection, stable key, task/phase rendering. Add/retain a direct unbound status assertion; do not alter renderer ambiguity semantics unless the extension maps unbound to `change: null, selection: none`.
- New focused overlay persistence tests are most naturally alongside `sdd-overlay-repaint.test.ts` (or a mirrored `sdd-session-binding.test.ts` if a deterministic module is extracted): fresh empty with one filesystem change, restore valid binding, two-session isolation, malformed/missing/stale/closed binding clearing, latest-entry rule, append/clear, and immediate paint.
- `tests/runtime-session-resume.test.ts`: current exact Pi resume (`--session uuid`), create empty argv, isolated-home, and argv tamper rejection (`:130-220`). Add create-with-explicit-intent and continue intent propagation while preserving empty-argv default and closed-plan rejection.
- `tests/runtime-session-adapters.test.ts`: typed `LaunchIntent`, project binding, plan validation, and adapter contract. Add intent carrier validation/serialization tests here if it lives in the adapter boundary.
- `tests/terminal-app-controller.test.ts`: controller harness captures `readSummary`, launch references, lifecycle ordering, and continue async behavior. Add focused-change propagation for continue and ensure picked resume still passes only provider/reference; test no focused change means no intent.
- `tests/terminal-app-driver.test.ts`: argument parser, installer delegation, renderer/driver seams. Add exact app intent transport and ordinary invocation/delegation preservation here if parser/env is touched.
- `tests/surface-wiring.test.ts`: existing Fish/surface launcher contract; add exact forwarding and isolated env assertions only if Fish source changes.
- Existing `tests/sdd-router.test.ts`, `tests/sdd-status-output.test.ts`, and project-state consumers are regression targets for unchanged explicit/sole filesystem selection; no production edit to `resolveActiveSelection()` is in scope.

## Dependencies and constraints

- Strict TDD is declared, but map phase does not run tests/build/typecheck.
- Pi and Claude share runtime adapter contracts; Pi session custom entries are Pi-only. Do not leak the UI binding into shared filesystem project state or Claude paths.
- `LaunchPlan` currently allows only fixed argv shapes and exact isolated env keys. Prefer a typed validated intent carrier through the trusted launch boundary; arbitrary user argv or unvalidated environment values are prohibited.
- OpenSpec active-ness is directory membership under `openspec/changes`, excluding `archive`; detailed status comes from `resolveSddStatus`. Explicit invalid names currently yield unavailable/not-found facts, which is suitable for fail-closed UI validation.
- Stable widget identity/dedup and lifecycle repaint must remain. Immediate repaint is an additional direct event path, not a replacement for `turn_end`/tool/agent refreshes.
- Non-UI consumers retain `projectProjectState` and router fallback semantics. Do not pass session selection into generic `resolveActiveSelection()` callers.
- Launcher isolation must continue to set both Pi directories and Engram location; ordinary `pi-ein` delegation must remain untouched.

## Unresolved questions for design

- Exact source of explicit select/create/continue notification: terminal `focus-change` is clear for dashboard focus; `ein-ai` command/tool handlers need a complete registration scan to identify create and named SDD selection callbacks and how they can call the overlay without coupling command logic to UI.
- Whether change intent should be a validated environment variable, a dedicated app argument, or a structured launch request passed only through the trusted direct executable path. Fish forwarding and direct `app.ts` invocation must both be covered.
- Whether `productionContinue` should receive a changed signature carrying intent, or whether a launch-plan object/typed request should carry `focusedChange` while preserving continuity brief transport and PTY safety.
- Exact Pi custom-entry schema/version, entry field namespace, and latest-entry rule when entries include malformed values, multiple valid bindings, or an explicit clear. Scope states latest valid entry plus representable clear; define precedence and malformed handling before apply.
- How `session_start` exposes the entry list in the installed Pi SDK and whether `pi.appendEntry` is available synchronously in all explicit interaction callbacks.
- Validation rule for closed/stale: directory absence/archive is clear; determine whether a present change with invalid status/artifacts is still a valid active binding or must be considered stale, without invoking sole-change fallback.
- Confirm whether dashboard continue launches via Fish or trusted `bun app.ts`/compiled app, and ensure no alternate workbench/PTY launch edge is missed.

## Explicit non-decisions

This map does not choose the transport, persisted entry schema, extracted module, or callback architecture. It records the smallest observed seams and preserves the prohibited invariants: `resolveActiveSelection()` remains unchanged, non-UI tool selection remains filesystem-deterministic, and no Pi core storage changes.

ledger:
  reads:
    - { path: "openspec/changes/bind-todo-to-session/scope.md", lines: 101, estimated_tokens: 2400 }
    - { path: "openspec/changes/bind-todo-to-session/specs/sdd-session-binding/spec.md", lines: 56, estimated_tokens: 1300 }
    - { path: "EIN.md", lines: 135, estimated_tokens: 1900 }
    - { path: "pi-ein/pi-ein.fish", lines: 31, estimated_tokens: 260 }
    - { path: "ein-pi/agent/lib/runtime-session-adapters.ts", lines: 340, estimated_tokens: 4200 }
    - { path: "ein-pi/agent/surfaces/terminal-app-entrypoint.ts", lines: 170, estimated_tokens: 2200 }
    - { path: "ein-pi/agent/lib/terminal-app-controller.ts", lines: 258, estimated_tokens: 2500 }
    - { path: "ein-pi/agent/extensions/ein-sdd-overlay.ts", lines: 82, estimated_tokens: 850 }
    - { path: "ein-pi/agent/lib/project-state.ts", lines: 75, estimated_tokens: 900 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: 80, estimated_tokens: 850 }
    - { path: "ein-pi/agent/lib/sdd-overlay.ts", lines: 170, estimated_tokens: 2200 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: 110, estimated_tokens: 1500 }
    - { path: "ein-pi/agent/lib/sdd-preflight.ts", lines: 40, estimated_tokens: 450 }
    - { path: "ein-pi/agent/surfaces/terminal-dashboard-runner.tsx", lines: 85, estimated_tokens: 850 }
    - { path: "tests/sdd-overlay-repaint.test.ts", lines: 103, estimated_tokens: 1200 }
    - { path: "tests/sdd-overlay.test.ts", lines: 238, estimated_tokens: 2600 }
    - { path: "tests/runtime-session-resume.test.ts", lines: 245, estimated_tokens: 2900 }
    - { path: "tests/runtime-session-adapters.test.ts", lines: 180, estimated_tokens: 2300 }
    - { path: "tests/surface-wiring.test.ts", lines: 180, estimated_tokens: 2200 }
    - { path: "tests/terminal-app-controller.test.ts", lines: 180, estimated_tokens: 2200 }
    - { path: "tests/terminal-app-driver.test.ts", lines: 180, estimated_tokens: 2200 }
    - { path: "tests/runtime-sessions.test.ts", lines: 1, estimated_tokens: 40 }
    - { path: "tests/terminal-app-pty.test.ts", lines: 1, estimated_tokens: 40 }
    - { path: "tests/terminal-app.test.ts", lines: 1, estimated_tokens: 40 }
    - { path: "tests/sdd-router.test.ts", lines: 1, estimated_tokens: 40 }
    - { path: "tests/sdd-status-output.test.ts", lines: 1, estimated_tokens: 40 }
    - { path: "ein-pi/agent/surfaces/terminal-dashboard-root.tsx", lines: 1, estimated_tokens: 40 }
    - { path: "ein-pi/agent/app.ts", lines: 1, estimated_tokens: 40 }
    - { path: "installer/scripts/build-terminal-app.ts", lines: 25, estimated_tokens: 300 }
    - { path: "ein-pi/agent/lib/runtime-sessions.ts", lines: 98, estimated_tokens: 1300 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 15000, reads: 30 }
  budget_exceeded: true
  budget_note: "Exploration reached the configured 30-read cap after the bounded source/test map; no tests, builds, or typechecks were run."
