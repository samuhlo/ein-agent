# Design: deterministic async-subagent and TODO ordering

## A. Proposal

### Intent

Place live async-subagent output on the active/WORKING side of the terminal before TODO by using separate Pi widget regions. Keep the working repaint, live WORKING updates, deduplication, and no-UI behavior unchanged.

### Scope

The change will ship `fleetViewPlacement: "aboveEditor"` and `asyncWidget: false` in `ein-pi/agent/extensions/subagent/config.json`, the repository-owned configuration file that `pi-subagents` loads as `<agent-dir>/extensions/subagent/config.json`. It will request `belowEditor` for the Ein TODO widget. This combination leaves the persistent fleet widget above the editor, suppresses the duplicate legacy async widget, and places TODO below the editor, so relative order cannot depend on insertion order within one widget container.

The change will not alter overlay content, repaint recovery, event registration, stable widget identity, dependency code, Pi's widget API, or installer preservation logic. `ein-pi/agent/settings.json` remains unchanged because its `subagents.disableBuiltins` field belongs to Ein's agent-discovery behavior and is not the configuration path consumed by `pi-subagents` for fleet placement or legacy-widget suppression.

### Affected areas

- `ein-pi/agent/extensions/subagent/config.json`: shipped `pi-subagents` fleet placement and legacy-widget policy.
- `ein-pi/agent/extensions/ein-sdd-overlay.ts`: TODO placement request only.
- `tests/subagent-widget-layout.test.ts`: deterministic shipped-configuration and cross-region ordering contract.
- `tests/sdd-overlay-repaint.test.ts`: TODO placement plus repaint, deduplication, and no-UI regression coverage.

Installer production code is outside the affected area. The installer clean-replaces the template-owned `extensions/` directory, while its user-setting merge applies only to selected fields in `settings.json`; therefore the repository-owned subagent config is already shipped on install/update.

### Risks

- Moving TODO below the editor changes its physical location even though its content and lifecycle remain unchanged.
- A future `pi-subagents` release could rename or reinterpret `fleetViewPlacement` or `asyncWidget`.
- Suppressing the legacy widget could hide async progress if the persistent fleet surface is disabled or stops receiving live state.

### Rollback

Revert the two added subagent configuration fields and restore the TODO placement to `aboveEditor`. No migration or installed-dependency rollback is required; the next supported deploy restores the repository template.

### Success criteria

- An interactive session with WORKING, a live async subagent, and TODO shows built-in WORKING first, the persistent fleet row in the above-editor region, and TODO in the below-editor region.
- Only the persistent fleet surface represents active async jobs; the legacy async widget is suppressed.
- Startup repaint, live WORKING changes, unchanged-content deduplication, stable TODO widget identity, and no-UI behavior remain unchanged.
- Tests prove the shipped config path and cross-region placement contract without relying on extension registration order.
- No file under `node_modules` or an installed Ein home is modified.

### Canonical OpenSpec context

No canonical `openspec/specs/<domain>/spec.md` references were supplied by scope or map. The selection is 0 files and 0 UTF-8 bytes, so there are no path, SHA-256, or byte-count entries. The current validated delta is `openspec/changes/fix-overlay-repaint-recovery/specs/sdd-overlay/spec.md` and describes the corrected active-subagent ordering behavior.

## B. Spec

### Requirement: deterministic active-output ordering

The system **MUST** render the persistent fleet widget in the above-editor region and the TODO widget in the below-editor region, so live async-subagent output precedes TODO independently of same-container insertion order.

**Scenario**

- **Given** an interactive session displays WORKING and TODO while an async subagent is active,
- **When** Pi composes built-in status and extension widget regions,
- **Then** WORKING and the live fleet row appear before TODO, with fleet and TODO in different widget containers.

### Requirement: one live async surface

The shipped integration **MUST** disable the legacy async widget while keeping the persistent fleet widget enabled, preventing a duplicate active row below the editor.

**Scenario**

- **Given** an async job is active under the shipped Ein configuration,
- **When** `pi-subagents` refreshes its live surfaces,
- **Then** the fleet row remains available and the legacy async widget is not populated.

### Requirement: preserve working overlay behavior

