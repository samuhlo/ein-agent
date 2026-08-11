# Work Package 1 Controller Evidence

Status: **pass**

The terminal application now uses one renderer-neutral controller for static and interactive execution. The controller owns immutable model snapshots, key/action dispatch, rebuilds, setting rereads, and effect coordination. The legacy entrypoint still owns plain rendering, terminal modes, listeners, resize, and external handoff.

WP1 adds no OpenTUI or Solid imports, dependencies, TSX configuration, renderer selection, or production UI components. Work Package 2 has not started.

## Architecture Boundary

| Concern | Owner after WP1 |
|---|---|
| Model snapshot and subscriptions | `lib/terminal-app-controller.ts` |
| Existing transitions and view construction | `lib/terminal-app.ts` |
| Project, settings, sessions, system, runtime, and process authority | Injected entrypoint ports |
| Legacy painting and static routing | `surfaces/terminal-app-entrypoint.ts` |
| Raw mode, alternate screen, resize, and key listeners | `surfaces/terminal-app-entrypoint.ts` |
| OpenTUI and Solid | WP0 spike package only; no production integration |

## Behavior Evidence

| Check | Result |
|---|---|
| Controller, model, driver, and real PTY tests | 106 pass, 0 fail, 596 assertions |
| Immutable snapshots and subscriptions | Pass |
| Refresh keeps cursor and query while rebuilding evidence | Pass |
| Setting write followed by persisted-state reread | Pass |
| Pi/Claude launch and opaque session reference forwarding | Pass |
| Unavailable runtime release, resume, status, and continued input | Pass |
| Runtime/command exit propagation and thrown failure cleanup | Pass |
| Confirmation and cancellation semantics | Existing expectations unchanged and green |
| Static routing at 40 and 100 columns | Non-TTY, `--once`, and no-key output are byte-identical |
| Real PTY quit | One alternate-screen acquire/release pair; exit 0 |
| Real PTY unavailable runtime | Release/reacquire, status visible, clean quit |
| Real PTY runtime handoff | Release precedes runtime marker; exit 7 propagates |

Focused command:

```bash
bun test tests/terminal-app-controller.test.ts tests/terminal-app.test.ts tests/terminal-app-driver.test.ts tests/terminal-app-pty.test.ts
```

## Packaging Evidence

The Pi template copies the complete `agent/lib/` inventory, so the new controller is included automatically. The Claude payload's relative-import closure discovers the controller from `terminal-app-entrypoint.ts`; no manual inventory expansion is required.

Both generated archives contain the expected source:

```text
Pi:     lib/terminal-app-controller.ts
Claude: ein-pi/agent/lib/terminal-app-controller.ts
```

Both extracted payload roots compile independently with Bun. Each build reports 31 bundled modules, and both standalone binaries start with `--once --no-intro`. A direct `cmp` of their static output exits 0.

Packaging inventory tests: 41 pass, 0 fail, 145 assertions.

## Verification

| Command | Result |
|---|---|
| `bun run check` from `spikes/opentui-solid-packaging/` | 4 pass, 0 fail across all 3 spike-owned cases |
| `bun run typecheck` | Pass |
| `bun run typecheck` from `installer/` | Pass |
| Exact root `bun test` | 1,722 pass, 0 fail, 6,414 assertions |
| `bun run installer/scripts/bundle-template.ts` | Pass |
| `bun run installer/scripts/bundle-cc-ein.ts` | Pass; 873-file manifest |
| Extracted Pi and Claude standalone compilation | Pass; 31 modules each |
| Extracted Pi and Claude `--once` smoke and byte comparison | Pass |

WP0 tests use the isolated `.case.ts` and `.case.tsx` conventions. The spike package's `bun run check` explicitly executes both case globs, while root `bun test` discovers no spike cases and requires no OpenTUI/Solid runtime or JSX configuration. `tests/opentui-spike-test-isolation.test.ts` pins both sides of this contract.

`git diff --check` passes. `.atl/` remains the same pre-existing untracked path and was not read or modified.

## Rollback

Remove `ein-pi/agent/lib/terminal-app-controller.ts`, restore the previous orchestration block in `ein-pi/agent/surfaces/terminal-app-entrypoint.ts`, and remove the WP1 controller/PTY tests and this evidence directory. The test-isolation correction can be reverted independently by restoring the three WP0 test filenames and package scripts and removing `tests/opentui-spike-test-isolation.test.ts`. No domain module, package format, dependency, OpenTUI WP0 artifact, release metadata, or installed EIN state requires rollback.
