# Design: installer-beta

## A. Proposal

### Intent

Add a deterministic non-interactive runtime selector to the existing installer, prove Pi and Claude installation behavior through focused idempotent Docker coverage, make the running installer version contract explicit for macOS binaries, and prepare the three installer release pointers for `0.41.0`. The change keeps the current Bun-based package and installer architecture.

### Scope

**In scope**

- Direct installation grammar: `ein install --yes [--runtime pi|claude|both]`.
- Routing the parsed runtime through the existing `runInstall` and target orchestrator seams.
- Focused unit/process coverage plus clean-container Docker scenarios for default Pi, Claude-only, Both, invalid input, ordering, failure propagation, and rerun idempotency.
- The existing `INSTALLER_VERSION`-based `--version` and interactive-banner display on supported macOS binaries, while retaining the embedded template-version probe.
- Synchronized preparation of `installer/package.json`, `installer/src/core/version.ts`, and root `CHANGELOG.md` for `0.41.0`.

**Out of scope / non-goals**

- A new installer, target abstraction, package manager, test runner, or broad refactor.
- Changes to Pi isolated-agent resolution, legacy migration, Claude sync, launchers, secret writes, shell-RC writes, backup/rollback, or checksum rules except focused regression coverage.
- A separate macOS/public display-version field or removal of the template-version probe.
- Editing or dispatching the release workflow, tagging, pushing release metadata, publishing assets/releases, or post-publication asset verification. Those are separately authorized delivery gates after this change verifies.
- Any version target other than installer `0.41.0`.

### Affected areas

- Runtime boundary: `installer/src/main.ts`, `installer/src/cli/install.ts`; `installer/src/cli/menu.ts` remains the protected interactive caller.
- Runtime verification: `tests/installer-runtime-menu.test.ts` and the narrow real-entry-point/version tests already mapped.
- Real-binary E2E: `e2e/docker-test.sh`; `e2e/Dockerfile.ubuntu` remains the clean Ubuntu boundary unless a minimal fixture-only adjustment is proven necessary.
- Version display: `installer/src/main.ts`, `installer/src/tui/banner.ts`, Darwin targets in `installer/scripts/build-all.ts`, and focused version contract tests. `installer/install.sh` and checksum implementation are protected, not redesign targets.
- Release preparation: `installer/package.json`, `installer/src/core/version.ts`, and `CHANGELOG.md` only.

### Canonical spec context

The two scope-recorded references are authoritative; no additional domain spec is needed. Their combined size is 5,401 UTF-8 bytes, within the three-file/32 KiB limit.

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| `openspec/specs/installer-runtime/spec.md` | `2e124d82b7fe5e6cf2ca07ea9141caaf92140e4652afb0ffd47cfee5edcd801c` | 4079 |
| `openspec/changes/installer-beta/specs/installer-runtime/spec.md` | `9271e5503948c9b8d5bbb53c963aed3ffd16291b0d87b749395e0edb886c1419` | 1322 |

### Risks

- An ambiguous parser could silently fall back to Pi and install the wrong runtime.
- Docker scenarios are network-dependent and can confuse external dependency failure with installer regression.
- A Darwin cross-build can succeed on Linux without proving that the produced binary renders correctly on macOS.
- Updating only one release pointer can make binary identity, package metadata, and changelog disagree.

### Rollback

Revert the scoped parser/routing, focused tests/E2E assertions, and version-display changes as one bounded change. Revert all three `0.41.0` metadata pointers together to `0.40.0`; do not roll back only one pointer. No remote release rollback is required because dispatch, tagging, and publication are outside this change. Existing installed user data is not migrated or reformatted by this design.

### Success criteria

The change is acceptable when direct CLI selection is exact and fail-closed, interactive selection is unchanged, each clean Docker scenario succeeds twice without duplicate or cross-runtime artifacts, Darwin and Linux report the same running-binary SemVer contract, security regressions remain green, and all three release pointers read `0.41.0` before any separately authorized delivery action.

## B. Spec

### Requirement 1 — Exact runtime grammar and default

The system **MUST** accept at most one two-token runtime option, `--runtime pi`, `--runtime claude`, or `--runtime both`, after `ein install`. Values are lowercase and case-sensitive, and the option may be surrounded by existing boolean install flags. If `--runtime` is omitted, the system **MUST** select Pi. A missing value, a value beginning with `-`, a value outside the three allowed literals, a repeated `--runtime`, `--runtime=<value>`, or a short alias such as `-r` **MUST** fail with a nonzero exit, identify the runtime-option error and allowed values on stderr, and **MUST NOT** prepare Bun or enter either runtime installer. Unrelated existing flag behavior **MUST NOT** be broadened by this validation.

