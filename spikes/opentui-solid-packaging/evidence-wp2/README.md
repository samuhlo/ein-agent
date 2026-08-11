# Work Package 2 Candidate Evidence: Work Unit 1

## Scope

This work unit adds a spike-local OpenTUI + Solid dashboard candidate. It reuses `createTerminalAppControllerFactoryForCwd`, renders immutable controller snapshots, translates OpenTUI keys once, and owns one alternate-screen renderer generation at a time.

No production path imports OpenTUI or Solid. `runTerminalApp` retains its exact interactive predicate and its static/non-TTY/`--once` renderer. Pi and Claude package selection still points at the existing source closures.

## Reproduce

```sh
bun install --frozen-lockfile
bun run check
bun run build:candidate
```

The explicit spike suite uses `@opentui/solid/preload`, as required for reactive Solid TSX in Bun tests. It covers fixed 40x10 and 100x40 frames, resize plus continued controller input, normalized keys, unsupported modifiers, snapshot cleanup, setup/render/launch/run failures, idempotent destruction, and Pi/Claude create/resume unavailable/exited ordering.

## Lifecycle Boundary

- The renderer factory fixes `screenMode: "alternate-screen"` and `exitOnCtrlC: false`.
- Controller `release` synchronously detaches the key listener and destroys the current renderer before launch or run.
- An unavailable launch invokes controller `resume`, which creates one fresh renderer/root/listener/subscription generation.
- Renderer destruction disposes the Solid root; `onCleanup` removes snapshot and resize subscriptions.
- Setup, mount, launch, and run failures converge on existing controller exit code `1`; normal quit and Ctrl+C exit `0`; exited runtimes preserve their code.

## Remaining Gate

Work Package 2 is not complete. A subsequent packaging-selection work unit must place the candidate behind the eligible production TTY selection point and select a controlled target binary through both Pi and Claude packaging. Until then, this candidate is independently runnable only from the spike build and no production migration is implemented.

## Rollback

Remove the dashboard candidate sources, candidate build script, WP2 cases/evidence, and the exported controller assembly helper. The WP0 lifecycle probe, production renderer, package manifests, and packaged selection remain otherwise unchanged.
