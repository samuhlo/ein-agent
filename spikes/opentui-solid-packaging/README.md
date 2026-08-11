# OpenTUI + Solid Packaging Spike

This removable Bun package proves dependency resolution, native embedding, standalone compilation, and spike-only Pi/Claude package layouts. Its WP0 lifecycle probe imports no EIN product code and changes no production installer or release asset.

The final [decision report](./decision-report.md) records **STOP and retain the legacy renderer**. The spike authorizes no production migration or candidate release.

It now also contains the first Work Package 2 work unit: a controller-backed dashboard candidate with deterministic rendering, key translation, resize reactivity, renderer-generation lifecycle, and Pi/Claude handoff tests. The candidate imports EIN controller assembly only from its isolated entrypoint; production routing and packaged Pi/Claude selection remain unchanged.

## Reproduce

```sh
bun install --frozen-lockfile --os="*" --cpu="*"
bun run check
bun run build
bun run build:candidate -- darwin-arm64
bun run inventory
bun run verify
```

The wildcard Bun install materializes every optional native package already pinned in `bun.lock`; it does not change the approved runtime matrix. Builds use `@opentui/solid/bun-plugin` and `Bun.build({ compile: { target, outfile } })`.

`build` remains the WP0 four-target lifecycle probe. `build:candidate -- <target>` accepts exactly `darwin-arm64`, `darwin-x64`, `linux-arm64`, or `linux-x64`, then writes `dist/ein-opentui-dashboard-<target>` and its versioned `.json` inventory. No production manifest, installer, or packaged command selects it; Pi/Claude package ingress remains pending.

## Target Contract

| Target | Native package | libc |
|---|---|---|
| `bun-darwin-arm64` | `@opentui/core-darwin-arm64@0.5.1` | N/A |
| `bun-darwin-x64` | `@opentui/core-darwin-x64@0.5.1` | N/A |
| `bun-linux-arm64` | `@opentui/core-linux-arm64@0.5.1` | glibc |
| `bun-linux-x64` | `@opentui/core-linux-x64@0.5.1` | glibc |

Linux builds define `process.env.OPENTUI_LIBC` as `glibc`. Musl packages remain locked upstream optionals but are not selected or claimed for EIN's four approved targets.

## Package Surfaces

`bun run inventory` stages each binary through a sibling temporary file, verifies SHA-256 and binary format/native markers, applies mode `0755`, and renames it into these removable layouts:

```text
staged/pi/<target>/template/bin/ein-opentui-solid-probe
staged/claude/<target>/payload/bin/ein-opentui-solid-probe
```

Each cell contains `inventory.json`; tracked copies live in `evidence/inventories/`. Ownership is spike-only, and rollback is deletion of the relevant cell or this directory. No production update, rollback, uninstall, or release behavior is invoked.

## Runtime Boundary

The bounded `--smoke` probe creates an alternate-screen renderer, renders a Solid marker, observes a programmatic resize, destroys the renderer, emits structured evidence, and exits. The PTY harness runs staged binaries with an isolated home, no Bun or Zig on child `PATH`, and blocked proxy endpoints.

Local cross-builds are inspection evidence only. Native acceptance comes only from matching host architecture execution. The isolated workflow uses explicit GitHub-hosted runner labels, fails if the observed host differs from the requested target, uploads evidence, and never publishes.

## Comparison Hypothesis

`verify` measures a runtime package-file closure containing the exact Solid/OpenTUI packages and selected native package. It is smaller when compressed than the standalone executable on the current host, but remains `partial`: consumers would also need an external Bun runtime and controlled package resolution. No install-time network alternative is accepted.

## Evidence

- `evidence/wp0-result.json`: machine-readable local result with `pass`, `partial`, `blocked`, and `not-run` semantics.
- `evidence/README.md`: concise local evidence boundary.
- `evidence/inventories/*.json`: eight deterministic surface/target inventories.
- `evidence/native-*.json`: native CI fragments, generated only on matching runners.
- `evidence-wp1/README.md`: renderer/controller extraction evidence.
- `evidence-wp2/README.md`: first dashboard-candidate work-unit evidence and remaining packaging boundary.