**Scenario**

- **Given** `ein install --yes` is invoked with an omitted, valid, malformed, repeated, or unsupported runtime option
- **When** install arguments are parsed
- **Then** omission resolves to Pi, exactly one separated valid literal resolves to that target, and every malformed or unsupported runtime form exits nonzero before any Pi or Claude path runs

### Requirement 2 — Selected target execution

The system **MUST** execute only the selected target once per installation attempt. `both` **MUST** prepare the shared Bun prerequisite once and invoke Pi before Claude; omitted runtime **MUST** preserve the current Pi-only behavior.

**Scenario**

- **Given** Bun preparation succeeds and direct installation selects Pi, Claude, Both, or omits the runtime
- **When** runtime orchestration begins
- **Then** Pi-only/default invokes only Pi, Claude-only invokes only Claude, and Both invokes Pi then Claude exactly once with one shared Bun preparation

### Requirement 3 — Runtime failure propagation

The system **MUST** return a nonzero installation result when shared Bun preparation or any selected runtime fails. If Pi fails after shared preparation during `both`, the existing orchestrator **MUST** still attempt Claude, retain both per-target results in Pi-then-Claude order, and report aggregate failure. If shared Bun preparation fails, neither target runner **MUST** start.

**Scenario**

- **Given** Both is selected, shared Bun preparation succeeds, Pi fails, and Claude can run
- **When** the orchestrator executes the selected targets
- **Then** Claude is still attempted after Pi, both results are reported in order, and the overall command exits nonzero

### Requirement 4 — Interactive selection remains authoritative

The system **MUST** retain the no-argument interactive menu choices Pi, Claude Code, and Both, including cancellation and non-TTY behavior. A target explicitly selected by the menu **MUST** reach `runInstall` without being replaced by the direct-command Pi default.

**Scenario**

- **Given** the interactive menu is opened in a TTY
- **When** the user selects a runtime target
- **Then** `runInstall` receives that target once and executes only its corresponding path or ordered paths

### Requirement 5 — Existing runtime behavior and idempotency

The Pi target **MUST** continue to use isolated-agent resolution, valid legacy-EIN migration, deployment, and `pi-ein.fish`; the Claude target **MUST** continue to run staged `cc-ein/sync.ts` with Bun before installing `cc-ein.fish` and clean staging on success or failure. Repeating the same selected installation **MUST** converge without duplicate launchers, duplicate managed shell blocks, or damage to unrelated content.

**Scenario**

- **Given** a clean supported environment completes a selected installation once
- **When** the same command is run a second time in that environment
- **Then** it succeeds with the same runtime ownership, preserves unrelated content, and leaves one current copy of each selected managed artifact

### Requirement 6 — Isolated real-binary E2E scenarios

The focused Docker E2E **MUST** build the existing Linux binary once and run independent disposable containers for parser rejection, default Pi, Claude-only, and Both so state cannot leak between scenarios. Each valid scenario **MUST** run its install command twice in the same container; Both **MUST** expose Pi completion before Claude completion on each pass. The invalid scenario **MUST** exit nonzero and leave neither runtime initialized.

**Scenario**

- **Given** one built installer binary and separate clean Ubuntu containers
- **When** invalid, default Pi, Claude-only, and Both cases run, with every valid case repeated in-place
- **Then** rejection is side-effect-free, unselected runtime artifacts are absent, selected artifacts exist, Both is ordered Pi then Claude, and second passes remain idempotent

### Requirement 7 — Security and filesystem invariants

The change **MUST NOT** weaken mandatory bootstrap checksum verification, safe atomic secret writes, safe atomic shell-RC writes, backup/rollback behavior, or refusal of symbolic/non-regular destinations. Docker setup **MUST NOT** bypass these protections to obtain a passing result.

**Scenario**

- **Given** malformed/mismatched checksums or unsafe secret/shell-RC targets
- **When** the existing protected operations are exercised after the runtime change
- **Then** they fail closed before asset execution/publication or unsafe mutation, with destination preservation and temporary-file cleanup unchanged

### Requirement 8 — Cross-platform installer version display

A supported macOS installer binary **MUST** identify the running binary as `ein-installer <INSTALLER_VERSION>` through `--version`, using the same `INSTALLER_VERSION` source and format as Linux. The interactive/static banner **MUST** continue to render `v<INSTALLER_VERSION>` except for the existing recovery label. The second `template-version <SemVer>` line **MUST** remain backed by the embedded manifest probe with its existing fallback; the system **MUST NOT** introduce another public display-version constant.

**Scenario**

