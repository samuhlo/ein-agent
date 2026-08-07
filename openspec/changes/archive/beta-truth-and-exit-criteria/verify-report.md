status: pass
behavior_coverage: n-a

# Verification report: beta-truth-and-exit-criteria

## Executive result

The approved remediation is verified. The documentation-only patch satisfies REQ-01–REQ-07 and success criteria 1–10. README release wording is explicitly local and does not claim independently verified remote publication or assets; installer runtime examples are separate, shell-copy-safe commands. No product behavior changed.

## Scope and artifacts reviewed

Reviewed the current:

- `design.md`
- `tasks.md`
- `apply-progress.md`
- `scope.md`
- `map.md`
- `memory-receipts.jsonl`
- `openspec/config.yaml`
- allowed project patch: `README.md`, `docs/roadmap-beta.md`, `installer/README.md`

No project documentation was edited during verification. This report is the only artifact overwritten.

## Spec coverage: REQ-01–REQ-07

| Requirement | Result | Verification |
|---|---|---|
| REQ-01 | PASS | `docs/roadmap-beta.md:6-9,53-60` names the maintained beta record and preserves `docs/roadmap-features-ein.md` as the authority for prioritization and A–L order; no competing roadmap is created. |
| REQ-02 | PASS | `docs/roadmap-beta.md:3,14-30` identifies the local `installer 0.42.0` baseline and explicitly says the baseline and historical foundations do not prove B–E or launcher readiness. |
| REQ-03 | PASS | `docs/roadmap-beta.md:64-110` contains the complete Requirements, Posterior / beta-excluded, and Discarded for beta classifications, including the required project/runtime, state, session, doctor, freshness, updater, TUI, history, and mutation boundaries. |
| REQ-04 | PASS | `docs/roadmap-beta.md:113-176` publishes BE-01 through BE-06 as measurable gates, including known/incomplete/unavailable/stale state, freshness invalidation, and the installer-versus-launcher E2E boundary. |
| REQ-05 | PASS | `docs/roadmap-beta.md:195-210` labels stale claims as superseded or historical and preserves native macOS, shared-Bun, remote-publication, and live Claude MCP limits. README release wording at `README.md:121,142` explicitly denies remote-release and independent-asset verification. |
| REQ-06 | PASS | `README.md:23-40,114-145` and `installer/README.md:1-20,75-108` describe isolated Pi/Claude installer surfaces, installer ownership, and no implemented launcher. Installer E2E is explicitly not launcher E2E. |
| REQ-07 | PASS | The attributable project-document patch is confined to `README.md`, `docs/roadmap-beta.md`, and `installer/README.md`; no product code, tests, specs, workflows, E2E, release metadata, changelog, canonical roadmap, catalog, archived evidence, or unrelated working-tree file is part of this change. `spec_delta: none` remains recorded. |

## Success criteria 1–10

1. **PASS:** scoped project diff names exactly the three allowed documentation files. The unrelated deleted and untracked files remain present in the status snapshot; no cleanup, restore, stage, or normalization command was used.
2. **PASS:** `docs/roadmap-beta.md:3,14-30` identifies installer 0.42.0 and denies B–E/launcher completion.
3. **PASS:** the complete three-way classification and uniquely labeled BE-01 through BE-06 are present.
4. **PASS:** `docs/roadmap-beta.md:38-45` states A truth gate → B shared state → C runtime adapters → D minimal launcher → E launcher E2E hardening.
5. **PASS:** `docs/roadmap-beta.md:20-28,180-190` retains native macOS, shared-Bun, remote 0.41.0 publication, and live Claude MCP limits, and distinguishes installer E2E from launcher E2E.
6. **PASS:** focused stale-claim grep finds only historical/reconciliation-table references. No unqualified current-facing claim says 0.40.0 is current, parity/installer work is pending, runtime selection is unavailable, or installer E2E proves launcher E2E.
7. **PASS:** both READMEs describe isolated Pi and Claude surfaces and installer ownership. `README.md` uses `--runtime pi|claude|both` as installer behavior; `installer/README.md` provides three separate commands for `pi`, `claude`, and `both`, with no pipe operator in executable examples.
8. **PASS:** the full diff and scoped names show no attributable change to canonical roadmap/catalog, changelog, archived changes, workflows/E2E, release metadata, product code, tests, or canonical specs.
9. **PASS:** no behavior delta file exists; `spec_delta: none` remains explicit in `design.md`, `scope.md`, and `docs/roadmap-beta.md`.
10. **PASS:** `git diff --check` passed. Tests, build, and typecheck were intentionally not run because this is documentation-only.

