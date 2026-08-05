# Tasks — installer-beta

status: ready
blocked_by: none

## // 001. Runtime flag/parser contract

- [x] 1.1 Add RED coverage for exact `--runtime pi|claude|both` parsing, Pi default, missing/flag-like/unsupported/repeated/inline/`-r` rejection, and side-effect-free failure.
  - skills: `ein-discipline`
  - why: Establishes the fail-closed CLI grammar before production parser work.
  - learn: A parser test must prove both accepted forms and rejected forms do not enter installation.
  - architecture: Keep runtime syntax ownership in `installer/src/cli/install.ts`; keep existing boolean flags unchanged.
  - avoid: Testing only successful values and allowing malformed input to silently select Pi.
  - verify: `bun test tests/installer-runtime-menu.test.ts` (RED evidence: new focused assertions fail for the missing behavior)

- [x] 1.2 Implement the smallest validated runtime target/parser contract in `installer/src/cli/install.ts` and any foundational type location explicitly required by the existing map, without invoking platform detection, Bun preparation, or target runners.
  - skills: `ein-discipline`, `architecture`
  - why: Creates the foundational contract consumers can depend on safely.
  - learn: Validate at the existing direct-install boundary and return structured failure before side effects.
  - architecture: The parser returns a validated `InstallTarget` or parse error; it does not own orchestration or runtime implementations.
  - avoid: Adding a command framework, schema library, strategy hierarchy, or parsing in `installer/src/main.ts`.
  - verify: `bun test tests/installer-runtime-menu.test.ts` (GREEN evidence: parser-focused tests pass)

- [x] 1.3 TRIANGULATE parser behavior against the mapped real entry-point/process assertions, then REFACTOR only names and seams that preserve the exact contract.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms unit-level parsing matches the executable boundary and keeps the foundational API minimal.
  - learn: Triangulation catches discrepancies between pure parsing and actual CLI argument forwarding.
  - architecture: `installer/src/main.ts` forwards the install remainder unchanged; `installer/src/cli/menu.ts` remains an explicit interactive caller.
  - avoid: Broadening unrelated argument validation or changing interactive menu behavior while refactoring.
  - verify: `bun test tests/installer-runtime-menu.test.ts tests/updater-cli-entrypoints.test.ts` (TRIANGULATE and REFACTOR evidence)

## // 002. Runtime target routing and orchestration

- [x] 2.1 Add RED coverage for direct default/Pi, Claude-only, and Both routing; explicit menu target precedence; one shared Bun preparation; Pi-before-Claude order; continuation and aggregate failure.
  - skills: `ein-discipline`
  - why: Proves consumers use the parser contract without replacing interactive authority.
  - learn: Orchestration tests should assert call order, call counts, and failure propagation independently of Docker.
  - architecture: Existing `getInstallTargets`, `prepareSharedBun`, `orchestrateInstall`, `runPiInstall`, and `runClaudeInstall` remain ownership seams.
  - avoid: Calling target runners from the parser or making Both stop after a Pi failure.
  - verify: `bun test tests/installer-runtime-menu.test.ts` (RED evidence: routing assertions fail before implementation)

- [x] 2.2 Route parsed runtime selection through `installer/src/main.ts` and `installer/src/cli/install.ts`, preserving `installer/src/cli/menu.ts` interactive selection, then implement only the existing orchestrator seam needed for selected-target execution and status aggregation.
  - skills: `ein-discipline`, `architecture`
  - why: Connects the validated contract to runtime behavior while preserving current target internals.
  - learn: Direct defaults belong at the direct execution seam; menu intent must win over that default.
  - architecture: `runInstall` resolves `explicitMenuTarget ?? parsedRuntime ?? "pi"`; target-specific runners retain install and cleanup semantics.
  - avoid: Synthetic menu arguments, duplicate Bun setup, or refactoring Pi/Claude internals outside scope.
  - verify: `bun test tests/installer-runtime-menu.test.ts` (GREEN evidence: focused routing/orchestration tests pass)

