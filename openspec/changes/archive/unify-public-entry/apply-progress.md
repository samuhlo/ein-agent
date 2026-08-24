status: complete

# Apply progress: unify-public-entry

**Lane:** micro · **TDD:** strict

## Group 001 — `ein <verb>` delegates instead of announcing

- **RED** — `tests/terminal-app-driver.test.ts`: five new contracts replace
  "every old installer verb is redirected". 5 fail / 31 pass. The parser
  returned `{kind:"moved", verb}` and the app wrote a notice and returned 2.
- **GREEN** — `terminal-app-entrypoint.ts`: the union case becomes
  `{kind:"delegate", command, argv}` carrying the whole argv;
  `runTerminalApp` executes it through the existing injected `run` seam.
  36 pass / 0 fail.
- **TRIANGULATE** — covered in the same group by four independent axes: every
  verb delegates; extra arguments survive unchanged (`update --release-channel
  alpha`); the child's exit code is propagated (3, not 0); and both failure
  shapes — a spawner that throws and a child reporting 127 — produce a named
  failure rather than a silent success.
- **REFACTOR** — `productionRun` now returns 127 instead of 1 when the process
  never starts, so "the command is missing" is distinguishable from "the command
  ran and failed". The System view's spawns get the same honesty for free.

## Group 002 — the second menu is retired

- **RED** — `tests/installer-runtime-menu.test.ts`: the "Interactive runtime
  menu" block is rewritten as "Bootstrap runtime prompt" against
  `installer/src/cli/runtime-prompt.ts`. Module not found: 1 fail.
- **GREEN** — `runtime-prompt.ts` created with `selectInstallTarget` and
  `runBootstrapInstall`; `installer/src/cli/menu.ts` deleted; `main.ts` no-args
  dispatch points at the bootstrap install. 44 pass / 0 fail.
- **TRIANGULATE** — cancelling the runtime question installs nothing; a non-TTY
  run explains `--runtime` instead of hanging on a keypress; and a source-level
  contract proves `runMenu`, the action prompt, and `menu.ts` are gone from the
  tree rather than hidden behind a flag.
- **REFACTOR** — the file name stopped lying: a `menu.ts` holding no menu is the
  same defect this change exists to remove.

## Group 003 — launching is the first row

- **RED** — `tests/terminal-app.test.ts`: the first dashboard row must be the
  launch action, keep its own key, and answer Enter. 1 fail / 64 pass.
- **GREEN** — `buildDashboard` reorders "Arrancar Pi" and "Arrancar Claude Code"
  above "Continuar una sesión". Keys stay bound to their rows, so muscle memory
  survives. 65 pass / 0 fail.
- **TRIANGULATE** — the pre-existing contracts carry this: distinct hotkeys, no
  collision with global motions, and every hotkey reaching its own row all still
  pass after the reorder.
- **REFACTOR** — a comment records that the order is a product decision, not
  cosmetics, so a future edit does not "tidy" it back.

## Group 004 — one story on every surface

- **RED** — `tests/public-entry-story.test.ts` (new): README, installer help,
  and app help. 4 fail / 0 pass.
- **GREEN** — README documents `ein` as the single door with `ein-install` as
  bootstrap and repair hatch; the installer's help calls itself `ein-install`
  instead of `ein`; the app's help names the delegated verbs. 4 pass / 0 fail.
- **TRIANGULATE** — the contract also asserts the negatives: no "menú
  interactivo" in the command deck, no `uso: ein <` in the installer help, and
  no surface still introducing the installer as `ein`.
- **REFACTOR** — the dry-run outro now says `ein-install install`: it is the
  hatch talking about itself.

## Gates

- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.
- `bun test`: recorded in `verify-report.md`.
- Baseline before the change: 2493 pass / 0 fail, after
  `cd installer && bun run bundle-template:host`.