## Task completion

`tasks.md` has all task checkboxes 1.1 through 4.2 checked. `apply-progress.md` reports apply complete and no remaining tasks. The remediation section records the release-wording correction, shell-safe selector commands, and TDD evidence update.

## Strict TDD compliance and assertion quality

**PASS — not applicable, honestly documented.** `openspec/config.yaml:1` remains `strict_tdd: true`, but this change is explicitly non-behavioral and Markdown-only. `apply-progress.md:81-89` contains the required `TDD Cycle Evidence` table and records:

- applicability: not applicable;
- no fabricated RED/GREEN cycle;
- repository strict-TDD configuration preserved unchanged; and
- the scoped documentation-only exception.

The design and task boundary require no product source or test change and explicitly prohibit tests/build/typecheck for this slice. No test files are reported, so there are no test paths to cross-reference and no changed assertions to audit. Assertion-quality checks for tautologies, ghost loops, type-only assertions, smoke-only tests, and implementation-detail CSS assertions are therefore not applicable. Strict TDD does not require invented cycles for this non-behavioral change.

## Perimeter and preservation

- `git diff --name-only -- README.md docs/roadmap-beta.md installer/README.md` returned exactly `README.md`, `docs/roadmap-beta.md`, and `installer/README.md`.
- The non-allowlisted tracked diff contains only the pre-existing `docs/ein-multiagente-plan.md` and `docs/review-workload-guard.md` deletions and `docs/roadmap-beta.md` is not included there; the status snapshot also retains the unrelated untracked catalogs/drafts.
- `git diff --cached --name-only` returned no staged files.
- `git diff --name-only -- openspec/specs` returned no spec changes.
- No behavior delta candidate exists in `openspec/changes/beta-truth-and-exit-criteria/`.

## Commands and validation

| Command | Result | Summary |
|---|---|---|
| `timeout 300 git diff --check -- docs/roadmap-beta.md README.md installer/README.md` | passed | No whitespace errors. |
| `timeout 300 git diff --name-only -- docs/roadmap-beta.md README.md installer/README.md` | passed | Exactly the three allowlisted project docs. |
| `timeout 300 grep -nE 'BE-0[1-6]' docs/roadmap-beta.md` | passed | BE-01 through BE-06 found exactly once each. |
| `timeout 300 grep -nF '0.42.0' docs/roadmap-beta.md README.md` | passed | Local 0.42.0 baseline references found. |
| `timeout 300 grep -nF -- '--runtime pi|claude|both' README.md installer/README.md` | passed | Installer-only selector contract found in README; installer README uses separate commands. |
| `timeout 300 grep -nEi '0\\.40\\.0|core-parity.{0,40}pending|pending.{0,40}core-parity|installer-beta.{0,40}pending|pending.{0,40}installer-beta|--runtime.{0,40}(unavailable|no existe|no existía)|E2E.{0,40}(never|nunca|no se ha ejecutado)|última release|latest' docs/roadmap-beta.md README.md installer/README.md || true` | passed | Matches are limited to historical/reconciliation annotations and the installer’s generic future-release bootstrap wording; no stale current-facing claim remains. |
| `timeout 300 awk 'BEGIN { in_code=0 } /^```/ { in_code=!in_code; next } in_code && /ein install --runtime/ { print NR ":" $0; if ($0 ~ /\\|/) bad=1 } END { if (bad) exit 1 }' installer/README.md` | passed | Selector examples are three separate commands with no shell pipeline operator. |
| `timeout 300 git status --short --untracked-files=all` | passed | Unrelated dirty/deleted/untracked state remains present. |
| `timeout 300 git diff --cached --name-only` | passed | No staged files. |
| `timeout 300 git diff --name-only -- openspec/specs` | passed | No canonical spec changes. |
| `timeout 300 find openspec/changes/beta-truth-and-exit-criteria -maxdepth 1 -type f ! -name 'design.md' ! -name 'tasks.md' ! -name 'apply-progress.md' ! -name 'scope.md' ! -name 'map.md' ! -name 'memory-receipts.jsonl' ! -name 'verify-report.md' -print` | passed | No behavior delta file. |
| `timeout 300 grep -nF 'spec_delta: none' openspec/changes/beta-truth-and-exit-criteria/design.md openspec/changes/beta-truth-and-exit-criteria/scope.md docs/roadmap-beta.md` | passed | Spec-delta declaration retained. |
| `bun test` | not-run | Prohibited by the documentation-only verification request. |
| `bun run build` | not-run | Prohibited by the documentation-only verification request. |
| `cd installer && bun run typecheck` | not-run | Prohibited by the documentation-only verification request. |

