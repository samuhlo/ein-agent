status: complete
scope_status: bounded-partial
change: duplicate-startup-output-investigation
phase: map
budget_source: scope.md
budget:
  max_tokens: 8000
  max_reads: 10
budget_exceeded: true

# Startup output investigation map

## Executive finding

The current source has one concrete `startPiEinUpdateNotice` call expression in `ein-pi/agent/extensions/ein-banner.ts:348`, inside the `session_start` handler. The codegraph reported two callers for that symbol in the banner, but direct source search found only the import and this one call; treat the graph caller count as a graph artifact until reconciled. This does not establish whether the extension is evaluated/registered more than once, nor whether Pi renders one notification more than once.

## Mapped execution path

```text
Pi process/session start
  -> Pi extension discovery (runtime-owned; exact configured discovery surface remains to be captured)
  -> evaluate/load ein-pi/agent/extensions/ein-banner.ts
  -> default extension function receives ExtensionAPI
  -> pi.on("session_start", async (_event, ctx) => ...)
  -> return for no UI or CLI-command sessions
  -> startPiEinUpdateNotice(ctx, detectPiEinUpdates)       [banner.ts:348]
       -> asynchronous update detector / fail-open probes
       -> notice decision and message construction
       -> ctx.ui.notify(...)                                [notification boundary]
  -> Pi UI notification renderer / terminal presentation

Independent banner work after the notice starts:
  -> intro-mode check
  -> stdout clear and animated startup banner rendering
  -> async reads of installer version, extension count, agents, MCP/session data
  -> timers/resize cleanup and terminal output
```

### File responsibilities and boundaries

- `ein-pi/agent/extensions/ein-banner.ts:318-388` is the runtime entry surface mapped here. It defines the anonymous extension export, registers `session_start`, filters CLI/no-UI sessions, and invokes the update notice before the intro banner. `startPiEinUpdateNotice` is imported at `:34`; the only direct call expression found is `:348`.
- `ein-pi/agent/lib/ein-update-notice.ts` owns the async notice/probe seam. Its fail-open scheduler means detector completion can be later than the startup handler; timestamps and invocation IDs must therefore be attached before scheduling and immediately before `ctx.ui.notify`, not inferred from promise completion alone. Existing graph evidence identifies `startPiEinUpdateNotice` and `renderPiEinUpdateNotice` as the relevant symbols.
- `ein-pi/agent/extensions/ein-paths.ts:8-32` resolves `AGENT_DIR` from `EIN_PI_AGENT_HOME` or `~/.pi/agent`, then reads `extensions-manifest.json` to populate `CORE_EXTENSIONS`, with a hardcoded fallback containing `ein-banner.ts`. The graph shows `CORE_EXTENSIONS` is consumed by doctor code, not a proven runtime loader; do not treat this constant as evidence that Pi loads the extension.
- `installer/src/core/verify.ts:100-123,221-223` independently reads the extension manifest and verifies expected extension files. This is deployment/inventory evidence, not proof of the active Pi process's discovery list or load count.
- `tests/ein-banner-updates.test.ts:231-330` covers the notice helper in isolation: detector failures are swallowed, the isolated `pi-ein` path can notify exactly once, and vanilla Pi is skipped. These tests do not observe module evaluation, extension registration, Pi's renderer, or a real startup session, so they cannot distinguish duplicate loading from duplicate presentation.

## Hypotheses kept open

1. **One extension instance / one startup invocation / one notify call, rendered twice.** This points to Pi UI notification presentation, a terminal redraw, or another downstream renderer path. A single `ctx.ui.notify` count is necessary but not sufficient: record visible presentation count independently.
2. **Two independently loaded extension instances or registrations.** Each instance may register `session_start`; both can invoke the notice and produce separate `ctx.ui.notify` calls. Two invocations from one loaded module (for example, duplicate event delivery) are a third case and must not be mislabeled as duplicate module loading.

## Evidence plan for the later investigation

Capture one reproducible startup session in a PTY with a stable session key, wall-clock/monotonic timestamps, PID/PPID, cwd, Pi version, `AGENT_DIR`, `EIN_PI_AGENT_HOME`, and the resolved extension file realpath. Add temporary/non-behavioral provenance at these boundaries only (later phase; no behavior change in this map):

