# Verification report — `add-installer-runtime-menu`
status: pass
behavior_coverage: verified

skill_resolution: paths-injected

## Skill applicability

- Bun and Ein discipline: applied for bounded typecheck/build/test execution, SDD artifact cross-checking, and fail-closed reporting.
- Vitest: skipped because this repository uses Bun's test runner; no Vitest configuration or changed Vitest surface exists.
- Web design guidelines and web-quality audit: skipped because this is a terminal installer/TUI, not a web interface.
- Zod: skipped because the reviewed delta adds no Zod schemas or parsing boundary.

## Verdict

The post-verify remediation is verified. Claude-only installation no longer performs Pi Solo/Team mode prompting or logging; the interactive Install branch forwards the selected target exactly once. Focused tests, installer regressions, the full suite, the packaged Linux x64 build/install smoke, and non-interactive Claude-only/both runtime smokes all passed.

Behavioral coverage is full: tests exercise target forwarding, orchestration, failure/cleanup, launcher ownership, and migration gates; runtime smokes exercise real staged Claude sync, launcher creation, Pi isolation, both-target ordering, and payload cleanup.

## Scope and delta reviewed

Cross-referenced `scope.md`, `design.md`, `tasks.md`, and `apply-progress.md`. Per the retry request, post-verify code review was limited to:

- `installer/src/cli/install.ts`: Claude-only target gating around Pi mode interaction and target orchestration.
- `installer/src/cli/menu.ts`: runtime prompt and one-call target forwarding.
- `tests/installer-runtime-menu.test.ts`: direct `runMenu` forwarding coverage and existing runtime assertions.

No production files were edited during verification; only this report was rewritten.

## Spec coverage

| Requirement | Result | Evidence |
|---|---|---|
| R1 selection/cancellation | pass | Focused menu tests expose Pi, Claude Code, Both; cancellation returns cleanly; the real Install branch forwards `claude` exactly once. |
| R2 isolation/shared work | pass | `runInstall` gates Pi mode work when target is Claude; focused orchestration tests prove selected runners, one Bun preparation, and exactly-once execution; Claude-only smoke created no Pi state. |
| R3 migration/path resolution | pass | Focused tests cover vanilla/malformed preservation, valid migration, conflict fail-closed behavior, and explicit context threading; packaged Pi smoke wrote the isolated marker. |
| R4 Pi behavior/launcher | pass | Packaged Linux x64 install smoke and both-target smoke observed isolated Pi deployment, doctor completion, marker, and `pi-ein.fish`. |
| R5 deterministic Claude payload | pass | Linux x64 build generated the 835-file payload; real Claude-only and both smokes executed staged sync from an unrelated cwd and confirmed staging cleanup. |
| R6 Claude failure semantics | pass | Focused required-sync failure skips the launcher; launcher failure is reported; optional warning remains non-blocking; real sync completed before launcher installation. |
| R7 launcher ownership/idempotence | pass | Focused test verifies exact Pi/Claude content, parent creation, idempotence, and preservation of an unrelated Fish function. |
| R8 both aggregation | pass | Focused test proves Pi-then-Claude continuation/aggregation; real both smoke observed both result lines and both launchers. |

## Task completion

`tasks.md` marks tasks 1.1 through 6.2 complete. `apply-progress.md` records `status: complete`, including the post-verify remediation. Task completion: complete.

## Strict TDD stance

Strict TDD is explicitly **OFF for this change**, as declared in the scope/session stance and repeated in `apply-progress.md`. This change-level decision overrides the global `openspec/config.yaml` default of `strict_tdd: true`; per the retry request, no retroactive `TDD Cycle Evidence` table is required and its absence is not a blocker. The focused assertions are substantive (filesystem effects, call ordering, target forwarding, cleanup, and failure propagation), with no tautological/type-only or ghost-loop assertions observed.

## Commands and validation

All bounded checks below used a 300-second per-command timeout where applicable:

- `timeout 300 bash -lc 'cd installer && bun run typecheck'` — passed.
- `timeout 300 bun test tests/installer-runtime-menu.test.ts` — passed: 19 tests, 62 assertions.
- `timeout 300 bun test tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts tests/deps-pi.test.ts tests/deps-codegraph.test.ts tests/deps-hypa.test.ts tests/installed-agent-inventory.test.ts tests/legacy-paths-veto.test.ts tests/install-sh-wsl.test.ts tests/updater-cli-entrypoints.test.ts` — passed: 35 tests, 121 assertions.
- `timeout 300 bun test` — passed: 945 tests, 2,742 assertions, 84 files.
- `timeout 300 bash -lc 'cd installer && bun run build:all -- linux-x64'` — passed; generated the 835-file Claude payload and `installer/dist/ein-installer-linux-x64`.
- `timeout 300 bash -lc 'cd /tmp && /home/samuhlo/Documentos/01_Code/ein-agent/installer/dist/ein-installer-linux-x64 --version && /home/samuhlo/Documentos/01_Code/ein-agent/installer/dist/ein-installer-linux-x64 --help'` — passed from unrelated cwd.
- `timeout 300 bash -lc 'set -euo pipefail; home=$(mktemp -d); trap "rm -rf \\\"$home\\\"" EXIT; cd /tmp; HOME="$home" XDG_CONFIG_HOME="$home/.config" /home/samuhlo/Documentos/01_Code/ein-agent/installer/dist/ein-installer-linux-x64 install --yes --no-secrets --no-linear --no-engram --no-hypa --no-codegraph; test -f "$home/.pi-ein/agent/.ein-install.json"; test -f "$home/.config/fish/functions/pi-ein.fish"; test ! -e "$home/.pi/agent"; echo PACKAGED_LINUX_X64_INSTALL_SMOKE=passed'` — passed; temporary HOME contained isolated Pi marker and `pi-ein.fish`, with no legacy Pi directory.
- `timeout 300 /tmp/ein-claude-only-smoke.sh` — passed; real Claude sync, `cc-ein.fish`, no `.pi`/`.pi-ein`, no Pi mode log/prompt, and no new `ein-cc-payload-*` staging directory.
- `timeout 300 /tmp/ein-both-smoke.sh` — passed; real Pi then Claude outputs, both launchers/core outputs, isolated Pi path, and no payload staging leak.
- `git diff --check && git status --short` — passed; no whitespace errors and no verifier-created production edits.
- `git diff --cached --name-status` — passed with no staged files.