The system **MUST** preserve startup repaint, event-driven refreshes, unchanged-content deduplication, stable widget identity, and live WORKING behavior; only TODO placement may change.

**Scenario**

- **Given** the TODO content is unchanged across refreshes and a new session UI starts,
- **When** overlay lifecycle events run,
- **Then** session start repaints once, repeated unchanged refreshes do not repaint, and subsequent WORKING updates remain live without a keypress.

### Requirement: preserve no-UI behavior

The system **MUST NOT** issue an Ein TODO overlay widget call when the extension context has no UI.

**Scenario**

- **Given** an extension context with `hasUI` set to false,
- **When** an overlay refresh event runs,
- **Then** `setWidget` is not called.

### Requirement: ship configuration from the owned path

The system **MUST** define fleet placement and legacy-widget suppression in `ein-pi/agent/extensions/subagent/config.json`, and the supported install/update path **MUST** deploy that template-owned file without requiring edits to installed dependencies.

**Scenario**

- **Given** Ein is installed or updated from the repository template,
- **When** the managed `extensions/` directory is deployed,
- **Then** `<agent-dir>/extensions/subagent/config.json` contains the fleet-above and legacy-disabled policy.

## C. Decisions

### Cross-region ordering is the guarantee

Pi orders built-in status before the above-editor widget container and the below-editor container later. Within either widget container, Pi renders `Map` insertion order and exposes no priority. Fleet-above plus TODO-below is therefore the smallest deterministic order: it uses Pi's stable region boundary rather than extension registration timing.

### The persistent fleet surface owns live async status

`pi-subagents` keeps the fleet widget enabled and receives `aboveEditor` through `fleetViewPlacement`. Its legacy async tracker receives `asyncWidget: false`, which suppresses its unplaced, default-below widget. This avoids duplicate rows and does not change async execution or fleet state ownership.

### Configuration belongs in the extension config, not settings

`pi-subagents` loads `<agent-dir>/extensions/subagent/config.json`. Ein therefore changes the tracked template at `ein-pi/agent/extensions/subagent/config.json`. `ein-pi/agent/settings.json` is not used for these two package options and will not be changed. Because `extensions/` is installer-managed and replaced from the shipped template, no installer merge or preservation change is needed.

### Responsibility boundaries

- Pi owns final cross-region composition.
- `pi-subagents` owns fleet rendering, legacy async rendering, and interpretation of its config fields.
- Ein's shipped subagent config owns fleet placement and legacy-surface suppression.
- `ein-sdd-overlay.ts` owns only the TODO widget placement request and its existing refresh guards.
- `renderSddOverlay` owns TODO content and remains unchanged.
- Contract tests own the repository-level proof of shipped policy and placement; an interactive check owns final visual confirmation against the installed runtime.

### Alternatives rejected

- Keeping fleet and TODO both above the editor is rejected because same-container order depends on widget insertion timing.
- Leaving the legacy async widget enabled is rejected because it creates a duplicate default-below surface and weakens the ordering contract.
- Adding the fields under `settings.json.subagents` is rejected because that is not the package's runtime config path for these options.
- Editing Pi or `pi-subagents` under `node_modules` or an installed Ein home is rejected because those paths are dependencies, not repository-owned delivery surfaces.
- Reworking repaint caching, lifecycle events, overlay rendering, or adding a priority abstraction is rejected because the existing behavior works and the layout boundary already provides the required guarantee.

## D. Success Criteria

Acceptance requires all of the following observable checks:

- `tests/subagent-widget-layout.test.ts` proves that the shipped extension config enables fleet-above behavior, disables the legacy async widget, and combines with TODO-below into distinct ordered regions.
- `tests/sdd-overlay-repaint.test.ts` proves the TODO call requests `belowEditor` while startup repaint, same-session deduplication, and no-UI no-call behavior still pass.
- `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts` passes during focused verification.
- `bun test` and `bun run typecheck` pass during repository verification. Installer typecheck is not required unless implementation expands into installer files, which this design excludes.
- A manual interactive check with an active async subagent confirms a single live fleet row above TODO and confirms that repaint and WORKING updates need no keypress.
- The final diff contains no change to installed dependency paths, `renderSddOverlay`, repaint lifecycle logic, or installer production code.
