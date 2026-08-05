status: pass
behavior_coverage: partial
skill_resolution: paths-injected
change: installer-beta

# Verification report — `installer-beta`

## Verdict

The stale `0.40.0` README assertion is corrected and the previously failing focused test now passes. All requested local focused suites, installer typecheck, Docker E2E, and the full Bun suite are green. This is a local verification pass; native macOS execution and a real GitHub workflow dispatch remain explicitly post-verification external gates and are not claimed here.

`behavior_coverage: partial` is intentional: runtime selection, reruns, version output on Linux, static Darwin injection, release pointers, and security invariants were exercised; the shared-Bun-failure branch has no direct focused assertion, and native Darwin execution was unavailable on this Linux host.

## Skill applicability

- `release`: applied to SemVer pointer agreement and the no-local-publication boundary.
- `bun`: applied to bounded focused/full tests, typecheck, and build commands.
- `vitest`: not applicable; this repository uses Bun's test runner, not Vitest.
- `readme-style`: not applicable; no README was generated or edited during verification.
- `zod`: not applicable; no Zod schema or validation boundary changed.

## Spec coverage

| Requirement | Result | Evidence / residual gap |
| --- | --- | --- |
| 1. Exact runtime grammar/default | PASS | `tests/installer-runtime-menu.test.ts` covers separated `pi`, `claude`, `both`, Pi default, missing/flag-like/unsupported/repeated/inline/`-r` rejection, and real-entry-point side-effect-free rejection. Docker covers invalid input. |
| 2. Selected target execution | PASS | Focused orchestration assertions cover selected call counts, one shared Bun preparation, and Pi-before-Claude ordering; Docker exercises compiled-binary Pi, Claude-only, and Both paths. |
| 3. Runtime failure propagation | PARTIAL | Focused test at `tests/installer-runtime-menu.test.ts:418` proves Pi failure continues to Claude and aggregates failure. No direct assertion covers failed/throwing shared Bun preparation proving neither runner starts. |
| 4. Interactive authority | PASS | Menu tests cover Pi/Claude/Both, cancellation, non-TTY behavior, and exactly-once selected-target forwarding. |
| 5. Existing runtime behavior/idempotency | PASS | `timeout 300 ./e2e/docker-test.sh` passed independent default-Pi, Claude-only, and Both scenarios twice; selected/unselected artifacts, launcher uniqueness, convergence, doctor, backup, and cleanup checks passed. Existing migration/safety suites also passed. |
| 6. Isolated real-binary E2E | PASS | Four disposable Docker scenarios passed: invalid rejection, default Pi, Claude-only, and Both. Valid cases reran in-place; Both observed Pi completion before Claude on both passes. |
| 7. Security/filesystem invariants | PASS | Checksum, safe secret/shell-RC writes, backup, deployment cleanup, and dependency regression suite passed: 61 tests / 457 assertions. `installer/install.sh` is unchanged. |
| 8. Cross-platform version display | PARTIAL | Linux entry-point/version/banner tests passed. Darwin x64 cross-build produced a Mach-O artifact with static `INSTALLER_VERSION = "0.41.0"`, shared identity/template labels, and banner version path. Native macOS execution was not possible on `Linux x86_64`; it remains a post-verification gap. |
| 9. `0.41.0` metadata/no delivery | PASS locally | `installer/package.json`, `installer/src/core/version.ts`, and the newest `CHANGELOG.md` heading all report `0.41.0`; release/README contracts pass. No `installer-v0.41.0` local/remote tag, workflow run, release, or pushed `feat/installer-beta` ref was found. Historical workflow history contains an older unrelated `workflow_dispatch` for the prior release; no claim is made that real 0.41.0 dispatch occurred. |

## Task and phase completion

- `tasks.md`: all executable tasks 1.1–5.3 are checked `[x]`; `blocked_by: none`.
- `apply-progress.md`: groups 001–005 and corrective group 006 are complete, with RED/GREEN/TRIANGULATE/REFACTOR evidence tables.
- Reported test paths were cross-referenced and exist: `tests/installer-runtime-menu.test.ts`, `tests/updater-cli-entrypoints.test.ts`, `tests/release-update-cli.test.ts`, `tests/release-asset-contract.test.ts`, `tests/readme-release-ia.test.ts`, and all six security-suite files.
- No implementation or test file was edited during this verification. Only this report was overwritten.

## Commands and results

All long-running commands were bounded with `timeout 300` as required.

