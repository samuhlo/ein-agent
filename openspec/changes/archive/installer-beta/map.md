status: partial
scope_status: bounded
change: installer-beta
phase: map
budget_exceeded: true

ledger:
  reads:
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/release/SKILL.md, lines: 1-58, estimated_tokens: 500 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/work-unit-commits/SKILL.md, lines: 1-88, estimated_tokens: 800 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/ein-discipline/SKILL.md, lines: 1-101, estimated_tokens: 1300 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/github-workflow/SKILL.md, lines: 1-275, estimated_tokens: 2800 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt-modules/SKILL.md, lines: 1-73, estimated_tokens: 750 }
    - { path: openspec/changes/installer-beta/scope.md, lines: 1-86, estimated_tokens: 1500 }
    - { path: openspec/specs/installer-runtime/spec.md, lines: 1-61, estimated_tokens: 650 }
    - { path: EIN.md, lines: 1-58, estimated_tokens: 550 }
    - { path: codegraph://status, lines: indexed-106-files, estimated_tokens: 180 }
    - { path: codegraph://explore/installer-cli-runtime-selection, lines: indexed-source, estimated_tokens: 2400 }
    - { path: codegraph://explore/runInstall-and-orchestrator, lines: indexed-source, estimated_tokens: 3000 }
    - { path: codegraph://explore/runInstall-body, lines: indexed-source, estimated_tokens: 2500 }
    - { path: codegraph://query/installer-cli-symbols, lines: query-result, estimated_tokens: 120 }
    - { path: codegraph://explore/runInstall-callees, lines: indexed-source, estimated_tokens: 2600 }
    - { path: codegraph://callees/runInstall, lines: call-list, estimated_tokens: 180 }
    - { path: codegraph://explore/runInstall-fail, lines: indexed-source, estimated_tokens: 3100 }
    - { path: codegraph://explore/macOS-version-display, lines: indexed-source, estimated_tokens: 3000 }
    - { path: codegraph://explore/playBanner, lines: indexed-source, estimated_tokens: 1200 }
    - { path: codegraph://callees/playBanner, lines: call-list, estimated_tokens: 120 }
    - { path: codegraph://callers/banner-version, lines: call-list, estimated_tokens: 100 }
    - { path: tests/**, lines: grep-relevant-symbols, estimated_tokens: 650 }
    - { path: installer/src/core/deps.ts, lines: 1-165, estimated_tokens: 1800 }
    - { path: installer/src/core/version.ts, lines: 1-67, estimated_tokens: 500 }
    - { path: installer/package.json, lines: 1-23, estimated_tokens: 220 }
    - { path: installer/README.md, lines: 1-65, estimated_tokens: 700 }
    - { path: installer/install.sh, lines: 1-157, estimated_tokens: 1600 }
    - { path: CHANGELOG.md, lines: 1-100, estimated_tokens: 1500 }
    - { path: e2e/Dockerfile.ubuntu, lines: 1-21, estimated_tokens: 230 }
    - { path: e2e/docker-test.sh, lines: 1-64, estimated_tokens: 700 }
    - { path: .github/workflows/e2e.yml, lines: 1-25, estimated_tokens: 250 }
    - { path: .github/workflows/ci.yml, lines: 1-48, estimated_tokens: 500 }
    - { path: .github/workflows/installer-release.yml, lines: 1-91, estimated_tokens: 1000 }
    - { path: tests/installer-runtime-menu.test.ts, lines: 1-407, estimated_tokens: 4300 }
    - { path: tests/ein-banner-updates.test.ts, lines: 1-180, estimated_tokens: 1900 }
    - { path: tests/installer-safe-secret-writes.test.ts, lines: 1-620, estimated_tokens: 6800 }
    - { path: tests/install-sh-checksum.test.ts, lines: 1-550, estimated_tokens: 6200 }
    - { path: tests/release-asset-contract.test.ts, lines: 1-220, estimated_tokens: 3000 }
    - { path: tests/installer-backup.test.ts, lines: 1-150, estimated_tokens: 1500 }
    - { path: tests/deploy-clean-managed.test.ts, lines: 1-65, estimated_tokens: 700 }
    - { path: tests/deps-pi.test.ts, lines: 1-35, estimated_tokens: 350 }
    - { path: tests/deps-hypa.test.ts, lines: 1-30, estimated_tokens: 300 }
    - { path: tests/release-update-cli.test.ts, lines: 280-320, estimated_tokens: 500 }
    - { path: tests/updater-cli-entrypoints.test.ts, lines: 1-72, estimated_tokens: 900 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 47000, reads: 45 }

# Map: installer-beta

## Scope and fixed order

This map is bounded to the installer runtime-selection seam, focused Pi/Claude E2E surfaces, the macOS binary/banner version path, and the three `0.41.0` release metadata pointers. The fixed apply order is:

1. Runtime flag: `ein install --yes` plus exactly `--runtime pi|claude|both`; omitted runtime retains Pi-only behavior; invalid values fail before an install path.
2. Pi+Claude E2E coverage: default Pi, Claude-only, ordered Both, and runtime-boundary failure propagation.
3. macOS version display: running binary SemVer and the existing template-version probe remain consistent with Linux.
4. Release metadata: align `installer/package.json`, `installer/src/core/version.ts`, and root `CHANGELOG.md` for `0.41.0`.

GitHub workflow dispatch, tagging, remote delivery, asset verification after publication, and release publication are explicitly outside apply. The release workflow is mapped only as a read-only contract surface; no dispatch, tag, `gh release`, or publication action belongs to this change phase.

## 1. Parser and runtime-selection seam

### Exact symbols and files

- `installer/src/main.ts`
  - `main(argv)`: routes `install` to `runInstall(rest)`, `--version` to `printVersion()`, internal updater entry points before the command switch, and no arguments to `runMenu()`.
  - `printVersion()`: emits `ein-installer <INSTALLER_VERSION>` and `template-version <bundledTemplateVersion()>`.
  - `bundledTemplateVersion()`: reads the embedded manifest through `readBundledManifest()` and falls back to `INSTALLER_VERSION`.
- `installer/src/cli/install.ts`
  - `InstallFlags`: currently contains `yes`, `noEngram`, `noSecrets`, `noLinear`, `noHypa`, `noCodegraph`, and `dryRun`; there is no runtime field in the current parser contract.
  - `InstallTarget = "pi" | "claude" | "both"` and `RuntimeInstallTarget = Exclude<InstallTarget, "both">` are the target vocabulary already present.
  - `RuntimeInstallResult`, `InstallResult`, `InstallTargetRunner`, and `InstallOrchestratorOptions` are the injectable result/runner contracts.
  - `parseInstallFlags(args)`: recognizes boolean flags and `-y`/`--yes`; it does not yet parse `--runtime <value>` or reject unsupported runtime values.
  - `confirm(message, flags, fallback)`: `--yes` bypasses prompts and returns the supplied fallback.
  - `getInstallTargets(target)`: returns `["pi"]`, `["claude"]`, or `["pi", "claude"]`; Both's order is already explicit.
  - `prepareSharedBun(deps, flags)`: resolves Bun once before target execution.
  - `orchestrateInstall(target, options)`: invokes shared Bun preparation once, invokes each selected runner exactly once in `getInstallTargets` order, continues to later targets after a runner failure/throw, and aggregates `ok` plus per-target results.
  - `runPiInstall({ platform, flags, skipLinear, deps })`: current Pi target path, including dependency prompts, migration gating, isolated context resolution, deployment, launcher, settings/packages, secrets/RC, marker, doctor/report work.
  - `runClaudeInstall(...)`: Claude target runner exercised by the existing runtime-menu test; it stages the cc-ein payload, invokes the required sync through Bun, installs the Claude Fish launcher only after sync succeeds, and cleans the staging root.
  - `runInstall(...)`: the direct-install seam called by `main`; the current indexed call path still includes direct Pi-era work (`checkDeps`, `installBun`, `installPi`, deployment, backup/rollback, doctor/report), so this is the boundary that must reconcile CLI parsing/defaulting with the target orchestrator without replacing the interactive path.
- `installer/src/cli/menu.ts`
  - `RUNTIME_PROMPT_OPTIONS`: exact interactive values `pi`, `claude`, and `both`.
  - `selectInstallTarget(prompt, isCancel)`: preserves the interactive runtime menu and cancellation behavior.
  - `RunMenuOptions`: injects `runtimePrompt` and a two-argument `runInstall(args, target)` seam for tests.
  - `runMenu(options)`: non-TTY guard exits before prompting; interactive install forwards the selected target once. This is not to be replaced by the non-interactive flag.

### Current call paths

- Direct CLI: `main(process.argv.slice(2))` -> `runInstall(rest)` -> `parseInstallFlags` -> platform/dependency discovery -> current install orchestration/deploy/report path.
- Interactive CLI: `main()` -> `runMenu()` -> `selectInstallTarget()` -> `runInstall(args, target)`; the existing menu values and cancellation behavior are protected.
- Target order: `getInstallTargets("both")` -> `prepareSharedBun()` once -> Pi runner -> Claude runner; `orchestrateInstall` deliberately continues to Claude if Pi reports failure and returns an aggregate failure.
- Pi dependencies and invariants: `runPiInstall` -> `installPi`/optional `installEngramDep`, `installGh`, `installHypa`, `installCodegraph` -> `derivePiInstallPaths` -> `isValidInstallMarker`/`migrateLegacyPi` -> `resolvePiInstallContext` -> `snapshot`/`deployTemplate`/Fish launcher/package and settings work/`ensureContext7Export`/`writeMarker`/`runDoctor`.
- Claude dependencies and invariants: `runClaudeInstall` -> `stageCcEinPayload` -> `run(bunPath, ["cc-ein/sync.ts"], { cwd: stagedRoot, env: { HOME, CC_EIN_HOME } })` -> `installFishLauncher(..., "cc-ein.fish")` -> stage cleanup. Sync failure must prevent launcher installation and still clean staging.

### Parser/runtime boundary checks

The mapping target is a small CLI boundary, not a second installer architecture. The parser must distinguish omitted runtime (Pi default), the three exact values, and unsupported values before `runPiInstall` or `runClaudeInstall` can be entered. `--yes` must remain the prompt bypass and must not alter interactive menu selection. Existing checksum, safe-write, package-manager, isolated-agent, and legacy-migration behavior remain downstream regression invariants.

## 2. Pi+Claude E2E and Docker/workflow surfaces

- `e2e/Dockerfile.ubuntu`: Ubuntu `24.04`, installs only base `ca-certificates curl git unzip tar gzip`, creates non-root `dev` with Bash, and runs in `/home/dev`. It is the clean filesystem/package-manager boundary; it does not install Bun or Pi in the image.
- `e2e/docker-test.sh`: selects host architecture (`linux-arm64` or `linux-x64`), runs `installer` dependency install and `build:all -- <target>`, builds the Docker image, mounts the binary read-only, and currently exercises `ein --version`, default `ein install --yes --no-engram --no-secrets --no-linear`, doctor, reinstall/backup checks, manifest checks, and dry-runs. It currently has no Claude-only or Both runtime invocation, so it is the focused E2E expansion seam.
- `.github/workflows/e2e.yml`: manual-only `workflow_dispatch`; Ubuntu runner, latest Bun, and `./e2e/docker-test.sh`. Manual dispatch is an external action and remains outside apply.
- `.github/workflows/ci.yml`: PR/push quality gate on Ubuntu and macOS; installs installer deps, bundles the template, runs the Bun suite, then `cd installer && bun run typecheck`. It is the normal static/test verification path, not a release publication path.
- `installer/scripts/build-all.ts`: `TARGETS` contains exactly `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`, and `bun-linux-x64`; `main()` bundles template and cc-ein payload before compiling. Darwin targets are the supported macOS binary surfaces.
- `installer/install.sh`: detects Darwin/Linux and arm64/x64, selects the matching asset, downloads and strictly validates `checksums.txt` before chmod/move, then on non-TTY macOS prints the handoff rather than trying to reopen `/dev/tty`; the installed binary is run later by the user.

E2E setup must continue to use the existing Pi/Claude integration surfaces, Bun/package-manager assumptions, strict bootstrap checksums, safe secret/RC writes, Pi isolated-agent resolution, and legacy migration behavior. Docker setup must not bypass those contracts to make a scenario pass.

## 3. macOS version-display path

- `installer/src/core/version.ts`: `INSTALLER_VERSION` is the single public installer SemVer source and is also written into the Pi install marker by `writeMarker`.
- `installer/src/main.ts`: `--version` goes through `printVersion()`; the two-line contract is `ein-installer <SemVer>` plus `template-version <SemVer>`. `bundledTemplateVersion()` retains `readBundledManifest()` and only falls back to the binary constant on probe failure.
- `installer/src/core/deploy.ts`: `readBundledManifest()` reads the embedded template manifest; it is a required template-version probe, not a second public display version.
- `installer/src/tui/banner.ts`: `bannerVersionLabel(state)` uses `v${INSTALLER_VERSION}` for the running binary and `recovery required` for recovery state; `renderBanner`, `bannerStatic`, and `playBanner` feed the interactive/static banner. The banner must not read the prior marker as the running version.
- `installer/src/core/platform.ts`: `detectPlatform()` recognizes `darwin`, selects `brew`, and determines shell RC paths. It is the platform context around the installer, but version display itself is sourced from `INSTALLER_VERSION`/the embedded manifest.
- `installer/scripts/build-all.ts` plus `installer/install.sh`: Darwin assets are compiled and selected as `ein-installer-darwin-arm64`/`ein-installer-darwin-x64`; this is the macOS route from release asset to running `--version`/banner.

The macOS verification surface should prove the same installer SemVer as Linux while retaining the template-version line and existing banner contract. Do not introduce a separate public display-version constant.

## 4. Version/package/CHANGELOG/release surfaces

The three metadata pointers are currently `0.40.0` and must move together to `0.41.0` in the apply phase:

- `installer/package.json` -> top-level `version`; also drives `installer` scripts and dependency lock expectations.
- `installer/src/core/version.ts` -> `INSTALLER_VERSION`; consumed by `main` version output, updater identity/continuation, banner, and marker writes.
- root `CHANGELOG.md` -> new top release entry; the existing release text documents `installer-v*` tags and the unified installer/runtime version.

Release coupling:

- `installer/README.md` documents the same three-pointer alignment and canonical GitHub Actions publication flow.
- `.github/workflows/installer-release.yml` checks out a validated `installer-v<semver>` tag, typechecks, builds all four assets, runs the compiled cc-ein payload smoke, generates `dist/checksums.txt`, and calls `gh release create` with the four binaries, checksums, and `install.sh`. Its `workflow_dispatch` input and publish command are mapped for contract awareness only; dispatch, tagging, asset verification after publication, and publication are explicitly excluded actions.
- `tests/release-asset-contract.test.ts` statically pins the four asset names, build target shape, smoke-before-checksums order, dispatch tag validation, and publication argument set. It also ensures the workflow derives its title from `package.json` rather than an alternate display-version field.
- Release discipline requires the package version, `INSTALLER_VERSION`, and root changelog to remain the same SemVer; no local npm/GitHub publication is part of this change.

## Tests and regression dependencies

Focused existing tests and their mapped contracts:

- `tests/installer-runtime-menu.test.ts`: Fish launcher idempotency, cc-ein payload inventory/staging/cleanup, `runClaudeInstall` Bun sync ordering and failure propagation, interactive Pi/Claude/Both menu, non-TTY behavior, `getInstallTargets`, shared Bun preparation, ordered Both execution, continuation after one target fails, isolated Pi paths, legacy migration, conflict fail-closed behavior, marker/snapshot/rollback.
- `tests/updater-cli-entrypoints.test.ts`: real `main.ts --version` output with both installer and template SemVer lines; continuation identity and isolated deploy entry points.
- `tests/release-update-cli.test.ts`: running-binary banner/version labels and recovery label; `renderBanner`/static banner must use `INSTALLER_VERSION`, not the stored marker.
- `tests/release-asset-contract.test.ts`: release/build/workflow shape, four Darwin/Linux assets, compiled payload smoke ordering, validated dispatch input, checksums parser and asset selection.
- `tests/install-sh-checksum.test.ts`: real bootstrap process with guarded command fixtures; checksum download/format/uniqueness/mismatch failures must stop before chmod/move/publication, with fallback `shasum` behavior covered.
- `tests/installer-safe-secret-writes.test.ts`: atomic, restrictive, non-symlink secret writes and shell-RC writes; failure cleanup and destination preservation.
- `tests/installer-backup.test.ts` and `tests/deploy-clean-managed.test.ts`: backup/rollback and clean template deployment invariants used by install/reinstall E2E.
- `tests/deps-pi.test.ts` and `tests/deps-hypa.test.ts`: scoped Pi package-manager hint and optional hypa dependency contracts.

The existing runtime-menu test imports `runClaudeInstall` and the target orchestrator directly, making it the narrow unit seam for runtime-boundary behavior. The Docker script is the narrow real-binary seam for Pi/Claude integration. CI's macOS matrix supplies typecheck/test coverage but does not itself execute a compiled Darwin binary.

## Dependencies and blast radius

### Production dependency graph

- CLI/parser: `main.ts` -> `cli/install.ts` and `cli/menu.ts` -> `@clack/prompts`, platform detection, dependency checks, core execution, deployment, launcher, paths/migration, secrets, version, doctor, banner/theme.
- Pi path: `deps.ts` (`installBun`, scoped `installPi`, optional dependency installers) -> `exec.ts`; `install.ts` -> `deploy.ts`, `backup.ts`, `paths.ts`, `pi-migration.ts`, `secrets.ts`, `version.ts`, `verify.ts`.
- Claude path: embedded `cc-ein.fish` and `pi-ein` payload imports -> `cc-payload.ts` staging/materialization -> `exec.ts` Bun invocation -> `launcher.ts` Fish destination.
- Binary/release path: `build-all.ts` -> `src/main.ts` plus bundled template/cc-ein assets; `install.sh` -> released asset/checksum contract; release workflow -> four compiled targets and publication assets.

### Blast radius

- CLI behavior: `main.ts`, `cli/install.ts`, `cli/menu.ts`, and their direct runtime/menu tests; invalid runtime parsing can affect every install invocation.
- Pi regressions: isolated `~/.pi-ein/agent` resolution, valid legacy migration only, vanilla Pi non-migration, template deployment, package installation, secrets/RC safety, backup/rollback, doctor/report.
- Claude regressions: required `cc-ein/sync.ts` invocation, `CC_EIN_HOME`, launcher timing, payload staging and cleanup.
- Platform/release regressions: Darwin asset selection/cross-compilation, `--version` and banner identity, template-version probe, updater continuation identity, package/version/changelog synchronization, checksum asset names.
- Delivery/regression surfaces: Docker E2E, CI matrix, static release-contract tests, bootstrap checksum fixture. Workflow dispatch and release publication remain boundary-only and must not be treated as apply steps.

## Focused verification commands (for later apply/verify; none run in map)

1. Runtime boundary and existing integration contracts:
   - `bun test tests/installer-runtime-menu.test.ts`
   - `bun test tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts`
2. Release/build/static contracts:
   - `bun test tests/release-asset-contract.test.ts`
   - `cd installer && bun run typecheck`
3. Regression invariants:
   - `bun test tests/install-sh-checksum.test.ts tests/installer-safe-secret-writes.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deps-pi.test.ts tests/deps-hypa.test.ts`
4. Focused real-binary/E2E checks after implementation:
   - `./e2e/docker-test.sh` (Docker/network dependent; must exercise default Pi, Claude-only, and ordered Both cases after the scoped E2E update).
   - `cd installer && bun run bundle-template && bun run build:all -- darwin-x64` (compile the supported macOS asset).
   - On a supported macOS runner, `./installer/dist/ein-installer-darwin-x64 --version` and the interactive/banner surface should show the same `INSTALLER_VERSION` plus the retained `template-version` line.

No test suite, build, Docker run, workflow dispatch, tag, or release publication was run in this map phase. Recommend `sdd-design` next.
