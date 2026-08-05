status: complete
scope_status: bounded
change: installer-beta
phase: apply
skill_resolution: paths-injected

## // 001. Runtime flag/parser contract

- **Status:** complete for assigned group 001; groups 002–005 remain unchecked.
- **Tasks:** completed 1.1, 1.2, and 1.3 in `tasks.md`.
- **Changed:** `installer/src/cli/install.ts`; `tests/installer-runtime-menu.test.ts`.
- **Contract:** separated lowercase `--runtime pi|claude|both`; omitted runtime resolves to Pi; missing, flag-like, unsupported, repeated, inline, and `-r` forms fail with an allowed-values error before banner/platform/dependency/runtime work.
- **Entry points:** real `main.ts` process assertion confirms argument forwarding and side-effect-free rejection; interactive `menu.ts` target forwarding remains unchanged and authoritative.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Added parser/default/rejection assertions; `bun test tests/installer-runtime-menu.test.ts` failed 2 tests (runtime missing and malformed forms). |
| GREEN | Added validated parser, structured `InstallArgumentError`, Pi default, and early `runInstall` failure; focused test passed: 23/23. |
| TRIANGULATE | Added real `main.ts` invalid-runtime process assertion; focused runtime test passed 24/24. |
| REFACTOR | Guarded unchecked argument access; final focused + updater entry-point tests passed 27/27 and typecheck passed. |

- **Verification:** `bun test tests/installer-runtime-menu.test.ts`; `bun test tests/installer-runtime-menu.test.ts tests/updater-cli-entrypoints.test.ts`; `cd installer && bun run typecheck` — all passing.
- **Deviations:** none; no changes to later groups, Docker, workflows, metadata, release, or runtime runner internals.
- **Residual:** full orchestration/E2E/version/metadata work remains for later groups; no acceptance report claimed (normal apply mode).

## // 002. Runtime target routing and orchestration

- **Status:** complete for assigned group 002; groups 003–005 remain unchecked.
- **Tasks:** completed 2.1, 2.2, and 2.3 in `tasks.md`.
- **Changed:** `installer/src/cli/install.ts`; `tests/installer-runtime-menu.test.ts`; checklist/progress artifacts.
- **Routing:** `runInstall` now resolves explicit menu target before parsed runtime and Pi fallback; `main.ts` keeps direct argument remainder unchanged and `menu.ts` keeps explicit interactive target forwarding.
- **Orchestration:** existing target seam proves Pi/Claude selection, one shared Bun preparation, Pi-before-Claude ordering, continuation after Pi failure, and aggregate failure.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Added direct default/Claude/Both resolution and explicit-menu-precedence assertions; focused test failed because `resolveInstallTarget` was absent. |
| GREEN | Added the minimal resolution seam and wired `runInstall`; focused runtime suite passed 26/26. |
| TRIANGULATE | `bun test tests/installer-runtime-menu.test.ts tests/updater-cli-entrypoints.test.ts` passed 29/29, including real `main.ts` and menu boundary checks. |
| REFACTOR | Kept `main.ts`/`menu.ts` forwarding and interactive ownership unchanged; `cd installer && bun run typecheck` passed. |

- **Verification:** `bun test tests/installer-runtime-menu.test.ts`; combined runtime/updater focused tests; installer typecheck — all passing.
- **Deviations:** none; no Docker, workflows, release metadata, version bump, delivery, or protected runtime internals touched.
- **Remaining:** groups 003–005 (Docker E2E, macOS version display, and release metadata) remain for later apply phases; no acceptance report claimed (normal apply mode).

## // 003. Pi + Claude real-binary E2E script/workflow preparation

- **Status:** complete for assigned group 003; groups 004–005 remain unchecked.
- **Tasks:** completed 3.1, 3.2, and 3.3 in `tasks.md`.
- **Changed:** `e2e/docker-test.sh`; `e2e/Dockerfile.ubuntu` and `.github/workflows/e2e.yml` unchanged by design.
- **Harness:** builds the Linux binary/image once, then runs four independent `docker run --rm -i` containers: invalid, default Pi, Claude-only, and Both. Valid cases run twice in-container; selected surfaces, unselected artifacts, Fish launcher uniqueness, and converged managed-state digests are asserted. Both parses each pass for Pi completion before Claude completion. Failed install logs classify network signatures as `E2E_RESULT=BLOCKED` and other failures as installer regressions.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Pre-change shell contract assertion for `--runtime claude` failed (exit 1) because the old harness had no Claude scenario. |
| GREEN | Added scenario fixtures/assertions; `bash -n e2e/docker-test.sh` and shell contract checks passed. First Docker run exposed an stdin wiring defect, so no false pass was retained. |
| TRIANGULATE | Focused orchestrator/runtime test passed 26/26; real Docker runs exposed Pi settings whitespace churn and ANSI-prefixed order parsing, fixed by excluding formatter-only `settings.json` from byte digest and comparing `awk` record numbers. |
| REFACTOR | Final `timeout 180 ./e2e/docker-test.sh` passed all four scenarios and both reruns; final focused test passed 26/26. |

