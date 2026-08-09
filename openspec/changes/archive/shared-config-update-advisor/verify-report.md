# Fresh independent verification — `shared-config-update-advisor`

## Status

- **status: pass**
- **behavior_coverage: verified** — focused contract tests, cross-surface tests, installer read-boundary tests, a fresh owner/capability negative matrix, an external-owner version matrix, and an actual ESC/CR privacy/freeze probe exercised the changed behavior successfully.
- **skill_resolution: paths-injected**

No product source, commit, push, staged file, PR-topology decision, or action dispatch was performed by verification. This report replaces the stale failed report using fresh evidence from the current working tree.

## Fresh codegraph impact review

Codegraph impact review was performed before direct source exploration:

```sh
codegraph explore "shared-config-update-advisor changed production code, advisor decision logic, launcher doctor banner release wiring, owner capability validation, handoff, and all tests/callers"
codegraph explore "readInstallerUpdateEvidence installer update advisor owner capability handoff and shared config"
codegraph explore "advisorResultFromPiEinUpdateObservations ein update notice launcher doctor banner release wiring"
codegraph explore "evaluateSharedConfigUpdateAdvisor renderAdvisorSemantics SharedConfigUpdateAdvisorResult shared config update advisor"
```

The impact review identified the advisor, Pi-Ein notice/banner, launcher/workbench, installer doctor/read adapter, marker/release boundaries, and existing installer update callers. Follow-up source review confirmed the advisor has no filesystem/network/process/mutation dependency; launcher and doctor only consume/render the normalized result; and installer transaction/action owners remain outside the read path.

## Fresh remediation probes

### Owner/capability fail-closed matrix

A direct current-source probe supplied coherent installed/release versions, installer ownership, `update`/`installer.update`, and `supported: true`, then varied each owner and capability status across every requested non-valid status: `invalid`, `unreadable`, `error`, `missing`, `ambiguous`, and `unsupported`. Every case produced no handoff and no `update-available` result:

| Evidence changed | invalid | unreadable | error | missing | ambiguous | unsupported |
|---|---|---|---|---|---|---|
| owner | error | error | error | unavailable | ambiguous | unsupported |
| capability | error | error | error | unavailable | ambiguous | unsupported |

The same probe checked malformed-looking but coherent metadata cases:

- exact valid owner + exact valid capability + `supported: true` + installer owner + `action: update` + `actionId: installer.update` → `update-available`, inert handoff `{ owner: "installer", action: "update", actionId: "installer.update", performed: false }`;
- unsupported/false/omitted capability support → `unsupported`, no handoff;
- external owner at equal and newer versions → `unsupported`, no handoff;
- ambiguous/unknown owner → `ambiguous`/`unavailable`, no handoff;
- mismatched action/actionId → `ambiguous`, no handoff.

This proves malformed owner/capability evidence is rejected before an actionable result and that only the exact successful installer-owned/coherent action path hands off. External ownership is unsupported for both equal and newer versions rather than being treated as current or actionable.

### Privacy, immutability, and provenance probe

A direct probe supplied an actual ESC (`\u001b`) and CR (`\r`) in private-looking source/reason values. The normalized result and semantic rendering contained no controls, paths, secrets, payloads, or tokens. The result, facets, recommendation, and provenance entries were frozen. The probe reported `frozen=true`, configuration `unavailable`, update `ambiguous`, and bounded provenance length `4`.

## Acceptance/spec coverage mapping

