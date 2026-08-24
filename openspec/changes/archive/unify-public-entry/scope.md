# Scope: unify-public-entry

**Change:** `unify-public-entry`
**Phase:** scope
**Lane:** micro
**TDD:** strict (explicit user choice; this phase records it only)
**Artifact language:** English

## Problem statement

The rename from "`ein` is the installer" to "`ein` is the app, `ein-install` is
the installer" started and never finished. The code already declares the new
hierarchy (`installer/src/core/command-names.ts:11-12`), but the surfaces still
tell the old story, and one of them actively refuses to work:

- `ein update` does not update. `parseTerminalAppArgs` classifies the five
  lifecycle verbs as `moved` and `runTerminalApp` prints "`ein update` ahora es
  `ein-install update`" and exits 2
  (`ein-pi/agent/surfaces/terminal-app-entrypoint.ts:73-83,301-307`). The user
  types a correct command, is told a different correct command, and types
  again. Meanwhile the app's own System view already spawns
  `["ein-install", "update"]` and `["ein-install", "doctor"]` internally
  (`terminal-app-entrypoint.ts:221,267`): the delegation exists, it just is not
  offered to the CLI.
- `ein-install` with no arguments opens a second interactive menu offering
  install / doctor / update / uninstall / restore (`installer/src/main.ts:171`,
  `installer/src/cli/menu.ts`). That duplicates the app dashboard and forces two
  visual grammars to be maintained for the same administration.
- `README.md:89-94` documents `ein install` / `ein update` as installer verbs,
  which is the world before the rename.

This is the same defect the dogfooding block A catalogued five times: correct
code behind a surface that says something else.

## Scope boundary

### In scope

- Make the lifecycle verbs (`install`, `update`, `uninstall`, `restore`,
  `doctor`) delegate from `ein` to `ein-install <verb>`: forward the remaining
  argv unchanged, inherit stdio, and propagate the child exit code.
- Retire the installer's interactive action menu. `ein-install` with no
  arguments becomes install, asking only for the runtime (Pi / Claude / Both),
  which is a real bootstrap decision. The non-TTY path keeps a bounded,
  non-hanging outcome.
- Keep `ein` with no arguments opening the dashboard, with launching the runtime
  as its first and most obvious action rather than one row among many.
- Align the told story: `README.md`, both binaries' help text, and the
  post-install messages describe one public entry (`ein`) with `ein-install` as
  bootstrap and repair hatch.

### Out of scope

- The C1 rename (`pi-ein` → `ein-pi`, `cc-ein` → `ein-cc`). It is deliberately
  the last unit of the 0.90 program: a wide rename over in-flight work turns
  every conflict into archaeology.
- Renaming the on-disk homes (`~/.pi-ein`, `~/.claude-ein`) or their environment
  variables, and any migration of user state.
- Merging the two binaries. `ein-install` must stay on `PATH` and independently
  runnable: if what is broken is `ein`, repair cannot be routed through `ein`.
- The installer's visual grammar (`@clack` in `installer/src/tui/`). That is the
  next unit.
- Changing what the dashboard *shows*; only the prominence of the launch action.

## Acceptance criteria

1. `ein update` (and `doctor`, `restore`, `uninstall`, `install`) executes
   `ein-install <verb>` instead of printing a redirection notice, forwards the
   remaining arguments unchanged, and exits with the child's exit code.
2. When `ein-install` cannot be found or cannot be spawned, the result is a
   bounded, explicit failure naming the missing command — never a silent exit 0
   and never a claim that the lifecycle operation succeeded.
3. `ein-install` with no arguments no longer offers an action menu; it installs,
   prompting only for the runtime. The non-TTY path stays bounded and does not
   hang.
4. No surface offers the lifecycle actions twice: the action menu is gone from
   the code, not merely hidden behind a flag.
5. `ein` with no arguments still opens the dashboard, and launching the runtime
   is its first action with a direct key.
6. `README.md`, the help output of both binaries, and the post-install messages
   name `ein` as the public entry and `ein-install` as bootstrap and repair;
   none of them documents `ein install` as the installer's own verb.
7. Strict TDD evidence (RED → GREEN → TRIANGULATE → REFACTOR) covers the
   delegation seam, its failure path, and the removal of the second menu.

## Evidence and likely seams

- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts:73-83` — `INSTALLER_VERBS`
  and the `moved` classification.
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts:301-307` — the notice that
  replaces the work, returning 2.
- `ein-pi/agent/surfaces/terminal-app-entrypoint.ts:221,267,543` — the existing
  spawn of `ein-install` from the System view, and the bounded spawn helper the
  delegation should reuse instead of inventing another.
- `installer/src/main.ts:171-172` — no-args dispatch to `runMenu()`.
- `installer/src/cli/menu.ts` — 102 lines: action prompt, runtime prompt, and
  the non-TTY guard. Only the runtime prompt survives.
- `installer/src/core/command-names.ts:11-12` — the hierarchy already declared.
- `tests/installer-runtime-menu.test.ts`, `tests/terminal-app.test.ts` — the
  contracts that currently fix the behavior being changed.