- module evaluation: `moduleInstanceId`, module URL/realpath, PID, timestamp;
- extension export/registration: `extensionInstanceId`, registration count, event name, session key;
- `session_start` handler entry: handler invocation ID, instance ID, event timestamp, `ctx.hasUI`, CLI-filter result;
- immediately before `startPiEinUpdateNotice` and immediately before `ctx.ui.notify`: invocation ID, detector ID, notice decision, normalized message digest, notification call ID, session key;
- renderer/PTY capture: each visible startup presentation's timestamp, process/session provenance, output digest, and whether it was a notification overlay or a banner redraw.

Build a per-session count table with at least `moduleEvaluations`, `extensionRegistrations`, `sessionStartInvocations`, `detectorRuns`, `notifyCalls`, and `visiblePresentations`, preserving IDs and parent links rather than relying on counts alone.

Interpretation gates:

- `moduleEvaluations=1`, `registrations=1`, `sessionStartInvocations=1`, `notifyCalls=1`, `visiblePresentations=2` supports duplicate downstream rendering/redraw.
- Two distinct module/registration/instance IDs, with one matched invocation and notify call per instance, supports duplicate extension loading.
- One module ID with two handler invocations supports duplicate event delivery/registration rather than duplicate module evaluation.
- A single notify call with two output digests requires checking renderer/PTY capture and terminal redraw before changing extension behavior.

Also capture the actual Pi startup arguments/configuration and the extension discovery result for the session. Compare that with the deployed `extensions-manifest.json`, the effective `AGENT_DIR`, and any other extension directory/package surface. This is the missing evidence needed to prove whether the runtime discovers `ein-banner.ts` once or through multiple surfaces; the manifest and doctor checks alone cannot prove it.

## Follow-up mapping targets

- Runtime-owned Pi extension discovery and registration implementation/configuration, including all extension roots/packages passed at startup.
- The complete `startPiEinUpdateNotice` implementation and both graph-reported call edges; reconcile the graph's two-caller report with the direct source search showing one call expression in the banner.
- Pi `ctx.ui.notify` implementation and the terminal renderer/redraw lifecycle.
- A real startup-session capture path and a fixture that preserves instance/invocation/render provenance without changing user-visible behavior.

## Non-goals and safeguards

- No diagnosis is assigned to either hypothesis.
- No behavior, source code, tests, scope artifact, configuration, or installer file was changed.
- No test, build, or typecheck was run. Unrelated dirty installer files must remain untouched.

## Skills

- `ein-discipline`: applied for bounded SDD mapping and artifact-only work.
- `vitest`: loaded but not exercised; map phase forbids running tests and no test implementation was requested.
- `nuxt-modules`: loaded but not applicable; this is a Pi extension/runtime investigation, not Nuxt module work.
- `ts-library`: loaded but not applicable; no package/API/build work is in scope.

ledger:
  reads:
    - path: "openspec/changes/duplicate-startup-output-investigation/scope.md"
      lines: "1-48"
      estimated_tokens: 700
    - path: "openspec/config.yaml"
      lines: "1-39"
      estimated_tokens: 500
    - path: "ein-pi/agent/extensions/ein-banner.ts"
      lines: "9-37, 246-324, 342-388, 435-440, 687-710"
      estimated_tokens: 2300
    - path: "ein-pi/agent/lib/ein-update-notice.ts"
      lines: "5-147 plus indexed startPiEinUpdateNotice/renderPiEinUpdateNotice symbols"
      estimated_tokens: 1500
    - path: "ein-pi/agent/extensions/ein-paths.ts"
      lines: "1-53"
      estimated_tokens: 500
    - path: "installer/src/core/verify.ts"
      lines: "72-123, 221-223"
      estimated_tokens: 900
    - path: "tests/ein-banner-updates.test.ts"
      lines: "231-330"
      estimated_tokens: 900
    - path: "ein-pi/agent/extensions/ein-brand.ts"
      lines: "1-128 (indexed import dependency only)"
      estimated_tokens: 700
    - path: "ein-pi/agent/extensions/ein-ai.ts"
      lines: "161-202, 246-277 (indexed adjacent lifecycle context only)"
      estimated_tokens: 500
    - path: "docs/roadmap-features-ein.md"
      lines: "1-80"
      estimated_tokens: 900
  webfetch_used: false
  webfetch_urls: []
  budget_consumed:
    tokens: 8000
    reads: 10

skill_resolution: paths-injected