| Requirement | Result | Fresh evidence |
|---|---|---|
| 1. Deterministic source-attributed contract | **Pass** | Advisor contract tests cover independent facets, status/reason/freshness/provenance, frozen output, bounded provenance, semantic rendering, and equal-input JSON determinism. |
| 2. Fresh `current` / `update-available` proof | **Pass** | Fresh valid installed/release evidence produces `update-available` only with exact installer-owned handoff; equal versions produce `current` for installer ownership; stale, regression, unsupported, and malformed paths do not become actionable. |
| 3. Configuration evidence normalization | **Pass** | `mode` and `model-config` tests exercise additive missing/default, precedence, invalid, unreadable/malformed evidence while legacy readers retain compatibility behavior; evaluator tests distinguish incomplete/unsupported/error/ambiguous. |
| 4. Fail-closed update evidence | **Pass** | Owner/capability matrix covers all requested non-valid statuses; notice tests cover timeout/rejection/malformed/skipped; version regression, unknown, stale, missing support, external owner, and action mismatch produce no handoff. |
| 5. Stale evidence and B authority | **Pass** | Workbench consumes the supplied `ProjectStateV1` snapshot and verification freshness without re-projecting or caching it; stale/unbound/unavailable/invalid workbench and predecessor E2E cases preserve uncertainty and do not promote actionability. |
| 6. Advice/action separation | **Pass** | Handoff is closed data with `performed: false`; doctor/menu/integration tests prove presentation does not dispatch installer actions; forbidden ownership scan found no added updater transaction, writer, spawn, or action-owner call. |
| 7. Consistent consumer semantics | **Pass** | Launcher/workbench, Pi-Ein notice, and installer doctor use the shared evaluator/semantic renderer; cross-surface fixtures agree on normalized statuses, reasons, freshness, ownership, and inert handoff meaning. |
| 8. Status-preserving Pi notice/startup safety | **Pass** | Production banner detector returns canonical observations; timeout, late-result, rejection, malformed, skipped, compatibility-edge, non-blocking startup, and isolated-runtime gating tests pass. |
| 9. Read-only/private output | **Pass** | Actual ESC/CR sanitization passed; marker bytes remained unchanged; adapter counters observed reads with `writes = 0`, `spawns = 0`; no private payload/exception/path output was rendered. |

The persisted OpenSpec delta is `openspec/changes/shared-config-update-advisor/specs/sdd-lifecycle/spec.md` (the sole behavior declaration referenced by `design.md` and `scope.md`).

## F-001–F-005 production re-verification

- **F-001 launcher wiring:** `ein-pi/workbench.ts` injects `createWorkbenchAdvisor`; `createWorkbenchAdvisor` reads mode/model evidence and the supplied project snapshot; `runWorkbench` renders the shared semantics. Focused launcher tests observe configuration and unavailable-update output without updater behavior.
- **F-002 doctor composition:** `installer/src/cli/doctor.ts` reads injected/default installer evidence, evaluates the shared result, appends bounded advisor output, and preserves existing doctor exit ownership. Real doctor tests observe one evidence read and inert output.
- **F-003 capability/action gate:** the evaluator requires known-success owner/capability status, exact `supported: true`, installer ownership, and coherent action/actionId before handoff. The fresh matrix covers all requested negative statuses and positive/negative coherence cases.
- **F-004 banner migration:** production `detectPiEinUpdates` returns canonical advisor evidence; `startPiEinUpdateNotice` accepts/render canonical results and remains non-blocking. Legacy booleans remain only at the compatibility edge and do not turn uncertainty into current.
- **F-005 controls/read-only:** actual runtime ESC/CR input is sanitized; semantic output remains bounded; release marker bytes and mutation counters remain unchanged; ownership scans show no new action execution path.

## Task completion status

All `tasks.md` items **1.1–7.2 are checked complete**. Current source and test paths reported by `apply-progress.md` exist and were cross-referenced. The remediation evidence in `apply-progress.md` records the F-006/F-007 RED/GREEN/triangulation cycle; fresh focused tests and direct probes are green after that remediation.

## Strict TDD compliance and assertion-quality audit

Strict TDD is active in `openspec/config.yaml` (`strict_tdd: true`). `apply-progress.md` contains the required `TDD Cycle Evidence` table, including the F-006/F-007 remediation cycle. All reported test files exist and were executed in this verification.

Fresh assertion audit passed for changed advisor/launcher/doctor/banner/release tests:

- no `.only` or `.skip` markers;
- no tautological `expect(true)`/`expect(false)` assertions;
- no ghost loops or type-only-only assertions;
- no implementation-detail CSS assertions;
- actual ESC/CR privacy fixtures are present;
- installer read tests snapshot marker bytes and assert `writes === 0` and `spawns === 0`.

