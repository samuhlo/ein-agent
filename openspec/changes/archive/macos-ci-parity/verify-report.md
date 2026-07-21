# Verify report — macos-ci-parity

status: pass
behavior_coverage: partial
strict_tdd: inactive (`openspec/config.yaml` → `strict_tdd: false`, and `apply-progress.md` confirms TDD off for this CI/configuration slice)
skill_resolution: paths-injected
date: 2026-07-21
verifier: sdd-verify

**Status:** `pass`
**Behavior coverage:** `partial`
**Strict TDD:** off (`openspec/config.yaml` → `strict_tdd: false`, and `apply-progress.md` confirms TDD off for this CI/configuration slice).
**Date:** 2026-07-21
**Verifier:** `sdd-verify` (executor), retry of an earlier verifier that returned empty output and produced no artifact.

## 1. Executive summary

All four executable checks from the task contract pass with exit `0` and produce the expected evidence. Both static inspections pass. The macos-ci-parity change implements exactly what `scope.md` and `design.md` specify and touches no file outside the agreed surface.

**Caveat that must not be glossed over:** hosted `macos-latest` execution in GitHub Actions has NOT been observed in this session. The four commands were run on the local Linux runner used for verification. The structural pieces (matrix, shared `BUN_VERSION: "1.3.0"`, single shared step sequence, unchanged triggers) are in place, but macOS-specific behavior (shell, archive permissions, filesystem case, etc.) can only be confirmed by the actual `macos-latest` matrix run on GitHub Actions. This is the residual that blocks a `verified` behavior coverage and keeps it at `partial`.

The change is unstaged in the working tree (no commit, no push). Per task contract, no delivery action is taken from this verify phase.

## 2. Spec coverage

Cross-checked against `scope.md`, `design.md` (requirements R1–R5), `tasks.md` (group `// 001`), and `apply-progress.md`.

| Scope item | Evidence in working tree | Result |
| --- | --- | --- |
| Matrix schedules `ubuntu-latest` + `macos-latest` | `.github/workflows/ci.yml` lines 20–22: `strategy.matrix.os: [ubuntu-latest, macos-latest]` and `runs-on: ${{ matrix.os }}` | pass |
| Equivalent quality sequence, same commands/order/dirs | Single `steps:` block (lines 23–47) — checkout → setup-bun → `installer/ bun install --frozen-lockfile` → `installer/ bun run bundle-template` → root `bun test` → `installer/ bun run typecheck`. No `if:` on shared steps. | pass |
| No weakening OS conditional | `grep -nE '^\s*if:' .github/workflows/ci.yml` returns no conditionals. | pass |
| Bun pin via single workflow-level declaration | `.github/workflows/ci.yml` line 15: `env: BUN_VERSION: "1.3.0"`; line 28: `bun-version: ${{ env.BUN_VERSION }}` consumed by the single `oven-sh/setup-bun@v2` step. No per-OS selector. | pass |
| Triggers preserved | `push` to `main`, `pull_request`, `workflow_dispatch` — unchanged from before the diff. | pass |
| Docker E2E Ubuntu-only, manual, unchanged | `.github/workflows/e2e.yml` `on: workflow_dispatch`, `runs-on: ubuntu-latest`, working-tree diff = 0 bytes. | pass |
| Documentation scopes pin to main quality gate | `README.md` blockquote names `.github/workflows/ci.yml` as source of `1.3.0`, requires both matrix entries to validate, explicitly excludes publication and Docker E2E. | pass |
| Roadmap slice does NOT mark CI evidence complete | `docs/quality-roadmap/01-macos-ci-parity.md` Estado: `implemented-pending-verification`; checklist items left unchecked. | pass |
| No native Windows claim | `README.md` diff makes no Windows reference. | pass |
| Lockfile / installer source untouched | `git diff HEAD -- installer/bun.lock installer/package.json installer/tsconfig.json` = empty. | pass |

## 3. Task completion status

Group `// 001` per `tasks.md`:

