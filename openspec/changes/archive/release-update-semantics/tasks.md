# Tasks — release-update-semantics

status: ready
blocked_by: none

> Reviewer forecast (production vs test reported separately; aggregated at the
> bottom). The 400-line production review budget is enforced by the Review
> Workload Guard during delivery — these ranges plan the work; they do not
> pre-authorize exceeding the budget. Each group below stays narrow enough to
> land as a focused apply batch and remains green with `bun test` on its
> dedicated file plus the existing `installer-backup`, `deploy-clean-managed`
> and `deploy-settings` suites.
>
> Test runner: `bun:test` (auto-discovered `*.test.ts` files; no `bunfig.toml`
> exists at repo root, no global runner is configured). `openspec/config.yaml`
> keeps `strict_tdd: false` and `test_command: ""` — focused regression tests
> still MUST land with each behavioral unit before the unit is "done", but the
> project does not require full red-green-refactor cycles per change. Typecheck
> stays `cd installer && bun run typecheck`. Production reviews run the
> `git diff --shortstat <base>..HEAD -- . ':(exclude)*.test.*' …` accounting
> from the delivery guard.
>
> Hard non-goals (carried from scope.md/design.md): no Homebrew tap/formula,
> no README rewrite, no banner Git-state redesign, no Engram work, no release
> publication, no `install.sh` rewrite, no worker changes to `.github/workflows/
> installer-release.yml`, no real network, no real GitHub, no replacing the
> running test process, no Pi/`installDeclaredPackages` injection inside the
> release transaction. Existing unrelated uncommitted files MUST remain
> untouched.

## // 001. Test harness seams and version/asset resolution contract

Forecast: ~180–280 production lines, ~250–380 test lines. Includes pure
helpers, types, and an injectable capability seam that every later group
relies on; no I/O, no subprocess, no network.

- [x] 1.1 Add `installer/src/core/release-types.ts` and freeze the identity model from design §B
  - skills: `ein-discipline`, `architecture`
  - why: every later group types against the same `ReleaseRecord`, `ResolvedRelease`, `AssetDigest`, `OwnershipMarker`, `MarkerV2`, `UpdateResult` shapes; freezing them up front prevents drift between the resolver, acquirer, transaction, CLI and banner.
  - learn: TS discriminated unions (`type: "standalone" | "package-manager" | "legacy-standalone" | "ownership-ambiguous"`) force the ownership boundary to be exhaustively handled at compile time — the compiler becomes the "ownership seam" referee.
  - architecture: module is pure types and small `parseX`/`assertX` helpers; no `node:fs`, no `node:os`, no `fetch`. Markers stay additive (`schemaVersion: 2` plus legacy `version`/`installedAt`/`channel`) so old readers keep parsing.
  - avoid: do not import `exec.ts`, `paths.ts` or any IO module here; do not derive ownership from `process.execPath` or `LOCAL_BIN_DIR` — design §R9 forbids path guessing.
  - verify: `bun test tests/release-update-contract.test.ts` (file created in 1.4) plus `cd installer && bun run typecheck`.
  - files/symbols: `release-types.ts` exports `ReleaseSelector`, `ReleaseTag`, `ResolvedRelease`, `AssetDigest`, `OwnershipMarker`, `MarkerV1`, `MarkerV2`, `UpdateOutcome` (`"updated" | "already-current" | "blocked-external-owner" | "failed"`).
  - acceptance evidence: `tsc --noEmit` clean; new types reachable from `installer/src/core/version.ts` without cyclic imports.
  - rollback/cleanup: deleting this file is safe; later groups cannot compile against it, which is the desired blast-radius alarm.

- [x] 1.2 Add `installer/src/core/release-resolver.ts` with the latest/explicit selector + tag normalization (R1, R12)
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: `runUpdate` currently has no selector parsing at all (`map.md`); design §R1 requires `latest`, `X.Y.Z`, `vX.Y.Z`, `installer-vX.Y.Z` to all normalize to the canonical tag, and `latest` to fetch a separate API path. Centralizing it here keeps the CLI pure.
  - learn: keeping the resolver pure (it returns a `ResolvedRelease`, never calls `fetch`) makes it trivially unit-testable — the acquirer in // 002 injects the HTTP capability and the tests use a fake; the design's "R12 deterministic testability" depends on this split.
  - architecture: `parseSelector(args)` returns `{ kind: "latest" | "explicit", tag?: ReleaseTag, raw: string }`. `resolveExplicitTag(input)` returns the normalized `installer-v<version>` or a typed `ResolutionError`. The GitHub-release eligibility check is delegated to the injected HTTP seam from 1.3.
  - avoid: do not call `curl` here; do not accept `^`, `~`, `*`, ranges or commit SHAs; do not silently fall back to `latest` on bad input — design §R1 is explicit that no fallback is allowed.
  - verify: focused unit cases in `tests/release-update-contract.test.ts`: `latest` vs no-selector equivalence, `0.19.0` / `v0.19.0` / `installer-v0.19.0` all resolve to the same tag, malformed `0`/`0.19`/`latest-rc1`/`draft`/unpublished return `ResolutionError`, prerelease tag rejected. Existing `tests/deploy-clean-managed.test.ts` and `tests/deploy-settings.test.ts` remain green.
  - files/symbols: `parseSelector`, `resolveExplicitTag`, `normalizeTag`, `isEligibleRelease` (filters out drafts/prereleases per design §R1).
  - acceptance evidence: table-driven test asserts the same `ReleaseTag` for the three equivalent spellings; rejected inputs return the typed error and the test inspects `.stage === "resolving"` for R10 failure semantics.
  - rollback/cleanup: removing this module leaves `runUpdate` in its current selector-less state; nothing else imports it yet.

- [x] 1.3 Add `installer/src/core/update-caps.ts` with the injected capability object used by every later group (R12)
  - skills: `ein-discipline`, `architecture`
  - why: design §R12 mandates narrow injectable seams (HTTP, hashing, filesystem, child, clock, signals, output). Defining the type once means the orchestrator, the resolver, the acquirer, the executable transaction and the CLI all share the same production default — and the same fake in tests — without each module reinventing the surface.
  - learn: an injected capability object (plain function-object, no class) keeps the orchestrator a small functional state machine; a class-based "UpdateService" with private state would re-create the god-object smell that design §C explicitly rejects.
  - architecture: `UpdateCaps` interface groups `http`, `hashFile`, `probeBinary`, `fs` (sibling temp, atomic rename, fsync dir), `child` (spawn continuation), `clock`, `signals`, `output`. A `defaultUpdateCaps()` factory wires the production defaults; tests pass a `fakeUpdateCaps()` that records calls and returns scripted fixtures.
  - avoid: do not add a class hierarchy, do not add an event bus, do not leak `Bun.spawn` through the surface — child execution is owned by the injected `child.spawn`.
  - verify: type-level smoke in `tests/release-update-contract.test.ts` asserts that `defaultUpdateCaps` is constructible and that every method returns the documented `Result<T, UpdateStageError>` shape.
  - files/symbols: `UpdateCaps`, `UpdateStageError`, `defaultUpdateCaps`, `fakeUpdateCaps` (test helper).
  - acceptance evidence: `cd installer && bun run typecheck` clean; fake caps reach the orchestrator signature without `any` or `unknown` leaks.
  - rollback/cleanup: deleting the file is safe until // 002 starts consuming it.