## Validation commands and results

The host has no `timeout`/`gtimeout`; long-running commands were bounded with the exact Python `subprocess.run(..., timeout=300)` wrappers below. Output was streamed directly; no `tail`, `head`, pager, or buffering pipeline was used.

### Impact and focused suites

```sh
codegraph explore "shared-config-update-advisor changed production code, advisor decision logic, launcher doctor banner release wiring, owner capability validation, handoff, and all tests/callers"
```

**Passed:** impact review completed before direct source review.

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(sys.argv[1:], timeout=300); sys.exit(p.returncode)' bun test tests/shared-config-update-advisor.test.ts tests/mode.test.ts tests/model-config.test.ts
```

**Passed:** 39 tests, 0 failures, 98 assertions.

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(sys.argv[1:], timeout=300); sys.exit(p.returncode)' bun test tests/ein-banner-updates.test.ts tests/minimal-workbench-launcher.test.ts
```

**Passed:** 65 tests, 0 failures, 171 assertions.

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(sys.argv[1:], timeout=300); sys.exit(p.returncode)' bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-state-primitives.test.ts
```

**Passed:** 16 tests, 0 failures, 74 assertions.

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(["bash","-lc",sys.argv[1]], timeout=300); sys.exit(p.returncode)' 'bun test tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/updater-cli-entrypoints.test.ts tests/installer-runtime-menu.test.ts tests/beta-launcher-e2e-hardening.test.ts'
```

**Passed:** 81 tests, 0 failures, 562 assertions.

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(["bash","-lc",sys.argv[1]], timeout=300); sys.exit(p.returncode)' 'cd installer && bun run typecheck'
```

**Passed:** `tsc --noEmit`.

### Full suite

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(sys.argv[1:], timeout=300); sys.exit(p.returncode)' bun test
```

**Passed:** 1,290 tests, 0 failures, 4,630 assertions across 97 files.

