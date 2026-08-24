# Design: unify-public-entry

**Change:** `unify-public-entry`
**Phase:** design
**Lane:** micro
**TDD:** strict

## A. Proposal

Finish the rename by making the surfaces behave the way the code already
declares. Three edits, one story:

1. `ein <lifecycle-verb>` stops announcing a redirection and performs it.
2. `ein-install` with no arguments stops being a second dashboard and becomes
   what bootstrap actually needs: install, asking only for the runtime.
3. The dashboard puts launching first, and README and help text stop describing
   the pre-rename world.

## B. Spec

- `ein <install|update|uninstall|restore|doctor> [...]` MUST execute
  `ein-install <verb> [...]` with the remaining arguments unchanged, the
  terminal inherited, and the child's exit code propagated.
- When the delegated command cannot be started, the result MUST be a bounded
  failure that names the command and exits non-zero. It MUST NOT report success.
- `ein-install` with no arguments MUST install, prompting only for the runtime.
  It MUST NOT offer the lifecycle actions as a second menu.
- Without an interactive terminal, `ein-install` with no arguments MUST return a
  bounded outcome explaining the explicit flag instead of waiting on input.
- `ein` with no arguments MUST open the dashboard with the launch action first
  and reachable by its own key.
- The README, both binaries' help output, and the post-install messages MUST
  describe `ein` as the public entry and `ein-install` as bootstrap and repair.

## C. Decisions

### D1 — The delegation decision is pure; only the edge spawns

`parseTerminalAppArgs` already returns a discriminated union and is already
covered by pure tests. The `moved` case becomes `delegate`, and it carries the
full child argv rather than only the verb:

```ts
| { kind: "delegate"; command: string; argv: readonly string[] }
```

`runTerminalApp` executes it through an injected spawner. This keeps the
`[CORE]` boundary the repository already enforces: the decision of *what to run*
is computed and testable without a process; running it stays at the edge.

**Rejected:** spawning inside `parseTerminalAppArgs`. It would make the parser
untestable without a real binary and would put I/O in the one function that is
currently pure.

### D2 — Reuse the existing bounded spawn, do not invent a second one

`terminal-app-entrypoint.ts:543` already spawns with inherited stdio for the
System view's `ein-install` commands. The delegation reuses that helper. Two
spawn paths to the same binary with different semantics is how the two
grammars problem started in the first place.

### D3 — A missing `ein-install` is a named failure, never a silent success

If the spawn fails (`ENOENT`, permissions), the app writes an explicit line
naming the command it could not run and returns a non-zero code. This is the
fail-closed rule applied to a surface: an unavailable lifecycle operation is
reported as unavailable, never as done. Exit code 127 is used for "command not
found", matching shell convention, and the child's own code is propagated
otherwise.

### D4 — `install` stays in the delegated set

`ein install` reaching a machine that has `ein` means the app is already
deployed, so the verb means repair/reinstall and delegation is correct. The
bootstrap path — where `ein` does not exist yet — goes through `install.sh` and
`ein-install` directly and is untouched.

### D5 — The action menu is deleted, and the file stops lying about itself

`runMenu` is removed rather than hidden. `selectInstallTarget` survives, because
the runtime question is a real bootstrap decision, and `installer/src/cli/menu.ts`
is renamed to `installer/src/cli/runtime-prompt.ts`: a file called `menu.ts`
that holds no menu is the same defect this change exists to remove.

`main.ts` with no arguments calls the install path with the runtime prompt. The
non-TTY guard moves with it: without a TTY there is no prompt to answer, so the
command explains what to pass instead of hanging on a keypress that will never
arrive.

### D6 — Launching becomes the first row

`buildDashboard` keeps every row and every key binding; only the order changes,
so muscle memory for keys survives. "Arrancar Pi" moves to the first position,
which is also where the cursor starts. Answering the product question recorded
for this program: `ein` with no arguments still shows state before work, but the
work is the first thing under the cursor, not a row among nine.

## D. Success Criteria

Mapped to the scope's acceptance criteria:

| # | Proven by |
|---|---|
| 1 | Pure test: each of the five verbs parses to `delegate` with forwarded argv; edge test: the spawner receives `["ein-install", verb, ...rest]` and the exit code is propagated |
| 2 | Edge test: a spawner that throws `ENOENT` produces a named failure line and a non-zero code |
| 3 | `main.ts` no-args test: the install path runs and the runtime prompt is asked; non-TTY returns bounded without prompting |
| 4 | `runMenu` no longer exists in the tree; the action-prompt contract in `tests/installer-runtime-menu.test.ts` is replaced, not skipped |
| 5 | `buildDashboard` test: the first row is the launch action and retains its key |
| 6 | Text assertions over `README.md` and both help outputs |
| 7 | `apply-progress.md` carries RED → GREEN → TRIANGULATE → REFACTOR per group |

## Risks

- **The delegated child inherits stdio.** An interactive `ein-install` prompt
  driven through `ein` must still receive keystrokes; the System view already
  does this, so the risk is covered by an existing path rather than a new one.
- **Removing `runMenu` changes a documented entry.** Anyone typing `ein-install`
  expecting the action list now gets an install prompt. That is the intended
  retirement, and the help text has to say so plainly.
- **Test contracts fixing the old behavior must be rewritten, not deleted.**
  `tests/installer-runtime-menu.test.ts` and `tests/terminal-app.test.ts` assert
  today's menu and today's redirection notice. Replacing an assertion with its
  opposite is the change; removing the test is not.
