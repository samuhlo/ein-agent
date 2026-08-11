# Work Package 0 Evidence

Status: **pass**

All four standalone artifacts build, all eight spike-only Pi/Claude inventories verify, and all eight staged surface/target cells passed the lifecycle probe on native GitHub-hosted runners. The accepted aggregate is [workflow run 31509930916, attempt 2](https://github.com/samuhlo/ein-agent/actions/runs/31509930916) at commit `0f2fef5`.

## Native Matrix

| Surface | darwin-arm64 | darwin-x64 | linux-arm64 | linux-x64 |
|---|---:|---:|---:|---:|
| Pi | pass | pass | pass | pass |
| Claude | pass | pass | pass | pass |

Each cell ran its staged executable in a real PTY and recorded the Solid marker, the `47x13` resize event, renderer destruction, and exit 0. See [`native-run-31509930916-attempt-2.json`](native-run-31509930916-attempt-2.json) for job, artifact, runner, digest, binary, and runtime provenance.

> **GitHub metadata anomaly:** the attempt-2 run is terminal `completed/success`, and every linux-arm64 step through `Complete job` is `completed/success`, but job `93842036460` still reports `in_progress` with a null conclusion and completion time. That stale field is not counted as runtime evidence. The linux-arm64 PASS rests on the terminal run, complete successful step metadata, and strict validation of artifact `9108756833` from the native `linux/arm64` runner.

## Commands

`bun install --frozen-lockfile --os="*" --cpu="*"`
`bun run check`
`bun run build`
`bun run inventory`
`bun run verify`

## Proven Facts

- Direct packages are exactly `@opentui/core@0.5.1`, `@opentui/solid@0.5.1`, and `solid-js@1.9.12`.
- Linux artifacts compile for glibc with `process.env.OPENTUI_LIBC` defined as `glibc`; musl is not silently selected.
- All eight Pi/Claude staged executables ran natively in a real PTY with an isolated home, no Bun on `PATH`, blocked HTTP proxies, and no Zig requirement.
- Every raw record and inventory agrees on target and surface. Binary SHA-256, byte size, executable mode, native architecture, glibc selection, and the single aligned `@opentui/core-<target>@0.5.1` marker were validated.
- The package-closure comparison is measured but remains partial because it requires an external Bun runtime and staged package resolution.

## Maintenance Note

GitHub emitted a non-blocking Node.js 20 deprecation annotation for `actions/checkout@v4` and `actions/upload-artifact@v4`, which were forced onto Node.js 24. No workflow action versions were changed because this evidence update does not establish an official required upgrade.

## Acceptance Boundary

Cross-compilation and inventory inspection alone are not native acceptance. WP0 passes because native artifacts prove all eight runtime cells under the bounded, isolated workflow, which uploads evidence and never publishes.

WP0 proves package and runtime feasibility, not performance parity. The existing darwin-arm64 size and startup samples are candidate-only observations; baseline deltas and per-target threshold comparisons remain Work Package 3 follow-up and must not be inferred from this PASS.