- [x] **1.1** — Main quality job runs shared sequence on Ubuntu + macOS with workflow-level `BUN_VERSION: "1.3.0"`. Static confirmation: matrix, single shared `BUN_VERSION`, no OS conditional. Pass.
- [x] **1.2** — README documents the main-quality-gate-only pin and one-value update procedure; roadmap records implementation pending verification. Static confirmation: `README.md` paragraph + roadmap Estado line + unchecked completion checklist. Pass.

`apply-progress.md` marks both tasks complete and reserves suite/typecheck/bundle/CI execution for `sdd-verify` — that's exactly the slice this verify pass executes.

## 4. Verification commands and exact results

All commands run from the repository root unless noted. Output captured to `/tmp/verify_*.log` (only tails shown here). Every command is bounded with `timeout`.

### 4.1 `cd installer && bun install --frozen-lockfile`

```
$ cd installer && timeout 180 bun install --frozen-lockfile
bun install v1.3.14 (0d9b296a)
Checked 9 installs across 10 packages (no changes) [5.00ms]
exit=0
```

Result: **passed** — frozen lockfile resolves cleanly, no drift, Bun 1.3.14 runtime satisfies `>= 1.3` baseline.

### 4.2 `cd installer && bun run bundle-template`

```
$ cd installer && timeout 180 bun run bundle-template
$ bun run scripts/bundle-template.ts
/// template empaquetado
  origen:  /home/samuhlo/Documentos/01_Code/ein-agent/ein-pi/core + /home/samuhlo/Documentos/01_Code/ein-agent/ein-pi/agent
  salida:  /home/samuhlo/Documentos/01_Code/ein-agent/installer/src/assets/template.tar.gz
  tamano:  0.84 MB
exit=0
```

Result: **passed** — packaging smoke produces 0.84 MB tarball, the same artifact the test suite will read.

### 4.3 `bun test` (repository root)

```
$ timeout 300 bun test
...
 655 pass
 0 fail
 1948 expect() calls
Ran 655 tests across 73 files. [4.19s]
exit=0
```

Result: **passed** — full suite green on the local Linux runner. No flakiness observed in this run.

### 4.4 `cd installer && bun run typecheck`

```
$ cd installer && timeout 180 bun run typecheck
$ tsc --noEmit
exit=0
```

Result: **passed** — `tsc --noEmit` clean, no diagnostics. The installer's own `package.json` defines `typecheck` as `tsc --noEmit`.

### 4.5 Static inspection — `.github/workflows/ci.yml`

```yaml
# excerpt
env:
  BUN_VERSION: "1.3.0"

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}
      - name: Install installer deps
        working-directory: installer
        run: bun install --frozen-lockfile
      - name: Bundle template (packaging smoke + test prerequisite)
        working-directory: installer
        run: bun run bundle-template
      - name: Test (workbench + installer)
        run: bun test
      - name: Typecheck installer
        working-directory: installer
        run: bun run typecheck
```

Result: **passed** — matrix has exactly the two required OS entries; `BUN_VERSION` is declared once at workflow scope and consumed by the single shared setup step; the existing step sequence (checkout, bun install frozen, bundle template, root test, installer typecheck) is shared, in order, with the same working directories. No `if:` weakens a check on either OS.

### 4.6 Static inspection — `.github/workflows/e2e.yml`

```
$ git diff HEAD -- .github/workflows/e2e.yml | wc -c
0
$ grep -nE 'ubuntu-latest|macos-latest|workflow_dispatch' .github/workflows/e2e.yml
8:  workflow_dispatch:
15:    runs-on: ubuntu-latest
```

Result: **passed** — `e2e.yml` remains Ubuntu-only, manually dispatched, and is byte-identical to its pre-change state. The macOS matrix does not absorb it.

## 5. Strict TDD compliance

Not applicable this phase.

- `openspec/config.yaml` sets `strict_tdd: false`.
- `apply-progress.md` records `TDD: off.` for this CI/configuration slice.
- `scope.md` "Verification boundary" explicitly states: "Strict TDD is off because this is a CI/configuration slice."
- `tasks.md` group `// 001` declares "TDD is off. Apply uses static workflow/document inspection only; full suite, installer typecheck, template packaging, and GitHub Actions matrix evidence are reserved for `sdd-verify`."

