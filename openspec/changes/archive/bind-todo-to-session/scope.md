# Scope: bind-todo-to-session

**Change:** `bind-todo-to-session`  
**Phase:** scope  
**TDD:** strict (`openspec/config.yaml: strict_tdd: true`; execution belongs to apply/verify)  
**Artifact language:** English

## Scope packet

```yaml
scope: Bind the TODO/SDD overlay to the active Pi session rather than implicitly adopting the sole OpenSpec change from disk. Fresh sessions remain unbound, explicit intent binds and repaints immediately, and resuming the same Pi session restores only its saved binding while non-UI selection semantics stay unchanged.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000
```

## Problem statement

The interactive TODO overlay currently derives status from filesystem-only project state. Because `projectProjectState({ cwd })` may select the sole active OpenSpec change, a brand-new Pi session can display TODO for work that the user never selected in that session. The terminal dashboard also holds `focusedChange` only in controller memory, while create, picked resume, and continue-as-new take different launch paths; explicit change intent can therefore be lost before the Pi extension starts.

The correction introduces a separate UI authority: the selected change bound to the active Pi session. OpenSpec files remain authoritative for whether that change exists, is active, and what its phase/tasks are. Existing deterministic filesystem selection remains authoritative for CLI and other non-UI tools.

## Required decisions

- **UI selection authority:** the Pi session binding decides which change, if any, the overlay may render. Filesystem state validates and supplies that change's OpenSpec facts but cannot implicitly bind a fresh UI session.
- **Fresh create:** starts with no binding and no TODO unless explicit change intent accompanies the launch.
- **Picked resume:** resumes the existing Pi session and restores the binding persisted in that session's own entries.
- **Dashboard continue-as-new:** creates a new provider session but explicitly carries the focused/continued change through the launcher/runtime path so the new Pi session binds it.
- **Persistence seam:** use Pi's supported custom non-LLM-context entries (`pi.appendEntry()` and `ctx.sessionManager.getEntries()` on `session_start`); do not alter Pi core storage.
- **Immediate feedback:** explicit select/create/continue updates the session binding and repaints or clears the stable overlay widget in the same interaction, without waiting for a model turn or tool lifecycle completion.
- **Fail closed:** a missing, malformed, stale, closed, or otherwise invalid saved selection produces an unbound UI and clears the widget.
- **Isolation:** bindings belong to a specific Pi session and must not leak through project-global files, controller reuse, or another session's resume.

## Scope boundary

### In scope

- Define and carry explicit change intent across the `pi-ein`/terminal-app/runtime launch boundary without disturbing ordinary launcher delegation.
- Persist a valid selected-change identifier in the active Pi session through Pi custom entries and restore it on `session_start`.
- Make the overlay read session-bound selection, validate it against current OpenSpec filesystem state, and clear on absent/invalid selection.
- Add an immediate refresh path for explicit selection, creation, and continuation events while preserving lifecycle refreshes for later filesystem changes.
- Distinguish fresh create, picked resume, and dashboard continue-as-new behavior.
- Add focused Bun contract tests for launcher intent propagation, session persistence/restoration/isolation, fresh-session emptiness, fail-closed invalidation, and immediate repaint.
- Preserve current deterministic project/OpenSpec selection behavior for non-UI consumers.

### Candidate production seams for map to narrow