An initial ad hoc inline Claude smoke wrapper failed before application execution because of malformed shell quoting; it was replaced by the bounded `/tmp/ein-claude-only-smoke.sh` command above, which passed. No interactive PTY was attempted.

## Findings and residual risks

- **No blockers (INFO):** `installer/src/cli/install.ts` now gates the Pi mode prompt/logging on `target !== "claude"`; the focused direct `runMenu` test in `tests/installer-runtime-menu.test.ts` confirms one-call forwarding through `installer/src/cli/menu.ts`.
- **Low residual risk:** packaged execution was validated for Linux x64 only; other target binaries/host combinations remain outside this run.
- **Low residual risk:** the Pi doctor reports one existing warning for a detectable Linear token in the temporary smoke environment; install result remained `OK_WITH_WARNINGS` with zero failures.

## Acceptance

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "No blocking findings. installer/src/cli/install.ts target-gates Pi mode work, installer/src/cli/menu.ts forwards one selected target, and tests/installer-runtime-menu.test.ts plus bounded runtime smokes verify the changed behavior."
    }
  ],
  "changedFiles": [
    "installer/src/cli/install.ts",
    "installer/src/cli/menu.ts",
    "tests/installer-runtime-menu.test.ts"
  ],
  "testsAddedOrUpdated": [
    "tests/installer-runtime-menu.test.ts"
  ],
  "commandsRun": [
    {
      "command": "timeout 300 bash -lc 'cd installer && bun run typecheck'",
      "result": "passed",
      "summary": "Installer TypeScript check passed."
    },
    {
      "command": "timeout 300 bun test tests/installer-runtime-menu.test.ts",
      "result": "passed",
      "summary": "19 focused tests passed."
    },
    {
      "command": "timeout 300 bun test tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts tests/deps-pi.test.ts tests/deps-codegraph.test.ts tests/deps-hypa.test.ts tests/installed-agent-inventory.test.ts tests/legacy-paths-veto.test.ts tests/install-sh-wsl.test.ts tests/updater-cli-entrypoints.test.ts",
      "result": "passed",
      "summary": "35 relevant installer regression tests passed."
    },
    {
      "command": "timeout 300 bun test",
      "result": "passed",
      "summary": "945 tests passed across 84 files."
    },
    {
      "command": "timeout 300 bash -lc 'cd installer && bun run build:all -- linux-x64'",
      "result": "passed",
      "summary": "Linux x64 binary built with 835-file Claude payload."
    },
    {
      "command": "timeout 300 /tmp/ein-claude-only-smoke.sh",
      "result": "passed",
      "summary": "Claude-only real sync passed without Pi mode interaction or Pi state; launcher and payload cleanup verified."
    },
    {
      "command": "timeout 300 /tmp/ein-both-smoke.sh",
      "result": "passed",
      "summary": "Both-target real smoke passed in Pi-then-Claude order with both launchers and cleanup."
    },
    {
      "command": "timeout 300 bash -lc 'set -euo pipefail; home=$(mktemp -d); trap \"rm -rf \\\"$home\\\"\" EXIT; cd /tmp; HOME=\"$home\" XDG_CONFIG_HOME=\"$home/.config\" /home/samuhlo/Documentos/01_Code/ein-agent/installer/dist/ein-installer-linux-x64 install --yes --no-secrets --no-linear --no-engram --no-hypa --no-codegraph; test -f \"$home/.pi-ein/agent/.ein-install.json\"; test -f \"$home/.config/fish/functions/pi-ein.fish\"; test ! -e \"$home/.pi/agent\"; echo PACKAGED_LINUX_X64_INSTALL_SMOKE=passed'",
      "result": "passed",
      "summary": "Packaged Linux x64 Pi install smoke passed in temporary HOME."
    }
  ],
  "validationOutput": [
    "Focused menu, orchestration, migration, launcher, payload, cleanup, and failure assertions passed.",
    "Claude-only produced Claude core/launcher output and no Pi directories or mode interaction.",
    "Both produced Pi and Claude outputs once, in Pi-then-Claude order, with no payload staging leak.",
    "Packaged Linux x64 binary built and installed Pi into the isolated path from /tmp."
  ],
  "residualRisks": [
    "Low: only Linux x64 packaged execution was exercised.",
    "Low: Pi doctor retained one non-failing Linear-token warning in the smoke environment."
  ],
  "noStagedFiles": true,
  "diffSummary": "Verification rewrote the stale report; no production edits were made during this phase. Post-verify target gating and menu forwarding are green.",
  "reviewFindings": [
    "no blockers (INFO): installer/src/cli/install.ts target-gates Pi mode interaction and installer/src/cli/menu.ts forwards the selected target once; focused and runtime checks passed."
  ],
  "manualNotes": "The change-level TDD stance is explicitly OFF and overrides the global strict_tdd default; retroactive strict-TDD evidence was not required."
}
```