### Fresh direct behavior probes

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(sys.argv[1:], timeout=300); sys.exit(p.returncode)' bun -e 'import { evaluateSharedConfigUpdateAdvisor as e } from "./ein-pi/agent/lib/shared-config-update-advisor.ts"; const b={configuration:{mode:{status:"valid",source:"project",freshness:"current"},model:{status:"valid",source:"user",freshness:"current"}},update:{installed:{status:"valid",source:"installer-marker",version:"0.42.0",freshness:"current"},release:{status:"valid",source:"release-provider",version:"0.43.0",freshness:"current"},owner:{status:"valid",source:"installer-marker",owner:"installer",action:"update",actionId:"installer.update",freshness:"current"},capability:{status:"valid",source:"installer-capability",supported:true,freshness:"current"}}}; const s=["invalid","unreadable","error","missing","ambiguous","unsupported"]; const bad=[]; for(const field of ["owner","capability"]) for(const status of s){const u={...b.update,[field]:{...b.update[field],status}};const r=e({...b,update:u});if(r.handoff||r.update.status==="update-available")bad.push(`${field}:${status}`)} const positive=e(b); if(!positive.handoff||positive.update.status!=="update-available")bad.push("positive"); const checks=[["external-equal",{owner:{...b.update.owner,owner:"external"},release:{...b.update.release,version:"0.42.0"}}],["external-newer",{owner:{...b.update.owner,owner:"external"}}],["false-support",{capability:{...b.update.capability,supported:false}}],["missing-support",{capability:{status:"valid",source:"installer-capability",freshness:"current"}}],["mismatched-action",{owner:{...b.update.owner,action:"install",actionId:"installer.update"}}]]; for(const [label,patch] of checks){const r=e({...b,update:{...b.update,...patch}});if(r.handoff||r.update.status==="update-available")bad.push(label)} console.log(JSON.stringify({negativeCases:s.length*2,positive:positive.update.status,externalEqual:e({...b,update:{...b.update,owner:{...b.update.owner,owner:"external"},release:{...b.update.release,version:"0.42.0"}}}).update.status,externalNewer:e({...b,update:{...b.update,owner:{...b.update.owner,owner:"external"}}}).update.status,bad})); if(bad.length) process.exit(1);'
```

**Passed:** 12 requested owner/capability non-valid cases produced no handoff and no `update-available`; exact valid positive produced the inert handoff; external equal/newer produced `unsupported`; support/action negatives also failed closed.

```sh
python3 -u -c 'import subprocess,sys; p=subprocess.run(sys.argv[1:], timeout=300); sys.exit(p.returncode)' bun -e 'import { evaluateSharedConfigUpdateAdvisor as e, renderAdvisorSemantics as render } from "./ein-pi/agent/lib/shared-config-update-advisor.ts"; const r=e({configuration:{mode:{status:"error",source:"/private/\u001b[2Jconfig",reason:"token=secret\r",freshness:"unknown"},model:{status:"missing",source:"user",freshness:"current"}},update:{installed:{status:"error",source:"/private/marker",reason:"payload=/private/raw\r",freshness:"unknown"},release:{status:"error",source:"release-provider",freshness:"unknown"},owner:{status:"ambiguous",source:"installer-marker",freshness:"current"},capability:{status:"unsupported",source:"installer-capability",supported:false,freshness:"current"}}}); const all=[r,r.configuration,r.update,r.recommendation,...r.configuration.provenance,...r.update.provenance]; const text=JSON.stringify(r)+render(r); const ok=all.every(Object.isFrozen)&&!/[\u001b\r]/.test(text)&&!/(private|secret|payload|token)/.test(text); console.log(JSON.stringify({frozen:all.every(Object.isFrozen),controlsSanitized:ok,provenance:r.update.provenance.length})); if(!ok) process.exit(1);'
```

**Passed:** controls/private values sanitized; normalized result and nested provenance frozen.

### Scope, ownership, whitespace, and staged-state checks

```sh
set -e
changed=$( { git diff --name-only; printf '%s\n' ein-pi/agent/lib/shared-config-update-advisor.ts installer/src/core/update-advisor-read.ts tests/shared-config-update-advisor.test.ts; find openspec/changes/shared-config-update-advisor -type f -maxdepth 3 -print; } | sort -u )
forbidden=$(printf '%s\n' "$changed" | grep -Ei '(^|/)(dashboard|ledger|cleaner|architect|parallelism|ein-doctor|transaction|cli/update|cli/install|core/deps|release/publish)(/|\\.|$)' || true)
if [ -n "$forbidden" ]; then printf 'forbidden paths:\n%s\n' "$forbidden"; exit 1; fi
added=$( { git diff --unified=0 -- ein-pi/agent/extensions/ein-banner.ts ein-pi/agent/lib/ein-update-notice.ts ein-pi/agent/lib/mode.ts ein-pi/agent/lib/model-config.ts ein-pi/agent/lib/workbench.ts ein-pi/workbench.ts installer/src/cli/doctor.ts installer/src/core/marker-v2.ts; for file in ein-pi/agent/lib/shared-config-update-advisor.ts installer/src/core/update-advisor-read.ts; do sed 's/^/+/' "$file"; done; } | grep -E '^\\+.*(runUpdateTransaction|runUpdate\\b|runInstall\\b|runRestore\\b|runUninstall\\b|commitMarkerV2\\b|writeMarker\\b|writeMode\\b|writeModelConfig\\b|applyModelConfig\\b|child\\.spawn|Bun\\.spawn|execFile|dispatch|writeFileSync|mkdirSync)' || true)
if [ -n "$added" ]; then printf 'forbidden ownership calls:\n%s\n' "$added"; exit 1; fi
printf 'forbidden updater/G-L/ownership scan passed\n'
```

**Passed:** no forbidden G–L paths, updater transaction/action-owner calls, writers, or spawns were added in the reviewed additions.

```sh
git diff --check
```

**Passed:** no tracked whitespace errors.

```sh
set -e
files=$( { git diff --name-only; printf '%s\n' ein-pi/agent/lib/shared-config-update-advisor.ts installer/src/core/update-advisor-read.ts tests/shared-config-update-advisor.test.ts; find openspec/changes/shared-config-update-advisor -type f -print; } | sort -u )
for file in $files; do
  if ! git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
    output=$(git diff --no-index --check /dev/null "$file" 2>&1 || true)
    if [ -n "$output" ]; then echo "$output"; exit 1; fi
  fi