- **Given** native supported macOS and Linux installer binaries are built from the same prepared source
- **When** each binary is invoked with `--version` and the banner label is rendered
- **Then** both identify the same running installer SemVer, macOS retains the banner contract, and the template-version probe remains separately available

### Requirement 9 — `0.41.0` metadata preparation

Before delivery, `installer/package.json` version, `INSTALLER_VERSION` in `installer/src/core/version.ts`, and the newest root `CHANGELOG.md` entry **MUST** all identify `0.41.0`. The changelog **MUST** describe only verified behavior in this bounded change. No lockfile, package-manager, release-workflow, tag, or publication mutation **MAY** be included as part of metadata preparation.

**Scenario**

- **Given** the bounded implementation has passed its local verification
- **When** release metadata is inspected
- **Then** the three authorized pointers agree on `0.41.0` and no release has been tagged, dispatched, or published

## C. Decisions

### 1. Parse at the existing direct-install boundary

`main` continues to pass the `install` remainder unchanged to `runInstall(rest)`. `runInstall` changes from a defaulted target parameter to an optional explicit target seam: it validates arguments first, then resolves `explicitMenuTarget ?? parsedRuntime ?? "pi"`. The menu continues to call `runInstall([], selectedTarget)`, so interactive intent wins without inventing synthetic CLI arguments. Supplying both an explicit internal target and a CLI runtime is treated as ambiguous and rejected.

Runtime parsing returns a validated target or a structured parse error before platform detection, banner playback, dependency discovery, Bun preparation, or runtime runners. Existing boolean fields stay in the same install-flags object; no schema library or new command framework is introduced.

**Trade-off:** validating only runtime-shaped syntax preserves the current treatment of unrelated arguments while preventing dangerous silent Pi fallback for malformed `--runtime` usage.

### 2. Reuse the target orchestrator

`getInstallTargets`, `prepareSharedBun`, `orchestrateInstall`, `runPiInstall`, and `runClaudeInstall` remain the ownership boundaries. Parsing selects an `InstallTarget`; it does not call runtime implementations. The orchestrator owns one-time Bun preparation, Pi-before-Claude ordering, continuation after a per-target failure, and aggregate status. Runtime runners continue to own their existing installation and cleanup semantics.

### 3. Keep interactive and direct selection separate

`cli/menu.ts` owns user prompting and cancellation. `cli/install.ts` owns direct argument validation and execution. The direct Pi default is applied only when no explicit menu target and no valid CLI runtime are present. This preserves no-argument TUI behavior and avoids coupling Clack prompts to parser validation.

### 4. Docker sequence is clean, independent, and repeatable

The E2E harness builds one host-architecture Linux binary and image, then uses separate `docker run --rm` invocations:

1. A rejection container proves malformed/unsupported runtime input exits nonzero before Pi/Claude artifacts exist.
2. A default-Pi container runs the omitted-runtime command twice, verifies isolated Pi marker/template/launcher and doctor behavior, and verifies Claude-owned artifacts are absent.
3. A Claude-only container runs `--runtime claude` twice, verifies Claude sync/home/launcher state, and verifies Pi marker/launcher state is absent.
4. A Both container runs `--runtime both` twice, captures output to assert Pi-before-Claude completion on both passes, verifies both runtime artifacts, and compares managed-artifact content/counts across passes.

The focused orchestrator test remains the deterministic authority for call order and injected failure propagation; Docker supplies real compiled-binary, package-manager, filesystem, and integration evidence. Network prerequisites remain real rather than mocked or security-bypassed.

### 5. macOS uses the existing binary identity path

`INSTALLER_VERSION` remains the sole public running-installer SemVer. Both Darwin assets continue to compile `src/main.ts`; `printVersion` emits it directly, and the banner imports the same constant. `bundledTemplateVersion()` remains the independent manifest probe/fallback because updater identity consumes both labels. Native execution on a supported macOS runner, not Linux cross-compilation alone, is the acceptance mechanism.

No change is made to `install.sh` platform asset selection, checksum parsing, checksum-before-chmod/move order, updater security, or release asset names. Version display happens only after the verified binary is installed/invoked.

### 6. Release preparation stops at three local pointers

The preparation boundary is exactly the package version, binary constant, and newest changelog entry. Bun remains the package manager and no npm publication occurs. After all success criteria pass, tagging/remote push or manual workflow dispatch requires separate explicit authorization; GitHub Actions publication and post-publication asset/checksum verification are a subsequent delivery gate, not implementation in this change.

### Responsibility boundaries

