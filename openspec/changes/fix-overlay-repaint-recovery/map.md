status: mapped
scope_status: bounded
change: fix-overlay-repaint-recovery
phase: map

# Map: overlay ordering boundary

## Scope interpretation

The repaint path and live `WORKING` updates are confirmed working and remain regression constraints. The defect is final terminal ordering: live async-subagent output must be above the TODO widget. The persisted delta is the corrected `active-subagent-output-precedes-todo` scenario; the scope artifact also records a provenance warning that an earlier stale delta must not be regenerated during this phase.

## Actual composition and ownership

- `ein-pi/agent/extensions/ein-sdd-overlay.ts` owns TODO widget key `ein-sdd`; it refreshes on `session_start`, `turn_end`, `tool_execution_end`, and `agent_end`, deduplicates unchanged content, and currently requests `{ placement: "aboveEditor" }`. No repaint or renderer-content change is in scope.
- Pi `InteractiveMode.init()` (`node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js`) constructs the dock in fixed cross-region order: pending messages, `statusContainer` (built-in WORKING), `widgetContainerAbove`, editor, `widgetContainerBelow`, footer. `setWidget` placement selects above/below containers; each container is a `Map`, so same-container rendering follows widget insertion order and there is no widget-priority API.
- Installed `pi-subagents` `SubagentFleetStatus` (`~/.pi-ein/agent/npm/node_modules/pi-subagents/src/tui/fleet-status.ts`) registers key `subagent-fleet-status` with `placement`; `resolveFleetViewPlacement` accepts only `aboveEditor`, otherwise defaults to `belowEditor`. `src/extension/index.ts` resolves `config.fleetViewPlacement` and passes it to the fleet component. This is the persistent fleet surface.
- The same package also owns the legacy async widget key `WIDGET_KEY` (rendered by `src/tui/render.ts` through `createAsyncJobTracker`). `renderWidget()` calls `ctx.ui.setWidget(WIDGET_KEY, ...)` without placement, therefore it uses Pi's default/below-editor region. `asyncWidget` controls whether this duplicate surface is populated.
- Ein owns the shipped integration boundary: `ein-pi/agent/settings.json`, plus the TODO placement request if needed. Installed dependency files and user-installed package files are read-only evidence, never edit targets.

## Narrowed implementation seam

The map supports a repository-owned configuration/placement combination rather than repaint changes:

1. Ship `subagents.fleetViewPlacement: "aboveEditor"` (or the equivalent accepted shipped subagents config field) so the persistent fleet row is in the above-editor region.
2. Resolve the duplicate legacy async surface explicitly: prefer disabling `subagents.asyncWidget` if the shipped contract permits it, because the legacy renderer has no placement option and otherwise remains below the editor. If it must remain enabled, its default-below placement must be included in the order contract and the TODO placement must be selected accordingly; configuration alone cannot put that legacy row into the WORKING/above side.
3. Verify whether TODO must move from `aboveEditor` to `belowEditor`. A fleet-above + legacy-disabled + TODO-below arrangement gives a cross-region guarantee independent of registration order. Keeping both fleet and TODO in `aboveEditor` is not deterministic because Pi has only insertion order within that container. Do not choose a same-container arrangement without a proof seam.

The smallest likely deterministic combination is therefore shipped fleet-above configuration, legacy-widget suppression, and TODO-below placement. This preserves repaint behavior while avoiding duplicate active rows. The apply/design phase must confirm the exact settings schema consumed by the installed package before selecting the final field names.

## Test seams to select

- Add a shipped-settings contract under `tests/` that parses `ein-pi/agent/settings.json` and asserts the selected fleet placement and duplicate-surface policy (`asyncWidget` if used). This should also assert no dependency-file edits are required.
- Extend `tests/sdd-overlay-repaint.test.ts` only to assert placement passed by the extension and preserve: startup repaint, unchanged-content deduplication, and no-UI no-call behavior. Existing fake UI currently ignores placement and must expose captured options for this contract.
- Extend `tests/sdd-overlay.test.ts` only if a stable placement constant/contract is introduced; no renderer-content assertions need changing.
- Installer production/tests are not in the blast radius: `installer/src/core/settings.ts` preserves only user-owned fields (`defaultProvider`, `defaultModel`, changelog, enabled models, packages), while shipped non-user settings are replaced from the template. `installer/src/core/deploy.ts` templates settings after extraction and merges only those user fields. Map does not justify installer edits unless a later test proves otherwise.

