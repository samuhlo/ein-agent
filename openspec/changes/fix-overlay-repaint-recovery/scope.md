# Scope: fix-overlay-repaint-recovery

**Change:** `fix-overlay-repaint-recovery` (name retained by user decision)  
**Phase:** scope  
**TDD:** strict (`openspec/config.yaml: strict_tdd: true`; execution belongs to apply/verify)  
**Artifact language:** English

## Scope packet

```yaml
scope: Correct the remaining terminal-layout defect so live async-subagent output appears in the active/WORKING region before the TODO overlay. Preserve the now-confirmed working repaint and WORKING-update behavior; do not redesign repaint recovery.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000
```

## User decision and problem statement

The repaint path and live `WORKING` behavior are confirmed functional. They are no longer the defect to solve. The remaining observable defect is ordering: while an async subagent is active, its live row appears below TODO instead of alongside the active/WORKING region above TODO.

The existing change name remains unchanged even though it no longer describes the corrected scope.

## Bounded ownership evidence

The composition is not owned by `renderSddOverlay`:

- `ein-pi/agent/extensions/ein-sdd-overlay.ts` owns the TODO widget and requests Pi placement `aboveEditor` through `ctx.ui.setWidget`.
- Installed `pi-subagents` 0.56.0 owns the async/fleet row. `src/tui/fleet-status.ts` registers widget key `subagent-fleet-status` with a configurable placement and defaults it to `belowEditor`; `src/extension/index.ts` resolves `config.fleetViewPlacement` and passes it to that component.
- Pi 0.84.1 owns final composition. `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js` builds the dock in this order: pending messages, `statusContainer` (the WORKING region), `widgetContainerAbove`, editor, `widgetContainerBelow`, footer. Within an extension-widget container, Pi renders `Map.values()` insertion order and exposes placement, but no widget-priority API.
- The repository-owned integration point is `ein-pi/agent/settings.json`, which already supplies the `subagents` configuration consumed by `pi-subagents`. The exact layout may also require changing the TODO widget placement in `ein-pi/agent/extensions/ein-sdd-overlay.ts` so the two independently registered widgets cannot fall back to registration order within one container.

Therefore, `pi-subagents` owns the active row and its placement option, Pi owns cross-region composition, and Ein owns the shipped configuration plus TODO placement request. The next map must verify the smallest repository-owned combination that guarantees the required order; it must not treat repaint caching as the implementation owner.

## Scope boundary

### In scope

- Configure the shipped Pi/`pi-subagents` integration so active async-subagent output occupies the active/WORKING side of the TODO boundary.
- If configuration alone cannot guarantee order, adjust only the TODO widget's placement request at the Ein extension boundary.
- Add deterministic contract coverage for final region/order composition and shipped configuration.
- Preserve existing repaint recovery, live WORKING updates, unchanged-content deduplication, stable widget identity, and no-UI behavior.
- Account for both persistent fleet status and the legacy async widget so duplicate active surfaces do not undermine the visual-order contract.

### Candidate allowed production/config files (map must narrow)

- `ein-pi/agent/settings.json` — repository-owned `pi-subagents` configuration.
- `ein-pi/agent/extensions/ein-sdd-overlay.ts` — only if TODO placement must change to guarantee order.
- Installer settings preservation/deployment code only if map proves the new shipped field would otherwise be lost during update; no speculative installer edits.

### Candidate test seams (map must select exact files)

- A shipped-settings contract under `tests/` that asserts the intended `subagents.fleetViewPlacement` behavior.
- Existing overlay contracts in `tests/sdd-overlay.test.ts` and `tests/sdd-overlay-repaint.test.ts` only for placement and repaint non-regression.
- Installer deploy/settings tests only if installer preservation is in the mapped blast radius.

### Non-goals

- Further repaint recovery, cache invalidation, or lifecycle retries.
- Rewriting `renderSddOverlay` content.
- Vendoring or directly editing installed `pi-subagents` or Pi package files.
- A general Pi widget-priority API or broad terminal-layout redesign.
- Modifying the existing dirty source, test, or documentation files during scope.
- Running tests, typechecks, builds, or verification during scope.

## Acceptance criteria

1. With `WORKING`, an active async subagent, and TODO content visible, the live async-subagent row appears before TODO and belongs visually to the active/WORKING side of the layout.
2. The order is deterministic and does not depend on which extension first inserts a widget key into Pi's internal map.
3. Startup repaint and live WORKING updates continue to function without a keypress.
4. Repeated unchanged TODO refreshes remain deduplicated after startup recovery.
5. No-UI contexts issue no overlay widget calls.
6. The shipped setting survives the supported install/update path if that path owns it.
7. No production edit is made to installed dependency files under `node_modules` or `~/.pi-ein/agent/npm/node_modules`.

## Persisted-delta preflight and required correction

The complete persisted delta set contains one file: `openspec/changes/fix-overlay-repaint-recovery/specs/sdd-overlay/spec.md`. It successfully parsed with the repository's strict `parseOpenSpecDelta` rules as one `ADDED` operation. Under the persisted-delta preflight contract, its exact bytes are authoritative and were preserved byte-for-byte; the canonical delta writer was not invoked.

That valid-but-stale delta still declares lost-startup-paint recovery and does not match the corrected user decision. If the preservation restriction is lifted by the owning workflow, the required replacement through `ein_openspec_delta_write` is exactly one `ADDED` operation in domain `sdd-overlay`:

- id: `active-subagent-output-precedes-todo`
- title: `Active subagent output precedes TODO`
- requirement: `The system MUST render live async-subagent output in the active/WORKING region before the TODO overlay while preserving functional repaint and no-UI behavior.`
- given: `An interactive session displays WORKING and TODO content while an async subagent is active.`
- when: `The terminal composes the active state and extension widgets.`
- then: `The live async-subagent output appears with the active/WORKING region before TODO, repaint and WORKING updates remain live, and no-UI contexts receive no overlay widget call.`

No `spec_delta: none` declaration is present because a behavior delta exists.

## Canonical OpenSpec context

No canonical domain hints or `openspec/specs/<domain>/spec.md` references were injected. Canonical usage is **0 files and 0 UTF-8 bytes**; there are no paths, SHA-256 digests, or byte counts to preserve.

## Project SDD and testing configuration

Existing `openspec/config.yaml` was preserved. It declares `strict_tdd: true` and Bun's test runner (`bun test`). Scope did not execute tests or typechecks. Later phases must use focused Bun tests, root `bun run typecheck`, and the installer typecheck only if installer files enter the final map.

## Skill applicability

- `ein-discipline`: applied for the bounded SDD scope, dirty-tree protection, and phase boundary.
- `architecture`: applied to identify ownership and keep the correction at the smallest repository-owned seam.
- `document-writer`: applied for clear, complete artifact prose.
- `vitest`: skipped because this repository uses `bun:test`, not Vitest.
- `gsap-timeline`: skipped because this is terminal composition, not animation sequencing.
- `nuxt`: skipped because the affected surface is Pi TUI integration, not Nuxt.

## Risks and controls

- **Same-container insertion order:** moving only the fleet widget to `aboveEditor` may still leave relative order dependent on registration timing. Control: acceptance requires a cross-region guarantee, not incidental map order.
- **Duplicate async surfaces:** fleet and legacy async widgets may both be enabled. Control: map both before selecting configuration.
- **Stale behavior delta:** the validated persisted delta describes the superseded defect and cannot be rewritten under the active preservation rule. Control: block downstream behavior work until the owning workflow resolves that provenance restriction.