The four executable checks above discharge exactly that reserved evidence.

## 6. Assertion quality

Not applicable — no test was authored in this slice. The verification is execution of the pre-existing test suite and the installer's `tsc --noEmit`.

## 7. Residual risks and explicit blockers

1. **Hosted `macos-latest` execution unconfirmed.** Linux runs of all four commands pass. The `macos-latest` GitHub Actions runner has not been observed in this session. Possible macOS-only failure modes (tar flag differences, filesystem case, archive permissions, shell tool differences) remain latent until the first real matrix run. This is the gap that holds behavior coverage at `partial` instead of `verified`. Closing the gap requires one successful GitHub Actions run with both matrix entries green.
2. **Working tree not committed.** All changes are unstaged: `.github/workflows/ci.yml`, `README.md`, and the untracked `docs/quality-roadmap/01-macos-ci-parity.md`. Verification ran against this state. A subsequent `git add` + `git commit` is a delivery action reserved for the parent/ein-git and is out of scope for this verify phase.
3. **Other in-flight changes in the working tree.** Unrelated to macos-ci-parity but visible in `git status --short`: `CHANGELOG.md`, `docs/review-workload-guard.md`, `docs/sdd-roadmap/04-sdd-next-dispatcher.md`, `docs/sdd-roadmap/README.md`, `ein-pi/agent/lib/sdd-router.ts`, `openspec/config.yaml`, `tests/sdd-config-bootstrap.test.ts`, `EIN.md`, `.sdd/changes/ein-sdd-state-machine-map/`, `openspec/changes/release-experience-roadmap/`, `openspec/changes/zero-friction-sdd-start/`. They belong to other open changes (release-experience-roadmap, zero-friction-sdd-start, etc.) and do not affect this verification, but the parent should be aware that the working tree is dirty beyond this slice.
4. **`e2e.yml` still uses `bun-version: latest`.** Out of scope per design (`Requirement 4` and decision C.5). The change does not promise a repo-wide Bun pin; it pins only the main quality gate. This is consistent with the design intent but worth restating.

No CRITICAL blockers. No fix-and-resume work for the parent unless they choose to wait for the GitHub Actions macOS run before treating the slice as fully verified.

## 8. Recommendation

Emit `status: pass` for the slice on local evidence. Hold any claim of "macOS verified" until at least one GitHub Actions run completes both matrix entries green. Update `docs/quality-roadmap/01-macos-ci-parity.md` checklist items (`Matriz declarada` / `Política Bun documentada` / `Evidencia de CI archivada`) only after that run, ideally as part of a separate apply that records the run URL.

