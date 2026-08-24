# Scope: retire-work-mode

**Change:** `retire-work-mode`
**Phase:** scope
**Lane:** micro
**TDD:** strict (explicit user choice; this phase records it only)
**Artifact language:** English

## Problem statement

Ein has a two-valued "work mode" (`solo` / `team`) whose only real effect is
whether Linear is treated as the board (`ein-pi/agent/lib/mode.ts:18-20,114`).
The roadmap retires Team as a first-class mode: Solo + OpenSpec/git is the
normal contract, and Linear becomes an optional integration that is explicitly
enabled and never a parallel source of state.

Keeping a setting with two values where one is the answer in every real session
costs a visible choice in the settings surface, a directive branch in the
prompt, a gate in the skill registry, and a `/ein:mode` command — all to express
a boolean that is off.

## Scope boundary

### In scope

- Replace the work-mode concept with an explicit Linear integration switch,
  default off, expressed in one place and read by the existing consumers.
- Migrate persisted evidence honestly: an existing `{"mode":"team"}` resolves to
  Linear enabled, `{"mode":"solo"}` to disabled, and new writes use the new key.
  Corrupt or unreadable evidence keeps its current fail-closed handling.
- Update the surfaces that show or set the mode: project settings, the prompt
  directive, the banner label, the status line, the skill-registry gate, and the
  slash command.
- Keep `ein-linear` and every Linear tool exactly as they are. This change moves
  the switch, not the integration.

### Out of scope

- Renaming the on-disk config files (`.pi/ein/mode.json`,
  `~/.pi/agent/ein-mode.json`). They are user state; renaming them belongs with
  the same migration unit as the runtime homes, deliberately deferred.
- Removing, weakening, or rewiring any Linear capability.
- The C1 rename and the active-change selector.

## Acceptance criteria

1. With no configuration, Linear is disabled and the prompt directive says the
   board is local, with no Linear preflight.
2. A persisted `{"mode":"team"}` resolves to Linear enabled and a persisted
   `{"mode":"solo"}` to disabled, without rewriting the file to read it.
3. A new write persists the new key, and reading it back yields the same value.
4. Corrupt, unreadable, or absent evidence resolves to the disabled default and
   keeps its recorded provenance and observed-source list.
5. No surface offers a two-valued work mode: settings, status, banner, and the
   slash command speak about the Linear integration.
6. Every Linear tool and the `ein-linear` agent remain reachable and unchanged.
7. Strict TDD evidence per group.

## Evidence and likely seams

- `ein-pi/agent/lib/mode.ts` — the whole module: type, options, reader with
  provenance, writer, directive, and the interactive command.
- `ein-pi/agent/lib/project-settings.ts:44,62,87-92` — the visible setting.
- `ein-pi/agent/lib/persona.ts:80,100`, `project-directives.ts:22,82` — the
  prompt directive.
- `ein-pi/agent/extensions/ein-banner.ts:394`, `ein-ai.ts:849,1316,1884`,
  `ein-skill-registry.ts:409` — the surfaces.
- `ein-pi/agent/lib/workbench.ts:147,183-185`, `surfaces/workbench-entrypoint.ts:149`
  — the advisor reader.
- `tests/mode.test.ts`, `tests/skill-mode-gate.test.ts`,
  `tests/project-settings.test.ts` — contracts to rewrite, not delete.