| Command | Result | Evidence |
| --- | --- | --- |
| `timeout 300 bun test tests/readme-release-ia.test.ts` | PASS | 7 tests, 67 expectations, 0 failures. The stale 0.40.0 assertion is resolved. |
| `timeout 300 bun test tests/installer-runtime-menu.test.ts` | PASS | 26 tests, 96 expectations. |
| `timeout 300 bun test tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts` | PASS | 14 tests, 67 expectations. |
| `timeout 300 bun test tests/release-asset-contract.test.ts` | PASS | 9 tests, 59 expectations; all three 0.41.0 pointers and checksum/release contracts pass. |
| `timeout 300 bun test tests/install-sh-checksum.test.ts tests/installer-safe-secret-writes.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deps-pi.test.ts tests/deps-hypa.test.ts` | PASS | 61 tests, 457 expectations. |
| `cd installer && timeout 300 bun run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `timeout 300 ./e2e/docker-test.sh` | PASS | Build/image plus invalid, default-Pi, Claude-only, and Both scenarios passed; valid scenarios reran and Both ordering passed. |
| `timeout 300 bun test` | PASS | 1074 tests, 3537 expectations, 0 failures across 90 files. |
| `timeout 300 bash -lc 'cd installer && bun run bundle-template && bun run build:all -- darwin-x64'` | PASS | Produced `installer/dist/ein-installer-darwin-x64` as a Mach-O x86_64 executable. |
| `file installer/dist/ein-installer-darwin-x64` plus static `strings` checks for `var INSTALLER_VERSION = "0.41.0"`, ``ein-installer ${INSTALLER_VERSION}``, and ``template-version ${templateVersion}`` | PASS | Darwin static version injection and retained independent template label are present in the compiled artifact. |
| Pointer check printing package/source/changelog versions and asserting each equals `0.41.0` | PASS | Output: `package=0.41.0`, `source=0.41.0`, `changelog=0.41.0`. |
| `git diff --check && git diff --quiet -- installer/install.sh .github/workflows/installer-release.yml` | PASS | No whitespace errors; protected installer script and release workflow unchanged. |
| `uname -s -m` | PASS | `Linux x86_64`; native macOS execution is unavailable here. |
| Read-only `git show-ref`/`git ls-remote` checks for `installer-v0.41.0` and `feat/installer-beta` | PASS | Local tag, remote tag, and remote branch absent. |
| Read-only `gh run list --workflow installer-release.yml --limit 20 --json databaseId,event,status,conclusion,headBranch,headSha,createdAt,displayTitle` | PASS | History has prior releases only; no `installer-v0.41.0` run. |
| Read-only `gh release view installer-v0.41.0 --json tagName,name,isDraft,isPrerelease,publishedAt,url` | EXPECTED ABSENCE | Returned `release not found`; guarded absence check passed. No release was created. |
| Initial strict static probe using `grep -F 'ein-installer 0.41.0' /tmp/ein-darwin-strings.txt` | FAILED PROBE | The generated binary stores the interpolated template expression rather than the expanded literal. This was a probe-pattern failure, not a build/test failure; the corrected static source-string checks above passed. |

## Strict TDD compliance and assertion quality

Strict TDD is active (`openspec/config.yaml: strict_tdd: true`). Compliance is PASS:

- `apply-progress.md` contains a `TDD Cycle Evidence` table for every apply group, including the corrective stale-assertion group.
- Reported test files exist and were rerun; focused suites and the full suite are GREEN.
- Changed assertions exercise parsed values, process exit/status, filesystem side effects, runner order/call count, rerun convergence, cleanup, checksum rejection, version output, and release-pointer agreement.
- No tautological, ghost-loop, type-only, CSS-only, or smoke-only assertion was found in the changed focused tests.
- Coverage gap (not missing TDD evidence): no direct focused test exercises a failed/throwing `prepareBun` and asserts both target runners remain untouched. This is recorded as the Requirement 3 residual risk rather than concealed by the green build.

## Release and external-delivery boundary

No tag creation, push, workflow dispatch, npm publication, GitHub release publication, or remote asset publication was performed by this verification. Read-only Git/GitHub inspection found no active-change `installer-v0.41.0` tag, release, workflow run, or pushed feature branch. The older workflow history includes a previous unrelated `workflow_dispatch`; therefore the report only attests absence of 0.41.0 delivery artifacts, not absence of all historical dispatches.

Native macOS execution and a real GitHub workflow dispatch/release-asset verification are post-verification external gaps by design. They require a supported native macOS runner and separately authorized remote delivery; neither is claimed as local evidence or performed here.

## Residual risks / follow-ups

1. **Medium — `tests/installer-runtime-menu.test.ts:418-439`:** add a focused shared-Bun failure test asserting neither selected runner starts and aggregate results remain non-success if full branch coverage is required.
2. **Medium — native Darwin execution:** on supported macOS, run the existing Darwin binary with `--version` and verify exactly one `ein-installer 0.41.0` line, one parseable `template-version <SemVer>` line, and the `v0.41.0` banner contract.
3. **Info — remote delivery:** separately authorize and run GitHub workflow dispatch/release publication and post-publication asset/checksum verification; this is outside this change's verification boundary.

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings are recorded with paths and severity: no blocker; medium coverage gap at tests/installer-runtime-menu.test.ts:418-439; medium native-Darwin execution gap; info remote-delivery follow-up."
    }
  ],
  "changedFiles": [
    "CHANGELOG.md",
    "e2e/docker-test.sh",
    "installer/package.json",
    "installer/scripts/build-all.ts",
    "installer/src/cli/install.ts",
    "installer/src/core/version.ts",
    "installer/src/main.ts",
    "tests/installer-runtime-menu.test.ts",
    "tests/readme-release-ia.test.ts",
    "tests/release-asset-contract.test.ts",
    "tests/release-update-cli.test.ts",
    "tests/updater-cli-entrypoints.test.ts",
    "openspec/changes/installer-beta/verify-report.md"
  ],
  "testsAddedOrUpdated": [
    "tests/installer-runtime-menu.test.ts",
    "tests/readme-release-ia.test.ts",
    "tests/release-asset-contract.test.ts",
    "tests/release-update-cli.test.ts",
    "tests/updater-cli-entrypoints.test.ts"
  ],
  "commandsRun": [
    {
      "command": "timeout 300 bun test tests/readme-release-ia.test.ts",
      "result": "passed",
      "summary": "7 tests and 67 expectations passed after correcting the stale 0.40.0 assertion."
    },
    {
      "command": "timeout 300 bun test tests/installer-runtime-menu.test.ts",
      "result": "passed",
      "summary": "26 runtime/menu/orchestration tests passed."
    },
    {
      "command": "timeout 300 bun test tests/updater-cli-entrypoints.test.ts tests/release-update-cli.test.ts",
      "result": "passed",
      "summary": "14 version/update tests passed."
    },
    {
      "command": "timeout 300 bun test tests/release-asset-contract.test.ts",
      "result": "passed",
      "summary": "9 release-pointer/asset/checksum contract tests passed."
    },
    {
      "command": "timeout 300 bun test tests/install-sh-checksum.test.ts tests/installer-safe-secret-writes.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deps-pi.test.ts tests/deps-hypa.test.ts",
      "result": "passed",
      "summary": "61 security/filesystem/dependency regression tests passed."
    },
    {
      "command": "cd installer && timeout 300 bun run typecheck",
      "result": "passed",
      "summary": "Installer TypeScript typecheck passed."
    },
    {
      "command": "timeout 300 ./e2e/docker-test.sh",
      "result": "passed",
      "summary": "All four isolated scenarios passed, including valid reruns and Pi-before-Claude ordering."
    },
    {
      "command": "timeout 300 bun test",
      "result": "passed",
      "summary": "1074 tests and 3537 expectations passed across 90 files."
    },
    {
      "command": "timeout 300 bash -lc 'cd installer && bun run bundle-template && bun run build:all -- darwin-x64'",
      "result": "passed",
      "summary": "Static Darwin x64 Mach-O build completed."
    },
    {
      "command": "uname -s -m",
      "result": "passed",
      "summary": "Linux x86_64; native macOS execution is an explicit external gap."
    },
    {
      "command": "read-only git show-ref/git ls-remote checks for installer-v0.41.0 and feat/installer-beta",
      "result": "passed",
      "summary": "No local/remote active-change tag or pushed feature branch found."
    },
    {
      "command": "read-only gh run list/release view checks for installer-v0.41.0",
      "result": "passed",
      "summary": "No 0.41.0 workflow run or GitHub release found; expected release lookup absence was guarded."
    }
  ],
  "validationOutput": [
    "package=0.41.0, source=0.41.0, changelog=0.41.0",
    "Protected installer/install.sh and .github/workflows/installer-release.yml are unchanged.",
    "Darwin x64 static artifact is Mach-O and embeds the 0.41.0 version source plus independent template-version output path.",
    "No active-change tag, push, 0.41.0 workflow run, or GitHub release was found; historical unrelated workflow dispatch remains visible in read-only history.",
    "The initial over-specific literal strings probe failed only because Bun retained interpolation syntax; corrected static checks passed."
  ],
  "residualRisks": [
    "medium: tests/installer-runtime-menu.test.ts:418-439 lacks a direct failed/throwing shared-Bun preparation assertion.",
    "medium: native macOS execution of the Darwin binary was unavailable on Linux x86_64.",
    "info: real GitHub workflow dispatch and remote release-asset/checksum verification are intentionally deferred external delivery gates."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reverification only; implementation and tests were not edited by the verifier. The corrected local change now passes all focused suites, installer typecheck, Docker E2E, and full bun test; only this verify report was overwritten.",
  "reviewFindings": [
    "no blockers: all requested local verification commands passed.",
    "medium: tests/installer-runtime-menu.test.ts:418-439 - shared Bun preparation failure has no direct focused assertion.",
    "medium: native Darwin runtime output remains unexecuted because the host is Linux x86_64.",
    "info: real GitHub workflow dispatch was not performed; it is a post-verification external gate, not a local acceptance claim."
  ],
  "manualNotes": "status is pass for local verification with behavior_coverage partial. Do not reinterpret static Darwin cross-build as native macOS execution or read-only GitHub inspection as a real 0.41.0 workflow dispatch."
}
```