- **Verification:** `timeout 120 bun test tests/installer-runtime-menu.test.ts`; `timeout 180 ./e2e/docker-test.sh`; `bash -n e2e/docker-test.sh`; shell contract checks — all green.
- **E2E evidence:** invalid rejected before Bun/runtime state; default Pi selected with Claude artifacts absent; Claude-only selected with Pi artifacts absent; Both produced Pi then Claude completion on both passes. Existing default doctor, backup sidecar, manifest, and dry-run checks remain.
- **Workflow boundary:** no GitHub Actions dispatch, workflow edit, release, publication, version bump, or push performed.
- **Deviations:** no Dockerfile fixture was necessary; `settings.json` is excluded only from byte-for-byte rerun digest because Pi's package-manager formatter changes indentation while preserving the managed JSON contract.
- **Remaining:** groups 004–005 (macOS version display and `0.41.0` metadata) remain; overall apply status stays `partial`.

## // 004. macOS version display contract

- **Status:** complete for assigned group 004; group 005 metadata remains unchecked.
- **Tasks:** completed 4.1, 4.2, and 4.3 in `tasks.md`.
- **Changed:** `installer/src/core/version.ts`, `installer/src/main.ts`, `installer/scripts/build-all.ts`, `installer/src/tui/banner.ts` unchanged because it already consumed `INSTALLER_VERSION`; focused contracts in `tests/updater-cli-entrypoints.test.ts` and `tests/release-update-cli.test.ts`.
- **Contract:** `--version` centralizes exactly one running-binary identity line plus the independent parseable template-version line; banner remains `v${INSTALLER_VERSION}` except recovery; build target command is a pure seam covering Linux/Darwin cross-target injection without executing a Darwin binary.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Added exact identity-line counts, Linux/Darwin shared output/build-target assertions, and exact banner-version assertions; focused run failed before `versionOutputLines`/`compileCommand` existed. |
| GREEN | Centralized version output lines in `version.ts`, routed `main.ts` through it, and exposed the existing build target/entry command without changing asset selection; focused tests and installer typecheck passed. |
| TRIANGULATE | Focused updater/release tests passed 14/14; Darwin cross-compile of `main.ts` produced a Mach-O x64 artifact on Linux for static target verification, without native execution. |
| REFACTOR | Kept template probing and recovery labels unchanged; `build-all.ts` now guards execution when imported so the compile seam can be tested without running a build. |

- **Verification:** `bun test tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts`; `cd installer && bun run typecheck`; focused Darwin cross-compile/static Mach-O check — all green.
- **Deviations:** native macOS execution was unavailable and intentionally not claimed; no `0.41.0` bump, workflow dispatch, release, push, PR, or unrelated build was performed.
- **Remaining:** group 005 metadata preparation only; overall apply status remains `partial`.

## // 005. 0.41.0 metadata and CHANGELOG preparation

- **Status:** complete; all executable installer-beta tasks are checked.
- **Tasks:** completed 5.1, 5.2, and 5.3 in `tasks.md`.
- **Changed:** `tests/release-asset-contract.test.ts`, `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md`, and SDD checklist/progress artifacts.
- **Contract:** the release test reads package metadata, `INSTALLER_VERSION`, and the newest root changelog heading and requires all three authorized pointers to be exactly `0.41.0`.
- **Metadata:** changelog documents the verified runtime selector, isolated rerunnable Docker scenarios, version/banner behavior, checksum rejection, safe-secret writes, and Darwin version-source parity without claiming publication or native macOS execution.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Added the three-pointer `0.41.0` contract; focused test failed 1/9 with all current pointers still at `0.40.0`. |
| GREEN | Aligned the package version, `INSTALLER_VERSION`, and newest changelog heading; focused release test passed 9/9 and installer typecheck passed. |
| TRIANGULATE | Updater/release/asset tests passed 23/23; required focused/security suite passed 110/110; installer typecheck and `./e2e/docker-test.sh` passed. |
| REFACTOR | Kept metadata scope to the three authorized pointers plus contract/checklist artifacts; refined changelog claims to verified behavior. |

- **Verification:** `bun test tests/release-asset-contract.test.ts`; focused version tests; required focused/security suite; `cd installer && bun run typecheck`; `./e2e/docker-test.sh` — all green.
- **Deviations:** no lockfile, package-manager metadata beyond the authorized package version, workflow, tag, push, dispatch, publication, or commit was performed.
- **Residual:** native macOS execution remains unavailable in this environment and is not claimed; remote delivery remains explicitly out of scope.

## // 006. Verification remediation — stale README release fixture

- **Status:** complete; overall apply remains `complete` and all executable `installer-beta` tasks stay checked.
- **Corrective change:** updated the stale `0.40.0` changelog assertion/anchor to `0.41.0` in `tests/readme-release-ia.test.ts`; README release-link checks now track the existing published README link without changing README content.
- **Changed:** `tests/readme-release-ia.test.ts` and this progress record only. No production code, version pointers, README content, or unrelated tests changed.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Existing focused failure identified the stale `0.40.0` expectation after authorized `0.41.0` metadata preparation. |
| GREEN | `bun test tests/readme-release-ia.test.ts` passed: 7 tests, 67 expectations, 0 failures. |
| TRIANGULATE | The focused contract passes with prepared changelog/package/version metadata and the unchanged published README release link. |
| REFACTOR | Kept release-contract assertions intact while separating prepared local metadata from the README's already-published release reference. |

- **Verification:** `bun test tests/readme-release-ia.test.ts` — green.
- **Deviations:** none from the authorized remediation; no full suite, Docker, build, workflow dispatch, release, delivery, or verify-report edit performed.
- **Remaining:** none for this corrective apply slice.