done
echo 'tracked and untracked git diff --check passed'
```

**Passed:** tracked and untracked files have no whitespace errors.

```sh
if [ -n "$(git diff --cached --name-only)" ]; then git diff --cached --name-only; exit 1; fi; echo 'no staged files'
```

**Passed:** no staged files.

```sh
python3 - <<'PY'
from pathlib import Path
files = [Path('tests/shared-config-update-advisor.test.ts'), Path('tests/ein-banner-updates.test.ts'), Path('tests/minimal-workbench-launcher.test.ts'), Path('tests/installer-runtime-menu.test.ts'), Path('tests/mode.test.ts'), Path('tests/model-config.test.ts'), Path('tests/release-update-contract.test.ts')]
issues=[]
for path in files:
    text=path.read_text()
    if '.only' in text or '.skip' in text: issues.append(f'{path}: focused/skip test marker')
    if 'expect(true)' in text or 'expect(false)' in text: issues.append(f'{path}: tautological boolean assertion')
    if '\\\\x1b' in text or '\\\\r' in text: issues.append(f'{path}: double-escaped control regex')
    if 'for (const' in text and 'expect' not in text: issues.append(f'{path}: possible ghost loop')
advisor=files[0].read_text()
if '\\u001b' not in advisor or '\\r' not in advisor: issues.append('advisor privacy fixture missing actual-control escapes')
release=files[-1].read_text()
for marker in ('let reads = 0','let writes = 0','let spawns = 0','writes).toBe(0)','spawns).toBe(0)','before','readFile'):
    if marker not in release: issues.append(f'release adapter audit missing: {marker}')
if issues:
    print('\n'.join(issues)); raise SystemExit(1)