No tests, build, or typecheck were run.

## Findings and residual risks

- No blocker, high, or medium finding.
- **LOW / documentation boundary:** the current baseline is local repository evidence only; remote workflow execution, publication, assets, native macOS execution, and live Claude MCP remain unverified by design and are explicitly labeled as such.
- No behavioral regression can be inferred from this documentation-only review; behavioral coverage is intentionally `n-a`, not a test pass.

## Final assessment

**PASS.** The approved remediation closes the prior release-wording, shell-selector, and TDD-evidence gaps. The patch is documentation-only, behavior coverage is not applicable, and no project behavior or unrelated working-tree state was changed.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "No blocker findings: README.md, docs/roadmap-beta.md, and installer/README.md pass the perimeter, wording, selector, historical-boundary, E2E-separation, and TDD-evidence review."
    }
  ],
  "changedFiles": [
    "README.md",
    "docs/roadmap-beta.md",
    "installer/README.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "timeout 300 git diff --check -- docs/roadmap-beta.md README.md installer/README.md",
      "result": "passed",
      "summary": "No whitespace errors."
    },
    {
      "command": "timeout 300 git diff --name-only -- docs/roadmap-beta.md README.md installer/README.md",
      "result": "passed",
      "summary": "Exactly the three allowlisted project docs."
    },
    {
      "command": "timeout 300 grep -nE 'BE-0[1-6]' docs/roadmap-beta.md",
      "result": "passed",
      "summary": "BE-01 through BE-06 present."
    },
    {
      "command": "timeout 300 grep -nF '0.42.0' docs/roadmap-beta.md README.md",
      "result": "passed",
      "summary": "Local baseline references present."
    },
    {
      "command": "timeout 300 grep -nF -- '--runtime pi|claude|both' README.md installer/README.md",
      "result": "passed",
      "summary": "Installer-only runtime contract confirmed."
    },
    {
      "command": "timeout 300 awk 'BEGIN { in_code=0 } /^```/ { in_code=!in_code; next } in_code && /ein install --runtime/ { print NR \":\" $0; if ($0 ~ /\\|/) bad=1 } END { if (bad) exit 1 }' installer/README.md",
      "result": "passed",
      "summary": "Runtime examples are separate shell-safe commands."
    },
    {
      "command": "bun test",
      "result": "not-run",
      "summary": "Not run by explicit documentation-only instruction."
    },
    {
      "command": "bun run build",
      "result": "not-run",
      "summary": "Not run by explicit documentation-only instruction."
    },
    {
      "command": "cd installer && bun run typecheck",
      "result": "not-run",
      "summary": "Not run by explicit documentation-only instruction."
    }
  ],
  "validationOutput": [
    "Perimeter diff contains exactly the three allowed project docs.",
    "No staged files, canonical spec changes, or behavior delta file were found.",
    "Unrelated deleted and untracked working-tree paths remain preserved.",
    "README explicitly disclaims remote publication and independent asset verification.",
    "Installer E2E is explicitly distinct from future launcher E2E."
  ],
  "residualRisks": [
    "Remote workflow/publication/assets, native macOS, and live Claude MCP remain unverified and are explicitly bounded in the documentation.",
    "Behavioral coverage is not applicable because no product behavior changed; tests/build/typecheck were intentionally not run."
  ],
  "noStagedFiles": true,
  "diffSummary": "Documentation-only reconciliation across README.md, docs/roadmap-beta.md, and installer/README.md; unrelated working-tree state preserved.",
  "reviewFindings": [
    "none: no blocker findings in README.md, docs/roadmap-beta.md, or installer/README.md"
  ],
  "manualNotes": "Strict TDD is enabled repository-wide, but apply-progress.md contains honest not-applicable TDD Cycle Evidence for this Markdown-only scope; no RED/GREEN cycle was fabricated."
}
```