## Preserve / reject list

Preserve existing `painted` reset on session start, live refresh events, unchanged-content deduplication, stable `OVERLAY_KEY`, and `ctx.hasUI` guard. Reject changes to `renderSddOverlay`, repaint caching/lifecycle, Pi or `pi-subagents` installed sources, broad widget APIs, and speculative installer preservation changes.

## Risks and open decision for design

- The scope says `settings.json` supplies `subagents` configuration, while the installed package source also exposes an extension config loader; design must reconcile the runtime config path and prove the shipped field is actually consumed.
- Disabling the legacy widget changes which async surface is visible; tests must prove the fleet row remains live and no duplicate row undermines the visual contract.
- Same-container insertion order is not a guarantee. Any design retaining TODO and fleet in one region is rejected unless it adds a repository-owned cross-region proof.

## Ledger Contract

ledger:
  reads:
    - { path: openspec/changes/fix-overlay-repaint-recovery/scope.md, lines: 1-120, estimated_tokens: 2100 }
    - { path: openspec/changes/fix-overlay-repaint-recovery/specs/sdd-overlay/spec.md, lines: 1-14, estimated_tokens: 220 }
    - { path: ein-pi/agent/settings.json, lines: 1-48, estimated_tokens: 420 }
    - { path: ein-pi/agent/extensions/ein-sdd-overlay.ts, lines: 1-93, estimated_tokens: 1050 }
    - { path: tests/sdd-overlay.test.ts, lines: 1-220, estimated_tokens: 1900 }
    - { path: tests/sdd-overlay-repaint.test.ts, lines: 1-105, estimated_tokens: 1100 }
    - { path: installer/src/core/settings.ts, lines: 1-52, estimated_tokens: 520 }
    - { path: installer/src/core/deploy.ts, lines: 1-160, estimated_tokens: 1500 }
    - { path: installer/src/core/deps.ts, lines: 130-180, estimated_tokens: 450 }
    - { path: installer/src/core/template.ts, lines: 1-40, estimated_tokens: 300 }
    - { path: node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js, lines: 310-430, estimated_tokens: 1500 }
    - { path: /Users/samu/.pi-ein/agent/npm/node_modules/pi-subagents/src/tui/fleet-status.ts, lines: 1-610, estimated_tokens: 6200 }
    - { path: /Users/samu/.pi-ein/agent/npm/node_modules/pi-subagents/src/extension/index.ts, lines: 1-620, estimated_tokens: 5800 }
    - { path: /Users/samu/.pi-ein/agent/npm/node_modules/pi-subagents/src/runs/background/async-job-tracker.ts, lines: 1-620, estimated_tokens: 5900 }
    - { path: /Users/samu/.pi-ein/agent/npm/node_modules/pi-subagents/src/tui/render.ts, lines: 1-50, estimated_tokens: 450 }
    - { path: /Users/samu/.pi-ein/agent/npm/node_modules/pi-subagents/src/tui/render.ts, lines: 1640-1690, estimated_tokens: 500 }
    - { path: /Users/samu/.pi-ein/agent/npm/node_modules/pi-subagents/src/extension/config.ts, lines: 1-160, estimated_tokens: 1500 }
    - { path: /Users/samu/.pi-ein/agent/npm/node_modules/pi-subagents/src/shared/types.ts, lines: 1-1805, estimated_tokens: 12000 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 39810, reads: 18 }
  budget_exceeded: true

## Skill resolution

skill_resolution: paths-injected
- `ein-discipline` and `document-writer` applied.
- `vitest` skipped: repository uses `bun:test`.
- `nuxt` and `next` skipped: affected surface is Pi TUI, not web UI.