- [x] 2.3 TRIANGULATE with the mapped process/version entry-point tests and REFACTOR the routing seam without altering protected security, migration, launcher, or shell-RC behavior.
  - skills: `ein-discipline`, `architecture`
  - why: Ensures executable invocation and interactive behavior agree with deterministic orchestration evidence.
  - learn: Keep regression coverage at the boundary where arguments become installation work.
  - architecture: `installer/src/main.ts` owns entry/version routing; `installer/src/cli/install.ts` owns validation and resolution; `installer/src/cli/menu.ts` owns prompting/cancellation.
  - avoid: Treating process tests as a reason to broaden unrelated flags or runtime abstractions.
  - verify: `bun test tests/installer-runtime-menu.test.ts tests/updater-cli-entrypoints.test.ts` (TRIANGULATE and REFACTOR evidence)

## // 003. Pi + Claude real-binary E2E script/workflow preparation

- [x] 3.1 Add RED assertions/fixtures in `e2e/docker-test.sh` for four independent disposable scenarios: invalid, default Pi, Claude-only, and Both; valid scenarios must run twice and Both must prove Pi completion before Claude completion.
  - skills: `ein-discipline`, `github-workflow`
  - why: Defines clean-container, selection, ordering, and idempotency evidence before harness changes.
  - learn: Independent containers prevent prior runtime state from hiding cross-runtime leakage.
  - architecture: `e2e/docker-test.sh` is the real-binary E2E boundary; `e2e/Dockerfile.ubuntu` remains unchanged unless a minimal fixture-only need is proven.
  - avoid: One shared container, mocked network/package setup, or bypassing checksum/security protections.
  - verify: `./e2e/docker-test.sh` (RED evidence: new scenario assertions fail before preparation)

- [x] 3.2 Prepare only `e2e/docker-test.sh` (and, if strictly necessary, no more than the mapped minimal fixture adjustment in `e2e/Dockerfile.ubuntu`) to build once and run isolated rerunnable Pi/Claude scenarios with artifact absence, ordering, and duplicate-state checks.
  - skills: `ein-discipline`, `architecture`
  - why: Supplies compiled-binary, filesystem, package-manager, and integration evidence for the runtime selector.
  - learn: Repeating the same command in one container is the evidence for convergence, while separate containers prove selection isolation.
  - architecture: The harness owns scenario isolation and assertions; installer production code owns runtime semantics and safety.
  - avoid: Editing `.github/workflows/installer-release.yml`, weakening bootstrap checks, or making GitHub dispatch executable.
  - verify: `./e2e/docker-test.sh` (GREEN evidence: all four scenarios pass twice where valid)

- [x] 3.3 TRIANGULATE Docker results against focused orchestrator tests and REFACTOR only harness duplication/readability; record external dependency failures distinctly from installer regressions.
  - skills: `ein-discipline`, `github-workflow`
  - why: Prevents real-container evidence from masking order/failure semantics or network failures.
  - learn: Integration evidence complements deterministic tests; it does not replace them.
  - architecture: Docker remains a bounded executable boundary and does not become a second orchestrator.
  - avoid: Retrying indefinitely, publishing artifacts, or dispatching a workflow as part of apply.
  - verify: `bun test tests/installer-runtime-menu.test.ts && ./e2e/docker-test.sh` (TRIANGULATE/REFACTOR evidence)

## // 004. macOS version display contract

- [x] 4.1 Add RED coverage for Linux/Darwin `--version`, exactly one `ein-installer <INSTALLER_VERSION>` identity line, retained parseable `template-version <SemVer>`, and banner `v<INSTALLER_VERSION>` behavior.
  - skills: `ein-discipline`, `architecture`
  - why: Locks the cross-platform running-binary contract before touching display/build seams.
  - learn: Running-binary identity and embedded template identity are separate contracts and must remain separate.
  - architecture: `installer/src/core/version.ts` remains the sole public installer SemVer source; `installer/src/tui/banner.ts` consumes it; `installer/src/main.ts` keeps the version entry point.
  - avoid: Introducing a macOS-only constant or reading display version from package/installed markers.
  - verify: `bun test tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts` (RED evidence)