- [x] 1.4 Create `tests/release-update-contract.test.ts` and pin selector/resolver/ownership/marker behavior
  - skills: `ein-discipline`, `vitest` (for the test API reference), `bun`
  - why: design §R12 requires the contract layer to be testable with no I/O; this file is the gate that proves // 001 keeps the seams pure before // 002 wires real HTTP behavior. It is also the smallest possible regression for the "identity bug" map.md documented.
  - learn: Bun's `bun:test` discovers `*.test.ts` files anywhere in the repo by default; you do not need a `bunfig.toml` or `vitest.config.ts` for focused suites. Adding `import { describe, expect, test } from "bun:test"` is enough — that is what `tests/installer-backup.test.ts` already does.
  - architecture: imports only from `installer/src/core/release-types.ts`, `release-resolver.ts`, `update-caps.ts` and `version.ts`; no `node:fs`, no `fetch`, no `Bun.spawn`. Ownership cases assert that `owner = "package-manager"` and `owner.manager === "homebrew"` flows return the `blocked-external-owner` outcome without any filesystem call.
  - avoid: do not mock `node:fs` globally; do not introduce `nock`/`msw` here — those belong in // 002 with the acquirer.
  - verify: `bun test tests/release-update-contract.test.ts` and `bun test tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts` (regression guard for the suites touched by later groups).
  - files/symbols: test cases `selector.normalize`, `selector.reject.malformed`, `resolver.explicitMismatch`, `resolver.latestEligible`, `ownership.classifyStandalone`, `ownership.classifyPackageManager`, `ownership.ambiguousFailsBeforeMutation`, `marker.migrateV1ToV2`, `caps.defaultAndFake`.
  - acceptance evidence: all targeted cases pass; production code from later groups can import the types and helpers without test-mode branches.
  - rollback/cleanup: file is additive; existing tests untouched.

## // 002. Download, platform asset selection, checksum verification, temp-file cleanup