| Owner | Responsibility |
| --- | --- |
| `main.ts` | Route direct install arguments and expose the existing version entry point |
| `cli/install.ts` | Validate runtime syntax, resolve direct/default target, and invoke existing orchestration |
| `cli/menu.ts` | Interactive target choice, cancellation, and non-TTY behavior |
| Target orchestrator | Shared Bun prerequisite, target order, result aggregation, failure propagation |
| Pi/Claude runners | Existing target-specific install, safety, launcher, and cleanup semantics |
| Docker E2E | Real-binary selection isolation and rerun evidence |
| `version.ts` / banner / version probe | One running-binary SemVer plus retained template probe |
| Three metadata files | Local `0.41.0` preparation only |
| Later authorized delivery | Tag/dispatch, GitHub publication, and remote asset verification |

### Alternatives rejected

- **Parse `--runtime` in `main.ts`:** rejected because install-flag ownership already lives in `cli/install.ts` and would be split across layers.
- **Translate the flag into interactive prompt input:** rejected because non-interactive behavior must not depend on TUI machinery.
- **Add a second Pi/Claude installer or strategy hierarchy:** rejected; the existing functional orchestrator already provides the required seam and ordering.
- **Silently default malformed runtime input to Pi:** rejected because it can install the wrong target.
- **Run all Docker cases in one container:** rejected because previous target state would hide cross-runtime leakage and make omission/Claude-only assertions meaningless.
- **Use Linux cross-compilation as sole macOS proof:** rejected because it does not execute the Darwin binary.
- **Read display version from the installed marker, package JSON at runtime, or a macOS constant:** rejected because those can describe prior/template/package state rather than the running binary.
- **Alter checksum/bootstrap behavior to ease E2E:** rejected as a security regression and outside scope.
- **Prepare a tag or edit/dispatch the release workflow now:** rejected because remote delivery is explicitly post-verification and separately authorized.

### Skill applicability

- Architecture guidance applies: this design reuses the smallest existing functional seams and adds no speculative abstraction.
- Release guidance applies to three-pointer SemVer alignment and the prohibition on local publication.
- GitHub workflow guidance applies only as a hard delivery boundary; no Git/GitHub operation belongs to this artifact.
- Zod guidance is not applicable because no Zod schema or untrusted JSON boundary is introduced.
- Nuxt module guidance is not applicable because the installer is a Bun/TypeScript CLI, not a Nuxt module.

## D. Success Criteria

### Observable acceptance checks

| Area | Acceptable result |
| --- | --- |
| Runtime grammar | Omitted runtime selects Pi; exactly `pi`, `claude`, and `both` are accepted in separated form; missing, duplicate, inline, aliased, mixed-case, and unsupported forms exit nonzero before target work |
| Routing | Direct selection reaches `runInstall` parsing; interactive selection reaches the same execution seam as an explicit target and is not overwritten by the direct default |
| Orchestration | Pi/default, Claude, and Both invoke only selected paths; Both is Pi then Claude with one Bun preparation; failures aggregate to nonzero with existing continuation semantics |
| Docker | Independent clean cases run; each valid case passes twice; unselected artifacts stay absent and managed artifacts do not duplicate/change unexpectedly |
| Runtime invariants | Pi isolation/migration and Claude staged sync/cleanup/launcher contracts remain intact |
| Security | Checksum, secret-write, shell-RC, backup, and deployment regression contracts remain unchanged |
| macOS | A native supported Darwin binary prints `ein-installer 0.41.0`, retains a valid `template-version` line, and its banner uses `v0.41.0`; Linux has the same running-version contract |
| Metadata | The three authorized pointers are `0.41.0`; no release workflow, tag, dispatch, or publication action is part of the implementation |

### Required later verification commands

These commands are verification requirements for apply/verify; none are run in the design phase.

```bash
bun test tests/installer-runtime-menu.test.ts
bun test tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts
bun test tests/release-asset-contract.test.ts
bun test tests/install-sh-checksum.test.ts tests/installer-safe-secret-writes.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deps-pi.test.ts tests/deps-hypa.test.ts
cd installer && bun run typecheck
./e2e/docker-test.sh
```

On a supported x64 macOS runner, the native binary check is:

```bash
cd installer && bun run bundle-template && bun run build:all -- darwin-x64
./dist/ein-installer-darwin-x64 --version
```

The macOS output must contain exactly one running-installer identity line matching `ein-installer 0.41.0` and one parseable `template-version <SemVer>` line; the focused banner contract must contain `v0.41.0`. An arm64 runner uses the corresponding existing `darwin-arm64` target. Final diff inspection must show no behavioral change to `installer/install.sh` or `.github/workflows/installer-release.yml`, and no tag, workflow dispatch, or publication may occur without a new explicit delivery authorization after verification.