- `pi-ein/pi-ein.fish` — launcher argument/intent forwarding and ordinary invocation preservation.
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` — production launch planning, dashboard continue-as-new handoff, and launch argument/environment propagation.
- `ein-pi/agent/lib/runtime-session-adapters.ts` — typed launch intent/plan propagation for fresh create versus picked resume.
- `ein-pi/agent/lib/terminal-app-controller.ts` — focused change and the distinct continue/resume actions.
- `ein-pi/agent/extensions/ein-sdd-overlay.ts` — Pi session entry persistence/restoration, validation, clearing, and immediate widget refresh.
- A small deterministic session-binding module under `ein-pi/agent/lib/` only if map shows it reduces coupling and makes persistence/validation independently testable.
- `ein-pi/agent/lib/project-state.ts` only as an unchanged validator/explicit-selection dependency; changing `resolveActiveSelection()` semantics is prohibited.

### Candidate test seams for map to select

- `tests/surface-wiring.test.ts` for the Fish launcher contract and exact forwarding.
- `tests/runtime-session-resume.test.ts` and/or `tests/runtime-session-adapters.test.ts` for typed intent and launch-plan behavior.
- `tests/terminal-app-controller.test.ts` and `tests/terminal-app-driver.test.ts` for continue-as-new versus picked resume and focused-change propagation.
- `tests/sdd-overlay.test.ts` and `tests/sdd-overlay-repaint.test.ts` for custom entry persistence/restoration/isolation, fresh emptiness, invalidation, and same-interaction repaint.
- A new mirrored test file if map extracts a dedicated deterministic session-binding module.

### Non-goals

- Changing `resolveActiveSelection()` or sole-active-change semantics for CLI/tools.
- Automatically selecting the only active change in a fresh UI session.
- Redesigning the terminal dashboard or collapsing continue-as-new and picked resume into one action.
- Changing Pi core session storage or writing a project-global UI selection file.
- Altering OpenSpec phase/task authority or canonical change contents.
- Running tests, builds, typechecks, or implementing production behavior during scope.

## Acceptance criteria

1. A fresh Pi session launched without explicit change intent displays no TODO, including when exactly one active OpenSpec change exists on disk.
2. Explicitly selecting, creating, or continuing a valid active change binds it to the current Pi session and repaints the widget immediately.
3. Resuming a Pi session restores that session's saved valid change binding and displays its TODO without adopting another session's binding.
4. Two sessions for the same project can remain independently bound to different changes or unbound.
5. Dashboard continue-as-new carries its focused/continued change through the terminal app and runtime launch path into the new Pi session.
6. Picked resume continues to launch Pi with its existing session identifier and relies on that session's saved binding; plain fresh create remains argument-empty except for an explicit, validated intent transport selected by design.
7. Missing, malformed, stale, closed, or invalid saved changes clear the widget and are never replaced by the sole filesystem change.
8. Ordinary `pi-ein` delegation and isolated environment behavior remain intact.
9. CLI and non-UI tools retain existing explicit and sole-active-change deterministic selection semantics.
10. Focused Bun tests cover launcher propagation, persistence/restoration/isolation, fail-closed clearing, and immediate repaint; later verification also runs root typecheck.

## Mapping questions

- Identify the existing user interaction that constitutes explicit select/create/continue and the narrow event/callback by which it can notify the overlay immediately.
- Determine the smallest typed intent carrier that survives Fish launcher, terminal app parsing, launch-plan validation, and the Pi process without exposing arbitrary argv injection.
- Confirm the Pi custom-entry shape/version and deterministic rule when a session contains multiple binding entries (expected authority: latest valid entry, with an explicit clear representable).
- Confirm how current OpenSpec state distinguishes active from closed/stale/invalid for validation without invoking sole-change fallback.
- Verify whether dashboard-launched Pi traverses `pi-ein.fish` or launches the trusted executable directly; cover every real path rather than assuming one launcher edge.
- Preserve the stable widget identity and existing deduplication while allowing an explicit selection event to invalidate cached content and repaint synchronously.

## Accepted evidence and bounded ownership

- `pi-ein/pi-ein.fish:1-31` isolates Pi-Ein and delegates ordinary invocations.
- `ein-pi/agent/lib/runtime-session-adapters.ts:198-236` establishes empty argv for fresh create and `--session <uuid>` for picked resume under isolated environment.
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts:507-549` recomputes project state at production launch; dashboard continue creates a new provider session and injects a continuity brief.
- `ein-pi/agent/lib/terminal-app-controller.ts:61-65,134-187` keeps `focusedChange` controller-local and distinguishes continue from picked resume.
- `ein-pi/agent/extensions/ein-sdd-overlay.ts:35-72` reads filesystem-only status and refreshes on lifecycle completion events.
- `ein-pi/agent/lib/project-state.ts:797-842` permits explicit selection but otherwise auto-selects a sole active change.
- Pi supports custom non-LLM-context entries through `pi.appendEntry()` and restoration through `ctx.sessionManager.getEntries()` during `session_start`.
- Existing tests provide focused seams in `runtime-session-resume`, `runtime-session-adapters`, `terminal-app-controller`, `terminal-app-driver`, `surface-wiring`, and both SDD overlay suites.

## Behaviour delta and persisted-delta preflight

The initial complete persisted delta scan found no existing files under `openspec/changes/bind-todo-to-session/`; there were therefore no authoritative persisted delta bytes to preserve. This change observably alters fresh-session TODO visibility, explicit binding, resume restoration, continue-as-new propagation, invalidation, and repaint timing, so `spec_delta: none` would be invalid.

The canonical delta writer created and strictly validated `openspec/changes/bind-todo-to-session/specs/sdd-session-binding/spec.md` with six `ADDED` scenarios. That file is the declaration; no declaration block is present in this scope.

## Canonical OpenSpec context

No canonical domain hints or `openspec/specs/<domain>/spec.md` references were injected. Canonical usage is **0 files and 0 UTF-8 bytes**; there are no canonical paths, SHA-256 digests, or byte counts to preserve.

## Project SDD and testing configuration

Existing `openspec/config.yaml` was preserved. It declares `strict_tdd: true`, Bun runtime/test runner, and `bun test` for apply/verify. The curated `EIN.md` additionally establishes `bun run typecheck` at the root and a second installer typecheck only if installer files enter the mapped change. Scope ran no tests, typechecks, or builds.

## Skill applicability

- `ein-discipline`: applied to bounded SDD scope, strict phase boundaries, and explicit acceptance/non-goals.
- `architecture`: applied to separate session UI authority from filesystem OpenSpec authority and prefer the smallest typed boundary.
- `nuxt-modules`: skipped; this change affects Pi/Fish/TypeScript runtime integration, not a Nuxt module.
- `nuxt-content`: skipped; no content collection or CMS behavior is involved.
- `vue-best-practices`: skipped after stack confirmation; the affected terminal app uses Solid/OpenTUI and no Vue component is in scope.

## Risks and controls

- **Intent loss or injection:** adding an ad hoc flag/environment field can bypass launch-plan validation or disappear on one path. Control: map all launch edges and use one validated, typed intent contract with exact forwarding tests.
- **Cross-session leakage:** module globals or project files would bind unrelated sessions. Control: session entries are the sole UI-binding persistence and tests use multiple same-project sessions.
- **Stale binding masks reality:** a restored identifier may no longer be active. Control: validate against current explicit OpenSpec state and clear rather than falling back.
- **Delayed UI update:** relying only on lifecycle events reproduces the lag. Control: acceptance requires a direct same-interaction refresh plus lifecycle refresh for subsequent disk changes.
- **Selection regression:** changing shared project-state fallback could break tools. Control: treat it as a non-goal and add a non-UI preservation contract.