Forecast: ~180–280 production lines, ~280–420 test lines. Network and
filesystem seams only; no executable replacement yet (that is // 003) and no
template deployment yet (that is // 004).

- [x] 2.1 Add `installer/src/core/asset-selector.ts` with platform → asset-name binding and WSL handling (R2)
  - skills: `ein-discipline`, `architecture`
  - why: design §R2 requires exactly one same-release asset named `ein-installer-{darwin|linux}-{arm64|x64}`; `core/platform.ts` already detects `arm64`/`x64` and `darwin`/`linux`, and `install.sh` already maps WSL to the linux build. Centralizing the selector prevents drift between the existing bootstrap (`install.sh`) and the new updater.
  - learn: re-using `detectPlatform()` keeps a single source of truth for arch aliases (`aarch64` → `arm64`, `amd64` → `x64`); introducing a second mapping is how platform drift bugs start.
  - architecture: `selectAsset(platform)` returns `{ assetName, os, arch, wsl: boolean }` or a typed `AssetError` (`unsupported-platform`, `unsupported-arch`, `missing-asset-on-release`). The module consumes `UpdateCaps.http` to fetch `/repos/{repo}/releases/tags/{tag}` and the `/releases/latest` endpoint, but never `curl` directly.
  - avoid: do not call `curl` here; do not build asset URLs by string concatenation across hosts; do not honor redirects to non-GitHub hosts per design §R2.
  - verify: `bun test tests/release-update-acquisition.test.ts` (created in 2.5) plus `cd installer && bun run typecheck`.
  - files/symbols: `selectAsset`, `assetNameFor(os, arch)`, `assetError`.
  - acceptance evidence: 4 platform fixtures (darwin/arm64, darwin/x64, linux/arm64, linux/x64) plus WSL fixture assert the produced asset name; one platform with no matching asset on the release record returns `AssetError("missing-asset-on-release")`.
  - rollback/cleanup: deleting the file is safe until // 002 commits; nothing else imports it yet.

- [x] 2.2 Add `installer/src/core/checksum.ts` with strict `checksums.txt` parsing + streamed SHA-256 verification (R3, R4)
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: design §R3 requires strict parsing (no leading whitespace tolerance, no `*` binary markers), exactly one SHA-256 entry per selected asset, and full-byte hashing before any commit. `install.sh` does this with shell `grep`/`awk`/`sha256sum` and silently skips on missing metadata — design §R3 forbids that skip.
  - learn: Node's `createHash("sha256")` plus `Bun.file(path).stream()` is the deterministic, allocation-bounded way to hash a staged binary without loading it into memory; this matters because the binary is ~tens of MB and the failure injection tests in // 006 will run it many times.
  - architecture: `parseChecksums(text, assetName)` returns `AssetDigest` or `ChecksumError` (`malformed`, `missing-entry`, `duplicate-entry`, `mismatch`). `verifyAsset({ stagedPath, expected, caps })` returns a `Result<void, UpdateStageError>` and refuses to read the destination.
  - avoid: do not use `crypto.createHash` in a way that swallows stream errors; do not allow multiple entries for the same asset; do not call the destination path here — only the staged file.
  - verify: `bun test tests/release-update-acquisition.test.ts` — cases for empty file, single valid entry, duplicate entry, malformed hash line, missing target asset, hash mismatch on the staged bytes.
  - files/symbols: `parseChecksums`, `verifyAsset`, `ChecksumError`, `AssetDigest`.
  - acceptance evidence: every malformed/missing/duplicate/mismatch case returns the typed error; success case returns the digest that matches `crypto.createHash("sha256")` of the staged bytes.
  - rollback/cleanup: file is additive; deletion safe until // 003 starts importing `verifyAsset`.

- [x] 2.3 Add `installer/src/core/acquisition.ts` with HTTPS-only fetcher, bounded redirects, HTTP/timeouts and temp-file lifecycle (R2, R3, R4, R10)
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: design §R2 forbids credential forwarding on cross-host redirects and requires HTTPS, bounded timeouts and bounded response sizes; §R3 forbids letting the running binary's bytes influence the verified identity; §R10 forbids staging material from becoming authoritative. `latestInstallerTag` (`version.ts:42`) violates all three.
  - learn: Bun's `fetch` supports `signal: AbortSignal.timeout(ms)` and `redirect: "follow"` plus a manual `response.url` check — that is the minimum viable surface for the "redirects only on GitHub API/release asset hosts" rule; no new dependency is required.
  - architecture: `acquireRelease({ selector, caps })` returns `{ stagedPath, digest, release, asset, checksums }` or `UpdateStageError`. The function creates a `mkdtempSync` staging directory, downloads the asset and `checksums.txt`, verifies the digest against the staged bytes, and removes the staging directory in a `finally` block.
  - avoid: do not reuse `latestInstallerTag`; do not invoke `curl`; do not skip the checksum when `checksums.txt` is unreachable — design §R3 mandates fail-closed.
  - verify: `bun test tests/release-update-acquisition.test.ts` with fake `caps.http` covering success, missing asset on release, missing `checksums.txt`, digest mismatch, redirect to a non-GitHub host, timeout, truncated download. None of these tests make a real network call.
  - files/symbols: `acquireRelease`, `stagedPath`, `AbortError`, `acquireReleaseForUpdate` (the public entrypoint consumed by // 004).
  - acceptance evidence: each injected failure produces a typed `UpdateStageError` with `stage: "acquiring-metadata" | "verifying"`; no staging directory or file outlives the test.
  - rollback/cleanup: `mkdtempSync` + `finally rmSync(staging, { recursive: true, force: true })` keeps the temp dir out of `BACKUP_DIR` and out of `tmpdir()` survivors; the test asserts the directory is absent after each failure case.

- [x] 2.4 Add `installer/src/core/release-record.ts` reading `releases/latest` and the explicit-tag endpoint with the same HTTP policy (R1, R2)
  - skills: `ein-discipline`, `architecture`
  - why: design §R1 distinguishes "latest eligible" from "exact tag"; both must come from the authoritative release record for `INSTALLER_REPO` (or `EIN_INSTALLER_REPO` override). Keeping the record fetcher separate from the acquirer in 2.3 lets the orchestrator decide which one to call based on `parseSelector`'s output.
  - learn: GitHub returns drafts and prereleases from the `/releases` endpoint but `/releases/latest` historically omits them; using `/releases?per_page=100` and filtering client-side is the documented fallback, but the design only requires non-draft, non-prerelease eligibility — keep it small and explicit.
  - architecture: `fetchLatestRelease(caps)` and `fetchReleaseByTag(tag, caps)` both go through `caps.http` and return `{ tag, htmlUrl, assets, checksumsUrl }` or `UpdateStageError("acquiring-metadata")`. `checksums.txt` is downloaded by the acquirer, not here.
  - avoid: do not parse the entire release payload into a giant object; do not embed the GitHub token in headers; do not silently substitute `/releases/latest/download/{asset}` for the explicit path.
  - verify: `bun test tests/release-update-acquisition.test.ts` — fake responses for both endpoints, plus an explicit-tag endpoint that returns 404, plus a `/releases/latest` response that is a draft/prerelease and must be rejected.
  - files/symbols: `fetchLatestRelease`, `fetchReleaseByTag`, `ReleaseError`.
  - acceptance evidence: tag endpoint 404 returns `ReleaseError("not-found")`; latest endpoint returning draft/prerelease returns `ReleaseError("ineligible")`; success returns the typed record consumed by 2.1 and 2.3.
  - rollback/cleanup: deleting the file is safe until // 004 wires the orchestrator.

- [x] 2.5 Create `tests/release-update-acquisition.test.ts` with fake-HTTP table cases
  - skills: `ein-discipline`, `vitest`, `bun`
  - why: this is the regression layer that proves design §R1–R4 hold without real network; it is also where the explicit-tag-vs-latest divergence is asserted (a key user-visible acceptance criterion).
  - learn: a tiny `fakeHttp(scripts)` helper that maps `URL → { status, body, headers }` and records call count is enough for the whole matrix; you do not need `msw` or `nock`, which would add dependencies and contradict `openspec/config.yaml`'s "no global runner configured" stance.
  - architecture: imports only the production modules from 2.1–2.4 plus `update-caps.ts` from // 001; uses `mkdtempSync` for staging dirs and `rmSync` in `afterEach` so no test ever leaks a temp directory under `tmpdir()`. No real `fetch`, no real `curl`, no real GitHub.
  - avoid: do not let any test reach `https://github.com` or `https://api.github.com`; do not let any test run `Bun.spawn`.
  - verify: `bun test tests/release-update-acquisition.test.ts` plus `bun test tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts`.
  - files/symbols: `fakeHttp`, `fakeStaging`, test cases `acquire.success`, `acquire.missingAsset`, `acquire.missingChecksums`, `acquire.mismatch`, `acquire.redirectOffHost`, `acquire.timeout`, `acquire.truncation`, `record.latestIsDraft`, `record.explicitNotFound`.
  - acceptance evidence: all cases pass; `tmpdir()` is scanned in the test's `afterAll` to confirm no orphan staging dirs.
  - rollback/cleanup: file is additive.

## // 003. Atomic standalone binary replacement and rollback bookkeeping

Forecast: ~180–260 production lines, ~200–320 test lines. Filesystem and
process seams only; no HTTP, no template deployment, no marker write.

- [x] 3.1 Add `installer/src/core/executable.ts` with destination validation, sibling temp staging, mode handling and atomic rename (R4)
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: design §R4 requires the candidate to live in the destination directory before replacement (same-filesystem rename is the only POSIX-atomic primitive), and to reject symlinks, non-regular destinations and unsafe ownership. `install.sh` already does the same via shell `mktemp -d` + `mv`, but the updater needs it as a typed function with rollback semantics.
  - learn: `Bun.write(path, bytes)` followed by an explicit `Bun.file(dir).stat()` sync, then `renameSync`, gives you a tested same-filesystem atomic move; the only failure mode the rename cannot paper over is a cross-filesystem destination, which `lstatSync` on the parent directory can detect (compare device id).
  - architecture: `prepareExecutableCandidate({ sourcePath, destinationPath, caps })` returns `{ candidatePath, backupPath }` or `UpdateStageError`. It validates the destination with `lstatSync` (rejects symlinks), creates a sibling temp file, copies the verified bytes, sets mode 0o755 minus setuid/setgid, opens the parent dir and fsyncs it, and registers the candidate path for the rollback layer.
  - avoid: do not delete the running binary's hardlink count before the candidate is verified; do not `chmod` the destination in place (that would race with running processes); do not assume cross-filesystem `rename` will work — `EXDEV` must surface as an error.
  - verify: `bun test tests/release-update-exec.test.ts` (created in 3.4) — destination is a regular file (success), destination is a symlink (rejected), destination is on a different filesystem (rejected with `EXDEV`-shaped error), sibling temp file is the only persistent footprint before rename.
  - files/symbols: `prepareExecutableCandidate`, `ExecutableError`, `CandidatePaths`.
  - acceptance evidence: success path leaves destination bytes equal to source bytes plus correct mode; failure paths leave the destination untouched.
  - rollback/cleanup: rollback layer (added in // 004) reuses the `backupPath` returned here to restore the previous binary; the candidate temp file is removed in `finally` unless the transaction commits and the journal (added in // 004) explicitly retains it.

- [x] 3.2 Add `installer/src/core/binary-probe.ts` to read `INSTALLER_VERSION` and embedded template version from the staged candidate (R3, R8)
  - skills: `ein-discipline`, `architecture`
  - why: design §R3 requires probing the staged binary's reported `INSTALLER_VERSION` and embedded template version after checksum verification and before replacement; §R8 requires the same after replacement to confirm the running child reports the same version. Both come from `process.argv`/the binary's own `--version` output (the existing `main.ts:47` shows the pattern).
  - learn: invoking the staged candidate as `path/to/candidate --version` is the cheapest way to get a typed `BinaryIdentity` back; spawning it via `caps.child.spawn` (added in // 001.3) keeps the seam testable and avoids importing `Bun.spawn` here.
  - architecture: `probeBinaryVersion(candidatePath, caps)` returns `{ binaryVersion, templateVersion }` or `BinaryProbeError`. The candidate is invoked in a child that only prints `--version` and exits; the child is **never** the running test process (a hard rule from design §R12).
  - avoid: do not parse the candidate's bytes with a regex against the binary's own string table; do not invoke the running process itself.
  - verify: `bun test tests/release-update-exec.test.ts` — fixture: copy `bun` itself into a temp dir, run `--version`, assert `binaryVersion` is parsed; mismatched probe (fixture that prints a different version) returns `BinaryProbeError`.
  - files/symbols: `probeBinaryVersion`, `BinaryIdentity`, `BinaryProbeError`.
  - acceptance evidence: successful probe returns `{ binaryVersion, templateVersion }` that match the canonical selected release's identity; mismatched probe returns the typed error before any replacement.
  - rollback/cleanup: no filesystem mutations beyond invoking a child that only prints `--version`.

- [x] 3.3 Add `installer/src/core/child-continuation.ts` to spawn the new binary in private continuation mode (R6)
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: design §R6 mandates a cross-process continuation: the parent spawns the verified new binary with a transaction identifier and selected release identity, the child verifies its own identity, deploys its embedded template, commits the marker, and reports back; the parent stays alive to validate, rollback and clean up. Tests must never replace the running test executable (R12).
  - learn: a small `runUpdateContinuation({ txId, release, caps })` helper invoked by the child keeps the cross-process protocol symmetric — both sides speak the same `ContinuationMessage` shape; ad-hoc `process.argv` parsing would be brittle.
  - architecture: the child detects the `--ein-continuation=<txId>` flag and switches to a `runContinuation()` branch that returns a JSON result on stdout and never falls through to the TUI. The parent awaits the child, parses the result, and uses `runTransactionCleanup()` from // 004 to finalize.
  - avoid: do not run the new binary in-process (`require()` the new module); do not use `execve` semantics that the test runner cannot stub; do not skip the parent's own verification step after the child exits.
  - verify: `bun test tests/release-update-exec.test.ts` — fake `caps.child.spawn` records the invocation, asserts the args include `--ein-continuation=<txId>` and the env contains the selected release identity; child that returns a non-zero code rolls the transaction back via the surface defined in // 004 (placeholder rollback hook).
  - files/symbols: `runUpdateContinuation`, `ContinuationMessage`, `spawnContinuation`.
  - acceptance evidence: parent receives the child's parsed `ContinuationMessage`; child exit non-zero triggers `failed` outcome; test runner's own process is never replaced (the spawn is faked).
  - rollback/cleanup: parent's `finally` reaps the child, removes the candidate temp file unless the journal retains it, and surfaces `failed` to the CLI.

- [x] 3.4 Create `tests/release-update-exec.test.ts` with table-driven success/failure cases for staging, probe and continuation
  - skills: `ein-discipline`, `vitest`, `bun`
  - why: design §R4–R6 require every mutation boundary to be testable; this file is the regression layer that protects against a self-replacement regression (the explicit "tests must not replace the running test executable" rule).
  - learn: a fake `caps.child.spawn` that just records `{ args, env, returnCode, stdout }` and a fake `caps.fs.rename` that simulates `EXDEV` is enough to cover the failure matrix without ever touching the real filesystem in a way that would replace the test runner.
  - architecture: imports the modules from 3.1–3.3 plus `update-caps.ts` from // 001; uses `mkdtempSync` for candidate/backup paths and `rmSync` in `afterEach`. No real `Bun.spawn`, no real `chmod`, no real cross-filesystem rename.
  - avoid: do not invoke `process.execPath`; do not run the real `bun` binary as the candidate in a way that would mutate the test process.
  - verify: `bun test tests/release-update-exec.test.ts` plus the existing three suites.
  - files/symbols: `fakeChild`, `fakeFs`, test cases `staging.success`, `staging.destinationSymlink`, `staging.crossFilesystem`, `probe.success`, `probe.mismatch`, `continuation.success`, `continuation.childExitNonZero`, `continuation.parentRollsBack`.
  - acceptance evidence: all cases pass; `process.argv0` and `process.execPath` are unchanged before and after the test run.
  - rollback/cleanup: each case deletes its temp dir in `afterEach`; a final `afterAll` scans `tmpdir()` to assert no orphan candidates.

## // 004. Re-execution plus template/marker transaction and backward-compatible marker migration

Forecast: ~220–340 production lines, ~280–440 test lines. This group wires
the orchestrator state machine defined in design §C, the durable journal,
clean-before-restore template rollback, signal/interruption handling, and the
legacy marker migration.

- [x] 4.1 Add `installer/src/core/transaction.ts` with the state machine, journal and reverse-order rollback (R6, R7, R8, R10)
  - skills: `ein-discipline`, `architecture`
  - why: design §C specifies the transition graph (`idle → ownership-classified → resolving → … → complete`) and §R10 mandates a durable journal so an interrupted transaction can be recovered on the next invocation. Centralizing the state machine in one module is the only way to keep the CLI thin and the test surface deterministic.
  - learn: the journal lives under `BACKUP_DIR/.ein-update-journal.json` (not under `AGENT_DIR`) so a corrupted agent tree does not also corrupt the recovery record; the journal records the *committed* transition only — the next transition is appended just before its irreversible action.
  - architecture: `Transaction` class (or factory function — design §C rejects class hierarchies, so prefer a closure-returning `createTransaction(caps)`); each transition exposes `prepare()` and `commit()`; rollback reverts in reverse order using the per-step artifact paths the journal recorded; failure surfaces a typed `TransactionError` with `stage` and `recoveryArtifacts`.
  - avoid: do not use a global state singleton; do not write the journal after the irreversible action — write it before; do not delete recovery artifacts when rollback itself fails (design §R10).
  - verify: `bun test tests/release-update-transaction.test.ts` — failure injected at every transition boundary (`binary-replaced`, `child-reexecuted`, `template-deployed`, `marker-committed`) reverses to the previous coherent state and either restores fully or returns `rollback-failed/recovery-required`.
  - files/symbols: `createTransaction`, `TransactionState`, `TransactionError`, `Journal`.
  - acceptance evidence: each failure injection leaves the previous coherent state intact, the journal records the committed transition, and the next invocation (in a follow-up test) recovers or explicitly refuses to start.
  - rollback/cleanup: failed-rollback retains the journal and the recovery artifacts; cleanup happens only on `complete`.

- [x] 4.2 Add `installer/src/core/template-transaction.ts` with clean-before-restore rollback and deployed-manifest validation (R7)
  - skills: `ein-discipline`, `architecture`
  - why: design §R7 requires the deployed template to come from the verified binary's embedded manifest only, and rollback to clean managed dirs before restoring their prior snapshot so files introduced by the failed release cannot remain. `cleanManagedDirs` (`deploy.ts:62`) already handles the wipe; this module wires it into the transaction.
  - learn: reusing `MANAGED_DIRS` from `deploy.ts` keeps the set of updater-owned template directories in a single place; introducing a parallel list is how a partial rollback leaks files from a failed release.
  - architecture: `snapshotTemplate(agentDir, caps)` produces a temp dir holding the current managed-dirs content; `deployEmbeddedTemplate(binaryPath, agentDir, caps)` extracts the candidate's embedded tarball (via the existing `assets.d.ts` mechanism — but for the staged candidate, not the running binary); `restoreTemplate(agentDir, snapshotPath, caps)` cleans first, then restores.
  - avoid: do not deploy from the running binary's template (the map.md-confirmed identity bug); do not restore user state (`auth.json`, `sessions/`, `skills/downloaded/`) — the snapshot excludes it.
  - verify: `bun test tests/release-update-transaction.test.ts` — managed-dirs clean-before-restore removes files introduced by the failed release; user-state files survive both deploy and rollback.
  - files/symbols: `snapshotTemplate`, `deployEmbeddedTemplate`, `restoreTemplate`, `validateDeployedManifest`.
  - acceptance evidence: post-rollback managed-dir contents equal the pre-deploy snapshot; `auth.json`, `sessions/`, `skills/downloaded/` are unchanged.
  - rollback/cleanup: snapshot temp dir is removed after `validateDeployedManifest` returns success.

- [x] 4.3 Add `installer/src/core/marker-v2.ts` with v1/v2 parsing, migration gating and atomic commit/read-back (R5, R8, R9)
  - skills: `ein-discipline`, `architecture`
  - why: design §R5 forbids treating a legacy marker as already-current without proven coherence; §R8 forbids advancing the marker before deployed state is committed and validated; §R9 requires ownership metadata to be present and unambiguous. The current `readMarker`/`writeMarker` in `version.ts` write `version: INSTALLER_VERSION` from a static constant — exactly the identity bug map.md documents.
  - learn: atomic marker commit means `writeFileSync(tmp)` + `renameSync(tmp, INSTALL_MARKER)` on the same filesystem; `INSTALL_MARKER` is under `AGENT_DIR`, so a sibling temp file in `AGENT_DIR` is required (design §R4 applies the same rule to executable staging).
  - architecture: `readMarkerV2(caps)` returns `MarkerV1 | MarkerV2 | null`; `classifyOwnership(marker)` returns `OwnershipMarker`; `commitMarkerV2(release, caps)` writes the marker atomically and reads it back to confirm; `migrateLegacyMarker(marker, proof, caps)` only commits v2 after executable + template coherence is proven.
  - avoid: do not use the static `INSTALLER_VERSION` for the marker `version` field; do not write the marker before the deployed state is validated; do not infer ownership from `LOCAL_BIN_DIR` or `/usr/local/bin`.
  - verify: `bun test tests/release-update-transaction.test.ts` — legacy marker without executable coherence is NOT migrated; legacy marker with executable + template coherence is migrated; conflicting owner data returns `ownership-ambiguous`; atomic commit failure surfaces a typed `MarkerError`.
  - files/symbols: `readMarkerV2`, `classifyOwnership`, `commitMarkerV2`, `migrateLegacyMarker`, `MarkerError`.
  - acceptance evidence: round-trip read of a freshly committed v2 marker returns the same identity; read-back failure after commit surfaces the typed error and the transaction rolls back.
  - rollback/cleanup: previous marker is snapshotted by `transaction.ts` before commit; rollback restores it from the journal.

- [x] 4.4 Wire signal handling, journal recovery and cleanup into the transaction (R10)
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: design §R10 requires signals before mutation to clean disposable staging, signals after mutation to initiate rollback, and a durable journal that makes an interrupted post-replacement transaction recoverable on the next invocation before any new update.
  - learn: `process.once("SIGINT", handler)` plus `process.off("SIGINT", handler)` in the transaction's cleanup `finally` is enough — Bun forwards standard POSIX signals, and the typed `UpdateStageError` already carries `stage`, so the handler can decide whether to initiate rollback or just clean staging.
  - architecture: `installSignalHandlers(tx, caps)` registers handlers scoped to the active transaction; `recoverPendingTransaction(caps)` runs on every `runUpdate` start, refuses to begin a new transaction if a pending journal is found, and either rolls forward or rolls back based on the recorded committed state.
  - avoid: do not register global signal handlers that outlive the transaction; do not delete the journal before validation succeeds.
  - verify: `bun test tests/release-update-transaction.test.ts` — fake signal injection at each transition triggers the expected cleanup/rollback branch; `recoverPendingTransaction` returns `recovery-required` for an interrupted journal and `clean` for a committed-but-not-cleaned one.
  - files/symbols: `installSignalHandlers`, `recoverPendingTransaction`, `RecoveryStatus`.
  - acceptance evidence: signal handlers are removed after the transaction completes; a second invocation after an interrupted first one never begins a second update while state is ambiguous.
  - rollback/cleanup: `recoverPendingTransaction` either finalizes the journal (clean) or surfaces `recovery-required` with the affected paths; cleanup never deletes the journal if validation fails.

- [x] 4.5 Create `tests/release-update-transaction.test.ts` with the full state-machine and rollback matrix
  - skills: `ein-discipline`, `vitest`, `bun`
  - why: this is the design §R10 + §C verification matrix. Every transition must be exercisable with an injected failure; every rollback must be reversible; every journal must be durable across "invocations" (test re-entry).
  - learn: a `runTransactionScenario(steps)` helper that drives the state machine and injects failures at each step keeps the matrix readable; sharing the fake caps from // 001–003 keeps the surface small.
  - architecture: imports the production modules from 4.1–4.4 plus `update-caps.ts`, `executable.ts`, `template-transaction.ts`, `marker-v2.ts`; uses `mkdtempSync` for the journal and template snapshot dirs; `afterEach` removes them. No real signals, no real subprocesses.
  - avoid: do not let any test fork a real child process; do not let any test touch the real `INSTALL_MARKER` path.
  - verify: `bun test tests/release-update-transaction.test.ts` plus the existing three suites plus `bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-exec.test.ts` and `cd installer && bun run typecheck`.
  - files/symbols: `runTransactionScenario`, `failAt(stage)`, test cases for each transition boundary, journal recovery happy path, journal recovery failure path, signal-before-mutation, signal-after-mutation.
  - acceptance evidence: every matrix cell asserts the expected outcome and the post-state; total tests fail fast when an injected failure is not caught.
  - rollback/cleanup: each scenario removes its journal and snapshot dir; `afterAll` scans `tmpdir()` and `BACKUP_DIR` (only in the fake root) to assert no orphans.

## // 005. Externally managed installation behavior and user-visible version/banner reporting

Forecast: ~120–200 production lines, ~160–260 test lines. Wires the CLI,
the banner and the result reporter; does not touch acquisition or transaction
logic (those were proven in // 002–004).

- [x] 5.1 Add `installer/src/cli/result.ts` with `UpdateOutcome` formatting and stable exit codes (R11)
  - skills: `ein-discipline`, `architecture`
  - why: design §R11 mandates that `updated` and `already-current` exit zero, `blocked-external-owner` and `failed` exit non-zero, and that human output identifies the requested selector, the resolved tag when known, the failed stage and the final installed version without exposing secrets. Centralizing the formatter is what keeps `runUpdate` thin and the exit contract testable.
  - learn: a `renderOutcome(outcome): { lines: string[], exitCode: number }` function is the boundary that lets tests assert exact output without grep on stderr; the function never logs secrets because the typed `UpdateStageError` carries no credentials by construction.
  - architecture: imports `UpdateOutcome` from // 001; pure function, no IO; the CLI writes the lines via `p.log` (existing `@clack/prompts`) and returns the exit code.
  - avoid: do not use `console.log` directly for outcomes — keep them going through `p.log` so the TUI stays consistent; do not invent an exit code that conflicts with design §R11's documented values.
  - verify: `bun test tests/release-update-cli.test.ts` (created in 5.4) — every outcome produces the documented lines and exit code; secrets injected via a fake `caps.output` are never echoed.
  - files/symbols: `renderOutcome`, `EXIT_UPDATED`, `EXIT_ALREADY_CURRENT`, `EXIT_BLOCKED_EXTERNAL_OWNER`, `EXIT_FAILED`.
  - acceptance evidence: table-driven test asserts both lines and exit code for each outcome; failure messages name the failed stage.
  - rollback/cleanup: pure module; deleting it leaves `runUpdate` unable to format outcomes, which is the desired alarm.

- [x] 5.2 Rewire `installer/src/cli/update.ts` to delegate to the transaction orchestrator and handle the external-owner branch (R1, R6, R9, R11)
  - skills: `ein-discipline`, `architecture`
  - why: `runUpdate` (`installer/src/cli/update.ts`) is the entry point with the documented identity bug; design §R1, §R6, §R9 and §R11 all converge here. This task keeps the function signature compatible with `main.ts:38` and `cli/menu.ts:52`, threads the parsed selector and caps through the transaction, and returns the documented exit code.
  - learn: the external-owner branch (`owner.type === "package-manager"` and target differs from running binary) is the single non-fatal non-success path — by returning `blocked-external-owner` with a non-zero exit, the future `homebrew-install-channel` change gets a stable observable signal without us implementing any Homebrew policy.
  - architecture: `runUpdate(args)` parses the selector via `parseSelector`, builds caps via `defaultUpdateCaps()`, calls `recoverPendingTransaction` first, classifies ownership, and delegates to `runTransaction` from // 004. The dry-run branch uses the same selector/resolver/ownership logic but skips acquisition and reports what *would* happen.
  - avoid: do not call `deployTemplate` directly anymore; do not call `installPi` or `installDeclaredPackages` from inside the transaction — they remain separate flows; do not advance the marker before the transaction commits.
  - verify: `bun test tests/release-update-cli.test.ts` — fake caps cover latest success, explicit success, already-current, marker-only mismatch (no replacement), external-owner block (no mutation, manager name in output), invalid explicit version (exit non-zero before mutation), failure during acquisition (exit non-zero with stage named).
  - files/symbols: `runUpdate` (rewired), `parseCliFlags`, `confirmUpdate`.
  - acceptance evidence: the existing `tests/installer-backup.test.ts` `pre-update` snapshot still triggers from `runUpdate` (via the transaction's `snapshotTemplate`), and no test asserts the old "Ein actualizado" message on partial state.
  - rollback/cleanup: keeping `runUpdate` as an async function that returns a numeric exit code means `main.ts` and `menu.ts` need no edits; the only change visible at the CLI surface is the new failure/recovery messages.

- [x] 5.3 Update `installer/src/tui/banner.ts` to read `marker.version` from a valid committed marker (R8)
  - skills: `ein-discipline`, `architecture`
  - why: design §R8 mandates that the banner `v…` value is `marker.version` from a valid committed marker, never the compile-time `INSTALLER_VERSION`. The current `SUBTITLE` in `banner.ts:47` interpolates `INSTALLER_VERSION`, which is exactly the false-claim map.md documents.
  - learn: keeping the banner pure (it reads a marker file but never writes) is what lets it stay in `tui/` and not migrate to `core/`; the marker reader it calls comes from // 004.
  - architecture: `renderBanner(marker, recoveryStatus)` substitutes the `v…` segment based on marker state (`commit` → `marker.version`, `pending-journal` → `recovery required`, `no-marker` → explicit unverified label with separate binary version); `playBanner` keeps its animation but receives the resolved marker.
  - avoid: do not write the marker from the banner; do not call the GitHub API from the banner.
  - verify: `bun test tests/release-update-cli.test.ts` — banner renders `v<marker.version>` after a successful transaction; renders the recovery label when a pending journal is found; renders the unverified label when no marker exists.
  - files/symbols: `renderBanner`, `BannerState`, `bannerVersionLabel`.
  - acceptance evidence: no banner test contains `INSTALLER_VERSION` in the rendered output (regression guard for the false-claim bug).
  - rollback/cleanup: `INSTALLER_VERSION` import from `banner.ts` is removed in the same commit; `core/version.ts` keeps the constant because `main.ts:47` (`ein --version`) still uses it.

- [x] 5.4 Create `tests/release-update-cli.test.ts` with the externally-managed branch, already-current, dry-run and result formatting
  - skills: `ein-discipline`, `vitest`, `bun`
  - why: design §R9 + §R11 are user-visible acceptance criteria; this file is the regression layer that proves `ein update` reports `blocked-external-owner` without mutating the package-manager-owned installation, and that the dry-run path uses the same selector/resolver/ownership logic without claiming bytes were verified.
  - learn: stubbing `caps.output` with a recording array keeps the test output assertions precise; `bun:test`'s `mock()` from `bun:test` is enough — no extra dependency needed.
  - architecture: imports `cli/update.ts`, `cli/result.ts`, `tui/banner.ts` and the production modules from // 001–004; uses fake caps and a temp `AGENT_DIR`; never invokes a real subprocess. `dry-run` test asserts that no file under the fake `AGENT_DIR` changed mtime.
  - avoid: do not invoke `main.ts`'s `main()` directly (it would call `process.exit`); call `runUpdate(args)` and assert the returned code.
  - verify: `bun test tests/release-update-cli.test.ts` plus `bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-exec.test.ts tests/release-update-transaction.test.ts` and `cd installer && bun run typecheck`.
  - files/symbols: `withFakeHome()`, `runScenario(name, opts)`, test cases `cli.latest.success`, `cli.explicit.success`, `cli.alreadyCurrent`, `cli.markerMismatch`, `cli.externalOwnerBlock`, `cli.invalidSelector`, `cli.acquisitionFailure`, `cli.dryRun.noMutation`, `cli.banner.committedMarker`, `cli.banner.recoveryRequired`.
  - acceptance evidence: every case asserts the exit code from `EXIT_*` constants and the rendered output contains the expected substring; existing tests still pass.
  - rollback/cleanup: temp `AGENT_DIR` removed in `afterEach`; `afterAll` scans `tmpdir()` for orphan dirs.

## // 006. Focused integration/e2e verification and downstream handoff evidence

Forecast: 0 production lines (handoff doc + tests only), ~200–320 test lines.
This group is the gate the next change (`homebrew-install-channel`,
`readme-release-ia`) consumes.

- [x] 6.1 Create `tests/release-update-integration.test.ts` covering the end-to-end transaction via fake seams only
  - skills: `ein-discipline`, `vitest`, `bun`
  - why: design §R12 requires the full state machine to be exercisable end-to-end with a table of injected failures; this is the only place where all five modules from // 001–005 are exercised together, proving the agreement invariant (selector = resolved = asset = deployed = marker = banner) holds across happy and failure paths.
  - learn: composing the focused suites into one integration case per scenario (rather than re-implementing the matrix here) is what keeps the verification layer small — this file is a thin orchestrator over the fake caps and the modules already proven individually.
  - architecture: imports `cli/update.ts`, `core/transaction.ts`, `core/acquisition.ts`, `core/template-transaction.ts`, `core/marker-v2.ts`, `core/executable.ts`, `tui/banner.ts`; uses fake `caps.http`, `caps.fs`, `caps.child`, `caps.clock`; never touches real network, real filesystem outside temp dirs, or the running test process.
  - avoid: do not duplicate the focused assertions from // 002–005; this file is about agreement across modules, not individual invariants.
  - verify: `bun test tests/release-update-integration.test.ts` plus the full prior battery (`bun test tests/release-update-*.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts`) and `cd installer && bun run typecheck`.
  - files/symbols: `scenario(name)`, `verifyAgreement(release)`, test cases `integration.latest.successAgreement`, `integration.explicit.successAgreement`, `integration.alreadyCurrent.successAgreement`, `integration.markerMismatch.rollbackAgreement`, `integration.externalOwner.noMutation`, `integration.acquisitionFailure.preservesPriorIdentity`, `integration.transactionFailure.preservesPriorIdentity`, `integration.signalAfterReplacement.rollbackAgreement`.
  - acceptance evidence: each case asserts that selector, resolved tag, asset digest, deployed executable probe, deployed template manifest, marker v2 fields, and banner `v…` all equal the selected release — or that no mutation occurred on a failure path.
  - rollback/cleanup: temp dirs removed in `afterEach`; `afterAll` asserts the fake `AGENT_DIR` matches the pre-test snapshot.

- [x] 6.2 Create `tests/release-asset-contract.test.ts` tying workflow asset names + `checksums.txt` shape to updater resolution
  - skills: `ein-discipline`, `vitest`, `bun`
  - why: design §B (`Out of scope` note) and `C` (`Release workflow contract`) leave open the possibility of a minimal contract correction if implementation proves it necessary. This test pins the current contract (asset names `ein-installer-{darwin|linux}-{arm64|x64}`, `checksums.txt` SHA-256 lines) so that any future adjustment is a deliberate test change rather than an accidental drift.
  - learn: pinning the contract as a fixture check (not a published release) is the only way to satisfy design §B's "release publication remains out of scope" while still preventing silent breakage — the test reads the `installer/scripts/` build and the workflow YAML and asserts the produced asset list and checksum line format.
  - architecture: imports `installer/scripts/build-all.ts` (or reads the workflow YAML as text) and `installer/src/core/asset-selector.ts` + `core/checksum.ts`; asserts that `selectAsset(...)` for each platform produces one of the four documented asset names and that `parseChecksums` accepts the workflow-produced line shape (`<sha256>  <asset>` or `<sha256> *<asset>`).
  - avoid: do not run `bun run build:all`; do not invoke the workflow; do not publish a release.
  - verify: `bun test tests/release-asset-contract.test.ts`.
  - files/symbols: `expectedAssetNames`, `checksumLineFixtures`, test cases `contract.darwinArm64`, `contract.darwinX64`, `contract.linuxArm64`, `contract.linuxX64`, `contract.checksums.gnuline`, `contract.checksums.bsdline`.
  - acceptance evidence: every documented asset name is accepted; non-documented names are rejected; both GNU and BSD `sha256sum`/`shasum` line formats are accepted by `parseChecksums`.
  - rollback/cleanup: file is additive; deletion re-opens the contract drift risk.

- [x] 6.3 Produce the downstream handoff evidence document at `openspec/changes/release-update-semantics/handoff.md`
  - skills: `ein-discipline`, `architecture`
  - why: design §D and scope §"Explicit consumers and handoff gates" require the next change (`homebrew-install-channel`, `readme-release-ia`) to consume a handoff that cites the accepted design, the verified revision, the supported outcomes and the remaining limitations. Without this document, downstream work has no stable surface to consume.
  - learn: the handoff document is the explicit answer to design §C `Downstream handoff contracts` — it should be short, factual and point to the verified artifacts (`tasks.md`, `verify-report.md`, the test files from 6.1 and 6.2) rather than re-describe the design.
  - architecture: markdown file with the following sections — "Verified artifacts", "Stable inputs for homebrew-install-channel", "Stable inputs for readme-release-ia", "Remaining limitations", "Rollback state", "Explicit non-claims". Cross-references the design sections and the test files from 6.1/6.2; does not invent new behavior.
  - avoid: do not edit `EIN.md`, `README.md`, or any banner/docs outside `openspec/changes/release-update-semantics/`; do not include provisional module names; do not claim Homebrew support; do not claim publisher-independent signature verification.
  - verify: `cd installer && bun run typecheck` (no source change here, but a sanity gate), `bun test tests/release-update-integration.test.ts tests/release-asset-contract.test.ts` (the inputs the handoff cites are green).
  - files/symbols: `handoff.md` (new), `homebrew-install-channel` consumer checklist, `readme-release-ia` consumer checklist.
  - acceptance evidence: file exists, references `tasks.md` and the test files, lists every `UpdateOutcome` value, names the documented exit codes (`EXIT_UPDATED`, `EXIT_ALREADY_CURRENT`, `EXIT_BLOCKED_EXTERNAL_OWNER`, `EXIT_FAILED`), and explicitly states the SHA-256/GitHub-provenance limitation.
  - rollback/cleanup: file is additive inside `openspec/changes/release-update-semantics/`; deleting it removes the handoff artifact only — no source is affected.

- [x] 6.4 Preserve unrelated uncommitted work and run the focused regression battery (delivery-gate evidence)
  - skills: `ein-discipline`, `work-unit-commits`
  - why: the parent's preflight explicitly warns that a recent `git reset` could orphan prior work, and the task brief requires that unrelated uncommitted files stay untouched. The final battery run is the evidence that nothing else regressed.
  - learn: `git status --porcelain` before and after the focused apply run is the smallest possible evidence of preservation; running the focused regression battery (and only that — no network, no real GitHub) is the smallest evidence of correctness.
  - architecture: a non-mutating verification step — no edits, only `git status` and `bun test`. If any unrelated file shows up as modified, the apply must be rejected and reconciled with the user before delivery.
  - avoid: do not run `bun run build:all`; do not run `e2e/docker-test.sh` (design explicitly states it is not an acceptable focused deterministic gate until adapted to local fixtures).
  - verify: `git status --porcelain` (capture before and after), `bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-exec.test.ts tests/release-update-transaction.test.ts tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/release-asset-contract.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts`, `cd installer && bun run typecheck`.
  - files/symbols: n/a (verification only).
  - acceptance evidence: `git status --porcelain` shows the same unrelated uncommitted files as before the focused apply; the focused battery is green; typecheck is clean.
  - rollback/cleanup: no cleanup needed — this task is read-only evidence.

---

## Aggregate Review Workload Forecast

| Group | Production lines | Test lines | Files touched |
|-------|------------------|------------|---------------|
| // 001. Contract/seams | 180–280 | 250–380 | `installer/src/core/release-types.ts`, `release-resolver.ts`, `update-caps.ts`; `tests/release-update-contract.test.ts` |
| // 002. Acquisition | 180–280 | 280–420 | `installer/src/core/asset-selector.ts`, `checksum.ts`, `acquisition.ts`, `release-record.ts`; `tests/release-update-acquisition.test.ts` |
| // 003. Executable | 180–260 | 200–320 | `installer/src/core/executable.ts`, `binary-probe.ts`, `child-continuation.ts`; `tests/release-update-exec.test.ts` |
| // 004. Transaction | 220–340 | 280–440 | `installer/src/core/transaction.ts`, `template-transaction.ts`, `marker-v2.ts`; rewires `installer/src/cli/update.ts` partial; `tests/release-update-transaction.test.ts` |
| // 005. CLI + banner | 120–200 | 160–260 | `installer/src/cli/result.ts`, `installer/src/tui/banner.ts`; rewires `installer/src/cli/update.ts` final; `tests/release-update-cli.test.ts` |
| // 006. Integration + handoff | 0 (handoff doc + tests only) | 200–320 | `tests/release-update-integration.test.ts`, `tests/release-asset-contract.test.ts`; `openspec/changes/release-update-semantics/handoff.md` |
| **Total** | **~880–1,360** | **~1,370–2,140** | 14 new + 2 rewires + 1 handoff doc |

The aggregate production forecast (≈880–1,360 lines) is above the 400-line
single-PR review budget by design — the design itself acknowledges this
(`Implementation is likely to exceed 400 production changed lines in
aggregate`). The Review Workload Guard will measure actual changed lines
during delivery and decide single-PR vs chained/stacked; this task plan
intentionally does not pre-select delivery topology. Each group above is
already a separable work unit (per `work-unit-commits`) with its own
acceptance evidence and focused test command, so they can be promoted to
chained PRs without re-planning.

## Existing tests that MUST stay green

- `tests/installer-backup.test.ts` — touched by // 003 + // 004 staging paths; pre-update snapshot still triggers from `runUpdate` via the new transaction's `snapshotTemplate`.
- `tests/deploy-clean-managed.test.ts` — `MANAGED_DIRS` from `deploy.ts` reused by // 004; no behavior change.
- `tests/deploy-settings.test.ts` — settings preservation path untouched; // 004's `deployEmbeddedTemplate` reuses the existing merge logic.

## Hard rules enforced across every group

1. **No real network.** Every HTTP seam goes through `caps.http`; the fake is the only network in tests.
2. **No replacing the running test executable.** Child continuation is faked; `process.execPath` is never invoked against the test runner.
3. **No release publication, no workflow rewrite, no `install.sh` rewrite.** The release workflow and bootstrap are out of scope; `tests/release-asset-contract.test.ts` is the only place that touches their shape, and only as text.
4. **No marker leading deployed state.** `commitMarkerV2` is the last step in the transaction; rollback restores the snapshotted marker.
5. **No ownership inference from path.** Ownership classification consumes only `marker.owner` (explicit) or `MarkerError("ownership-ambiguous")`.
6. **Production review units bounded per group; aggregate forecast reported separately.** Review Workload Guard decides delivery topology; tasks.md does not.
7. **Preserve unrelated uncommitted work.** Verified by `git status --porcelain` before and after the focused apply run (6.4).