---

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Change is limited to the agreed surface: .github/workflows/ci.yml (matrix + workflow-level BUN_VERSION: '1.3.0' + shared step sequence), README.md (one paragraph naming the quality-gate pin and the deliberate one-value update procedure), and the untracked docs/quality-roadmap/01-macos-ci-parity.md (Estado: implemented-pending-verification, completion checklist still unchecked). installer/bun.lock, installer/package.json, installer/tsconfig.json, installer source, .github/workflows/e2e.yml, and the release workflow are untouched (git diff HEAD -- ... = 0 bytes for the lockfile/package.json/tsconfig.json/e2e.yml). No Windows, no release-publication, no Docker-on-macOS, no lockfile-format, no package-manager change. All four executable checks (bun install --frozen-lockfile, bun run bundle-template, bun test, bun run typecheck) pass with exit 0."
    }
  ],
  "changedFiles": [
    ".github/workflows/ci.yml",
    "README.md",
    "docs/quality-roadmap/01-macos-ci-parity.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "cd installer && bun install --frozen-lockfile",
      "result": "passed",
      "summary": "exit 0 — 9 installs / 10 packages, no changes against frozen bun.lock; Bun runtime 1.3.14"
    },
    {
      "command": "cd installer && bun run bundle-template",
      "result": "passed",
      "summary": "exit 0 — embedded template tarball written to installer/src/assets/template.tar.gz (0.84 MB)"
    },
    {
      "command": "bun test",
      "result": "passed",
      "summary": "exit 0 — 655 pass / 0 fail across 73 files, 1948 expect() calls, 4.19s on local Linux runner"
    },
    {
      "command": "cd installer && bun run typecheck",
      "result": "passed",
      "summary": "exit 0 — tsc --noEmit clean, no diagnostics"
    },
    {
      "command": "static: grep + sed over .github/workflows/ci.yml",
      "result": "passed",
      "summary": "Matrix os=[ubuntu-latest, macos-latest]; runs-on ${{ matrix.os }}; single env.BUN_VERSION='1.3.0' consumed by the single shared oven-sh/setup-bun@v2 step; single shared steps block in order checkout→setup-bun→install(frozen)→bundle→test→typecheck; no OS conditional weakens a check."
    },
    {
      "command": "static: git diff HEAD -- .github/workflows/e2e.yml",
      "result": "passed",
      "summary": "Diff is 0 bytes — e2e.yml unchanged; still on: workflow_dispatch and runs-on: ubuntu-latest, no macOS."
    }
  ],
  "validationOutput": [
    "Step 1 (bun install --frozen-lockfile): bun install v1.3.14 (0d9b296a); Checked 9 installs across 10 packages (no changes) [5.00ms]; exit=0",
    "Step 2 (bun run bundle-template): salida /home/samuhlo/Documentos/01_Code/ein-agent/installer/src/assets/template.tar.gz tamano 0.84 MB; exit=0",
    "Step 3 (bun test): Ran 655 tests across 73 files. [4.19s]; 655 pass / 0 fail / 1948 expect() calls; exit=0",
    "Step 4 (bun run typecheck): tsc --noEmit; exit=0",
    "Static ci.yml: matrix.os=[ubuntu-latest, macos-latest]; runs-on ${{ matrix.os }}; env.BUN_VERSION='1.3.0' consumed once; shared steps block preserved in original order with original working-directory values",
    "Static e2e.yml: workflow_dispatch + runs-on: ubuntu-latest unchanged; working-tree diff is empty (0 bytes)"
  ],
  "residualRisks": [
    "Hosted macos-latest execution in GitHub Actions is UNCONFIRMED in this session — local Linux runs of all four commands pass, but macOS-only failure modes (tar flags, filesystem case, archive permissions, shell tool differences) can only be ruled out by an actual GitHub Actions macos-latest run. This is the only reason behavior coverage is partial and not verified.",
    "Working tree is dirty beyond this slice (release-experience-roadmap, zero-friction-sdd-start, etc.); the macos-ci-parity diff itself is unstaged. No commit/push performed by verify (per task contract).",
    "e2e.yml still uses bun-version: latest — intentional and out of scope of this slice per design Requirement 4 and decision C.5 (pin is scoped to the main quality gate only)."
  ],
  "noStagedFiles": true,
  "diffSummary": "Adds an ubuntu-latest + macos-latest matrix to .github/workflows/ci.yml with a single workflow-level BUN_VERSION='1.3.0' env var consumed by the shared oven-sh/setup-bun@v2 step; preserves the existing install/bundle/test/typecheck step sequence and working directories exactly. Adds a one-paragraph policy note to README.md naming the quality-gate pin and the one-value deliberate update procedure. Adds docs/quality-roadmap/01-macos-ci-parity.md in 'implemented-pending-verification' state with checklist items intentionally unchecked.",
  "reviewFindings": [
    "no blockers — all six checks from the task contract pass",
    "no overclaim: hosted macOS execution remains unobserved; partial behavior coverage is the truthful state",
    "no scope widening: change touches exactly the three files called out by scope/design/tasks"
  ],
  "manualNotes": "Behavior coverage is intentionally 'partial' (not 'verified') because macos-latest has not run in GitHub Actions during this session. The four local commands above exercise exactly the sequence the matrix will run, on Ubuntu; macOS is structurally guaranteed by the matrix but not behaviorally observed. Closing the gap needs one real GitHub Actions run with both matrix entries green; the parent should record that run URL in the roadmap checklist when it lands."
}
```