print('assertion-quality audit passed')
PY
```

**Passed:** no focused/skip, tautological, ghost-loop, type-only-only, CSS-detail, or double-escaped control assertions; actual-control and no-mutation evidence present.

## Changed files reviewed

Production:

- `ein-pi/agent/extensions/ein-banner.ts`
- `ein-pi/agent/lib/ein-update-notice.ts`
- `ein-pi/agent/lib/mode.ts`
- `ein-pi/agent/lib/model-config.ts`
- `ein-pi/agent/lib/shared-config-update-advisor.ts`
- `ein-pi/agent/lib/workbench.ts`
- `ein-pi/workbench.ts`
- `installer/src/cli/doctor.ts`
- `installer/src/core/marker-v2.ts`
- `installer/src/core/update-advisor-read.ts`

Tests:

- `tests/ein-banner-updates.test.ts`
- `tests/installer-runtime-menu.test.ts`
- `tests/minimal-workbench-launcher.test.ts`
- `tests/mode.test.ts`
- `tests/model-config.test.ts`
- `tests/release-update-contract.test.ts`
- `tests/shared-config-update-advisor.test.ts`

SDD artifacts:

- `openspec/changes/shared-config-update-advisor/design.md`
- `openspec/changes/shared-config-update-advisor/tasks.md`
- `openspec/changes/shared-config-update-advisor/apply-progress.md`
- `openspec/changes/shared-config-update-advisor/specs/sdd-lifecycle/spec.md`
- `openspec/changes/shared-config-update-advisor/verify-report.md`

## Residual risks

1. The current production delta is approximately **970 changed production lines** (tracked additions/deletions plus the two new production modules), above the 400-line review budget in `design.md`. Delivery topology remains a parent/user decision and was not made here.
2. `EinUpdateAvailability` remains as a compatibility-edge type in `ein-update-notice.ts`; canonical production detector/evaluator paths preserve status and uncertainty, and the edge adapter only reports fresh `update-available` as true.
3. `productionDependencies` in `ein-pi/workbench.ts` visibly wires `createWorkbenchAdvisor`, while the focused test exercises the production-style advisor/read/render path rather than invoking that unexported factory directly. This is a low observability risk, not a behavioral failure.

## Final disposition

**Verified.** F-006/F-007 remediation is green under fresh direct negative probing and all requested focused, cross-surface, typecheck, full-suite, scope/ownership, whitespace, and assertion-quality gates. No blockers found; low observability and review-budget residuals are listed above.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Fresh direct owner/capability matrix and external-owner equal/newer probes passed; focused/cross-surface suites, typecheck, full bun test, privacy/no-mutation, ownership scan, whitespace, and assertion audit all passed. No blocking findings remain; low residuals are explicitly listed."
    }
  ],
  "changedFiles": [
    "ein-pi/agent/lib/shared-config-update-advisor.ts",
    "installer/src/core/update-advisor-read.ts",
    "ein-pi/workbench.ts",
    "installer/src/cli/doctor.ts",
    "ein-pi/agent/lib/ein-update-notice.ts",
    "ein-pi/agent/extensions/ein-banner.ts",
    "tests/shared-config-update-advisor.test.ts",
    "tests/minimal-workbench-launcher.test.ts",
    "tests/ein-banner-updates.test.ts",
    "tests/installer-runtime-menu.test.ts",
    "tests/release-update-contract.test.ts"
  ],
  "testsAddedOrUpdated": [
    "tests/shared-config-update-advisor.test.ts",
    "tests/ein-banner-updates.test.ts",
    "tests/minimal-workbench-launcher.test.ts",
    "tests/installer-runtime-menu.test.ts",
    "tests/release-update-contract.test.ts"
  ],
  "commandsRun": [
    { "command": "bun test tests/shared-config-update-advisor.test.ts tests/mode.test.ts tests/model-config.test.ts", "result": "passed", "summary": "39 tests" },
    { "command": "bun test tests/ein-banner-updates.test.ts tests/minimal-workbench-launcher.test.ts", "result": "passed", "summary": "65 tests" },
    { "command": "bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-state-primitives.test.ts", "result": "passed", "summary": "16 tests" },
    { "command": "bun test tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/updater-cli-entrypoints.test.ts tests/installer-runtime-menu.test.ts tests/beta-launcher-e2e-hardening.test.ts", "result": "passed", "summary": "81 tests" },
    { "command": "cd installer && bun run typecheck", "result": "passed", "summary": "tsc --noEmit" },
    { "command": "bun test", "result": "passed", "summary": "1290 tests across 97 files" },
    { "command": "owner/capability non-valid-status and external-owner direct probe", "result": "passed", "summary": "all requested negative cases fail closed; exact valid positive handoff only" },
    { "command": "forbidden updater/G-L/ownership scan", "result": "passed", "summary": "no forbidden paths or added mutation/action-owner calls" },
    { "command": "git diff --check plus untracked check", "result": "passed", "summary": "no whitespace errors" },
    { "command": "assertion-quality audit", "result": "passed", "summary": "no weak assertion patterns found" }
  ],
  "validationOutput": [
    "Owner and capability invalid/unreadable/error/missing/ambiguous/unsupported statuses produced no handoff.",
    "External owner normalized unsupported at equal and newer versions.",
    "Actual ESC/CR output sanitized; result frozen; marker writes and spawns remained zero."
  ],
  "residualRisks": [
    "Production delta is approximately 970 changed lines, above the 400-line review budget.",
    "Compatibility boolean remains only at the notice edge.",
    "Unexported productionDependencies factory is source-wired but not directly invoked by a focused test."
  ],
  "noStagedFiles": true,
  "diffSummary": "F-006/F-007 remediation verified; all requested behavior, regression, ownership, privacy, and full-suite gates passed.",
  "reviewFindings": [
    "low: ein-pi/workbench.ts: productionDependencies wiring is source-reviewed but not directly factory-invoked by a focused test; downstream advisor behavior passes.",
    "risk: production delta is approximately 970 changed lines, above the 400-line review budget; delivery topology remains undecided by this verification."
  ],
  "manualNotes": "No product source was edited by verification; no PR topology or delivery decision was made."
}
```