- [x] 4.2 Update `installer/src/main.ts`, `installer/src/tui/banner.ts`, and the mapped Darwin build path in `installer/scripts/build-all.ts` only as needed to preserve the shared version source and make native supported macOS output match Linux.
  - skills: `architecture`, `ein-discipline`
  - why: Makes the existing binary identity path explicit without changing asset selection or checksum behavior.
  - learn: Cross-compilation is preparation; native macOS execution is acceptance evidence.
  - architecture: Banner/version display owns presentation; embedded manifest probing remains independent with its existing fallback.
  - avoid: Editing `installer/install.sh`, checksum implementation, or adding a public display-version field.
  - verify: `cd installer && bun run bundle-template && bun run build:all -- darwin-x64 && ./dist/ein-installer-darwin-x64 --version` (GREEN evidence on supported native macOS runner)

- [x] 4.3 TRIANGULATE native macOS output and focused tests, then REFACTOR display code without changing recovery labels or template probing.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms platform parity and preserves the existing two-line version contract.
  - learn: A version refactor is complete only when both static tests and the produced binary agree.
  - architecture: Keep version identity centralized and presentation thin.
  - avoid: Claiming Linux cross-build alone proves macOS runtime behavior.
  - verify: `bun test tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts && cd installer && ./dist/ein-installer-darwin-x64 --version` (TRIANGULATE/REFACTOR evidence)

## // 005. 0.41.0 metadata and CHANGELOG preparation

- [x] 5.1 Add RED checks that `installer/package.json`, `installer/src/core/version.ts`, and newest root `CHANGELOG.md` entry disagree until all three authorized pointers are prepared as `0.41.0`.
  - skills: `release`, `ein-discipline`
  - why: Prevents partial version bumps and keeps release identity synchronized.
  - learn: Installer package, binary constant, and changelog must move together.
  - architecture: Metadata preparation is limited to `installer/package.json`, `installer/src/core/version.ts`, and `CHANGELOG.md`.
  - avoid: Touching lockfiles, tags, workflows, or publication configuration.
  - verify: `bun test tests/release-asset-contract.test.ts` (RED evidence before metadata update)

- [x] 5.2 Prepare `installer/package.json`, `installer/src/core/version.ts`, and `CHANGELOG.md` for verified `0.41.0` behavior only.
  - skills: `release`, `ein-discipline`
  - why: Aligns local release pointers without performing remote delivery.
  - learn: Changelog claims must be limited to behavior proven by this change's verification.
  - architecture: Release preparation stops at three local pointers; Bun remains the package manager.
  - avoid: Editing `.github/workflows/installer-release.yml`, tagging, pushing, dispatching, or publishing.
  - verify: `bun test tests/release-asset-contract.test.ts && cd installer && bun run typecheck` (GREEN evidence)

- [x] 5.3 TRIANGULATE all required focused/security checks and inspect the final diff for exact three-pointer alignment; REFACTOR metadata wording only if it remains evidence-backed.
  - skills: `release`, `ein-discipline`, `github-workflow`
  - why: Confirms preparation is complete before any separately authorized delivery gate.
  - learn: Local verification can complete SDD honestly without external publication.
  - architecture: No release workflow, tag, dispatch, or publication belongs in executable apply tasks.
  - avoid: Making GitHub E2E dispatch or release publication an apply checkbox.
  - verify: `bun test tests/installer-runtime-menu.test.ts tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts tests/release-asset-contract.test.ts tests/install-sh-checksum.test.ts tests/installer-safe-secret-writes.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deps-pi.test.ts tests/deps-hypa.test.ts && cd installer && bun run typecheck && ./e2e/docker-test.sh` (TRIANGULATE/REFACTOR evidence)

Post-verification delivery follow-ups (not executable apply tasks; explicit user authorization required):

- After verification, the user may explicitly authorize GitHub workflow dispatch and remote E2E/release delivery; no dispatch is part of this SDD checklist.
- After verification, the user may explicitly authorize tagging, pushing, GitHub release publication, and remote asset/checksum verification; no publication is part of this SDD checklist.
