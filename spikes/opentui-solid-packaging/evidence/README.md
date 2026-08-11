# Work Package 0 Evidence

Status: **partial**

All four standalone artifacts build and all eight spike-only Pi/Claude inventories verify. Native runtime acceptance is limited to darwin-arm64 on this host; the other six cells remain `not-run`.

## Commands

`bun install --frozen-lockfile --os="*" --cpu="*"`
`bun run check`
`bun run build`
`bun run inventory`
`bun run verify`

## Proven Facts

- Direct packages are exactly `@opentui/core@0.5.1`, `@opentui/solid@0.5.1`, and `solid-js@1.9.12`.
- Linux artifacts compile for glibc with `process.env.OPENTUI_LIBC` defined as `glibc`; musl is not silently selected.
- The darwin-arm64 Pi and Claude staged executables ran in a real PTY with an isolated home, no Bun on `PATH`, blocked HTTP proxies, and no Zig requirement.
- The Solid marker, 47x13 resize event, renderer destruction, exit 0, executable mode, and SHA-256 were observed.
- The package-closure comparison is measured but remains partial because it requires an external Bun runtime and staged package resolution.

## Acceptance Boundary

Cross-compilation and inventory inspection are not native acceptance. See `wp0-result.json` for cell-level statuses, raw samples, sizes, and startup measurements. The dedicated workflow is manual/path-triggered, bounded, uploads evidence, and never publishes.
