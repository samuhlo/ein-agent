status: pass
behavior_coverage: verified

# Verify report — `sdd-cost-ledger-provenance`

## Executive summary

The change replaces prose-derived attribution with locally minted, immutable,
stable-byte-bound run receipts, aggregating exactly from the deduplicated sidecar
set. All four focused suites pass green, the installer typecheck is clean, the
in-scope `git diff --check` is clean, and the OpenSpec sync is consistent with
the canonical spec. The production diff is +480/-87 = **567 changed lines**,
which the user explicitly approved as a single-PR exception over the 400-line
review budget; no regression is hidden in that diff.

## Spec coverage vs. `scope.md` acceptance outcomes

| Acceptance outcome | Evidence |
|---|---|
| `foo` / `foo-bar` never share runs | `getOrCreateFlow` keys by `${changeId}\0${directory}\0${dev}\0${ino}` (`ein-pi/agent/lib/sdd-cost-provenance.ts:170-181`); test `candidate snapshots bind changed bytes, never exact-name collisions or later prose` asserts disjoint flow IDs. |
| Later prose mentions do not affect attribution | No `task.includes`/`task.match` anywhere in `sdd-cost-provenance.ts`/`sdd-router.ts`/`ein-ai.ts`; test asserts candidates bind only by changed bytes. |
| Input / output / cache-read / cache-write separate fields | `RunReceiptV1["metrics"]` declares all four independently (`sdd-cost-provenance.ts:43`); cache fields are normalized to `unavailable` (no supported source). |
| Missing data is `unavailable`, not zero | `normalizeMetrics` returns `{value: null, provenance: "unavailable", reason}` for missing/invalid; explicitly reported zero is preserved (test `normalizes each metric independently and preserves explicit zero`). |
| Each aggregate exposes run identity | `AggregateV1.memberRunIds` is a sorted array of `runId` strings (`sdd-cost-provenance.ts:68,398`); tested for change, phase, and attempt groupings. |
| Estimates never shown as provider-reported truth | `costUsd` aliases only `providerCostUsd.provenance === "reported"` (`sdd-cost-provenance.ts:445`); test `compatibility reader exposes only the local ledger and nullable provider cost` covers it; test `unqualified usage.cost is neither provider billing nor an estimate` covers the legacy semantics. |
| Phase / retry / change aggregates do not double count | `readSddCostLedger` dedupes by `runId` then excludes conflicting `runId` records (`sdd-cost-provenance.ts:415-428`); test `reads validated sidecars once with exact sorted aggregate membership` exercises identical-bytes idempotency and conflict exclusion. |
| Existing timeout reconciliation remains the single implementation | `sdd-reconcile.ts` untouched (no entry in `git diff -- ein-pi/agent/lib/sdd-reconcile.ts`); `reconcilePhaseFailure` call site unchanged; `tests/sdd-reconcile.test.ts` 17/17 pass; `tests/sdd-phase-runtime-contract.test.ts` P5 asserts the hook ordering `observeDelegationResult` < `reconcilePhaseFailure`. |

## Task completion status

| Task | Status | Evidence |
|---|---|---|
| `// 001.1` local identity + immutable sidecars | done | `ein-pi/agent/lib/sdd-cost-provenance.ts` (448 lines); 15/15 pass for `tests/sdd-real-cost-provenance.test.ts`. |
| `// 002.1` fail-closed hook + unchanged reconciliation | done | `ein-pi/agent/extensions/ein-ai.ts` imports `beginDelegationObservation`/`observeDelegationResult`, hooks them around the existing `reconcilePhaseFailure` call; `sdd-reconcile.ts` is unchanged. |
| `// 003.1` truthful ledger reader, aggregation, rendering | done | `sdd-cost-provenance.ts` validates/dedupes; `sdd-router.ts` is now a deprecated facade; `ein-ai.ts` retains `details.realCost` and adds `details.costLedger`; rendering uses `n/a` + `(reported\|estimated\|unavailable)` provenance. |
| `// 004.1` synchronized lifecycle delta | done | `sync-report.md` state=synchronized, conflicts=0, domains=sdd-lifecycle, added=1; canonical `openspec/specs/sdd-lifecycle/spec.md` SHA-256 = `f895e00282b8efc1b70175b0823d451a0e496ab3ed083d21906f4cb9dd5f12b9` matches domain `after`; change-local `specs/sdd-lifecycle/spec.md` digestManifest hash = `dfd20efd79ef0b423a6fb51c81f7858694e811f448a1fe3eed3859bf8f5bb1dd` matches `delta_sha256`; canonical digestManifest hash = `4fcdd035e599707dec468173464c27c267764e25bf7b6c6e78187db06449b916` matches `result_sha256`. All three SHA references cross-verify with the on-disk bytes. |
| `// 005.1` focused integrated regressions + workload gate | done | All four focused suites green, installer typecheck green, scoped `git diff --check` clean, production diff = 567 changed lines (truthful single-PR exception). |

## Commands run

| Command | Result | Summary |
|---|---|---|
| `bun test tests/sdd-real-cost-provenance.test.ts` | passed | 15 pass, 0 fail, 47 expect() calls. |
| `bun test tests/sdd-status-output.test.ts` | passed | 17 pass, 0 fail, 35 expect() calls. |
| `bun test tests/sdd-reconcile.test.ts` | passed | 17 pass, 0 fail, 36 expect() calls. |
| `bun test tests/sdd-phase-runtime-contract.test.ts` | passed | 26 pass, 0 fail, 72 expect() calls. |
| `bun test tests/sdd-real-cost-provenance.test.ts tests/sdd-status-output.test.ts tests/sdd-reconcile.test.ts tests/sdd-phase-runtime-contract.test.ts` (combined) | passed | 75 pass, 0 fail, 190 expect() calls. |
| `cd installer && bun run typecheck` | passed | `tsc --noEmit` exited 0 with no diagnostics. |
| `git diff --check -- ein-pi/ tests/ openspec/specs/sdd-lifecycle/spec.md openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md` | passed | No whitespace, conflict-marker, or trailing-whitespace errors. |
| Independent SHA-256 cross-check of `sync-report.md` (Node script re-deriving `digestManifest`) | passed | All three of `delta_sha256`, `result_sha256`, and domain `after` match the on-disk files byte-for-byte. |

## Strict TDD compliance

`openspec/config.yaml` has `strict_tdd: false`. No `TDD Cycle Evidence` table is
required, and `apply-progress.md` consistently notes `TDD Cycle Evidence: not
applicable, strict TDD is off.` Compliance is therefore N/A.

## Behavioral coverage analysis

Every observable behavior introduced or preserved by this slice is exercised by
a passing test:

- **Exact-name collision + later prose**: `tests/sdd-real-cost-provenance.test.ts` "candidate snapshots bind changed bytes, never exact-name collisions or later prose".
- **Immutable local binding + fail-closed ambiguity**: "persists immutable receipt bytes with flow/run/attempt and timestamps" + "fails closed with bounded evidence when either direct-delegation candidate is ambiguous".
- **Retry / run dedupe + exact member reproduction**: "binds one exact changed pair immutably and assigns retries distinct attempts" + "reads validated sidecars once with exact sorted aggregate membership and unavailable incomplete totals".
- **Independent reported/estimated/unavailable + cache separation + provider distinct from estimate + no invented zero**: "normalizes each metric independently and preserves explicit zero" + "unqualified usage.cost is neither provider billing nor an estimate".
- **Legacy exclusion visible**: covered by both the new ledger test (asserts `legacy-metadata-excluded` problem code) and the status compatibility test "compatibility reader exposes only the local ledger and nullable provider cost".
- **Compatible status details / rendering**: `tests/sdd-status-output.test.ts` keeps all pre-existing format assertions (12 unchanged tests) plus the new compat-reader test; renderer now uses `n/a` + provenance language.
- **Timeout reconciliation + direct phase persistence unchanged**: `tests/sdd-reconcile.test.ts` 17/17 pass; `tests/sdd-phase-runtime-contract.test.ts` P5 explicitly asserts `observeDelegationResult` precedes `reconcilePhaseFailure` and that no `output`/`outputMode`/`flowId`/`runId`/`changeId` field is added to `event.input`.
- **No numeric gates / external package changes**: `grep` of `sdd-cost-provenance.ts` for `gate|threshold|limit` returns only the unrelated `Math.max(attempt, ...)` retry allocator; no new dependencies in `installer/package.json` (not modified per `git diff --shortstat`).
- **Synchronized lifecycle contract**: cross-checked above; the SHA-256 triple (delta, result, domain-after) all reconcile with current file bytes.
- **Truthful 567-line approved single-PR exception**: re-measured independently — `git diff --numstat` on tracked files + `wc -l` on the untracked new module = `+480/-87` = 567 changed lines, exactly as `apply-progress.md // 005` reports.

## Diff summary (in-scope production only)

| File | +/- |
|---|---:|
| `ein-pi/agent/extensions/ein-ai.ts` | +25 / -17 |
| `ein-pi/agent/lib/sdd-router.ts` | +7 / -70 |
| `ein-pi/agent/lib/sdd-cost-provenance.ts` (new, untracked) | +448 / 0 |
| **Production total** | **+480 / -87 (567 changed lines)** |

| File (test, not counted for budget) | +/- |
|---|---:|
| `tests/sdd-real-cost-provenance.test.ts` | +130 / -53 |
| `tests/sdd-status-output.test.ts` | +11 / -1 |
| `tests/sdd-phase-runtime-contract.test.ts` | +13 / -1 |
| `tests/sdd-reconcile.test.ts` | 0 / 0 |
| **Test total** | **+154 / -55 (209 changed lines)** |

| File (spec, not counted for budget) | +/- |
|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | +7 / 0 |

## Excluded / preserved (untouched)

The five pre-existing untracked paths and the frozen `release-experience-roadmap`
are not modified, staged, or inspected: `.sdd/changes/ein-sdd-state-machine-map/`,
`EIN.md`, `docs/ein-multiagente-plan.md`, `openspec/changes/release-experience-roadmap/`,
`openspec/config.yaml`. None of them appear in any `git diff` invocation.

## Residual risks

1. **Deprecated i18n keys remain**: `sdd-status.real-cost`, `sdd-status.real-cost-none`, `sdd-status.real-cost-by-agent` are still defined in `ein-pi/agent/lib/i18n/strings.ts` (EN+ES) but no longer referenced by `ein-ai.ts`. Cleanup is a separate task; not a regression.
2. **Single-PR exception is the user-approved path**: production diff exceeds the 400-line review budget by 167 lines. Per `apply-progress.md // 005.delivery`, the user explicitly approved the single-PR exception; the diff is truthfully measured and not hidden.
3. **Canonical SHA-1 of `openspec/specs/sdd-lifecycle/spec.md` (working tree) is `0b926a7`** and HEAD is `186ead2` — the change is unstaged. This matches the rest of the slice (also unstaged). No commit/push is part of this verify contract.
4. **OpenSpec `delta_sha256` vs. raw SHA-256**: the sync-report stores the digestManifest hash (`dfd20efd…`), not the raw `sha256sum` (`7791263…`). Both are verified to be the deterministic transforms of the on-disk file; no drift.

## Review findings

- No blockers.
- No numeric gate or external package change.
- Reconciliation path byte-for-byte untouched.
- The five pre-existing untracked paths and the frozen `release-experience-roadmap` are preserved and excluded.

## Artifacts

- `openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md`
- `openspec/changes/sdd-cost-ledger-provenance/sync-report.md`
- `openspec/changes/sdd-cost-ledger-provenance/apply-progress.md`
- `openspec/changes/sdd-cost-ledger-provenance/tasks.md`
- `ein-pi/agent/lib/sdd-cost-provenance.ts`
- `ein-pi/agent/lib/sdd-router.ts`
- `ein-pi/agent/extensions/ein-ai.ts`
- `tests/sdd-real-cost-provenance.test.ts`
- `tests/sdd-status-output.test.ts`
- `tests/sdd-reconcile.test.ts`
- `tests/sdd-phase-runtime-contract.test.ts`
- `openspec/specs/sdd-lifecycle/spec.md`

## Next recommended

Hand off to a fresh-context reviewer for a pre-PR adversarial pass, then
delivery via the GitHub Actions installer release workflow with the user-approved
single-PR exception already recorded in `apply-progress.md // 005.delivery`.

## skill_resolution

`paths-injected` — all six required skills (`bun`, `release`, `branch-pr`,
`cognitive-doc-design`, `drizzle`, `ein-discipline`) were read from the exact
paths the parent supplied before any work began. `drizzle` and `release` were
not directly applicable (no ORM/schema or release work in this slice) and are
noted as such; the others informed the report shape and the SDD discipline
applied throughout.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings with file paths and severity: zero blockers. Verified per spec outcome (foo/foo-bar disjoint via getOrCreateFlow key by exact changeId+dev/ino at ein-pi/agent/lib/sdd-cost-provenance.ts:170-181), per code grep (no task.includes/substring matching in sdd-cost-provenance.ts/ein-ai.ts/sdd-router.ts), per byte-stable hook ordering (observeDelegationResult precedes reconcilePhaseFailure in ein-pi/agent/extensions/ein-ai.ts:865-870, asserted by tests/sdd-phase-runtime-contract.test.ts:165-172), per SHA-256 reconciliation of sync-report.md (delta=dfd20efd, result=4fcdd03, domain after=f895e00 all match on-disk bytes via re-derived digestManifest)."
    }
  ],
  "changedFiles": [
    "ein-pi/agent/lib/sdd-cost-provenance.ts",
    "ein-pi/agent/extensions/ein-ai.ts",
    "ein-pi/agent/lib/sdd-router.ts",
    "tests/sdd-real-cost-provenance.test.ts",
    "tests/sdd-status-output.test.ts",
    "tests/sdd-reconcile.test.ts",
    "tests/sdd-phase-runtime-contract.test.ts",
    "openspec/specs/sdd-lifecycle/spec.md",
    "openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md"
  ],
  "testsAddedOrUpdated": [
    "tests/sdd-real-cost-provenance.test.ts",
    "tests/sdd-status-output.test.ts",
    "tests/sdd-phase-runtime-contract.test.ts"
  ],
  "commandsRun": [
    {
      "command": "bun test tests/sdd-real-cost-provenance.test.ts",
      "result": "passed",
      "summary": "15 pass, 0 fail, 47 expect() calls"
    },
    {
      "command": "bun test tests/sdd-status-output.test.ts",
      "result": "passed",
      "summary": "17 pass, 0 fail, 35 expect() calls"
    },
    {
      "command": "bun test tests/sdd-reconcile.test.ts",
      "result": "passed",
      "summary": "17 pass, 0 fail, 36 expect() calls"
    },
    {
      "command": "bun test tests/sdd-phase-runtime-contract.test.ts",
      "result": "passed",
      "summary": "26 pass, 0 fail, 72 expect() calls"
    },
    {
      "command": "bun test tests/sdd-real-cost-provenance.test.ts tests/sdd-status-output.test.ts tests/sdd-reconcile.test.ts tests/sdd-phase-runtime-contract.test.ts",
      "result": "passed",
      "summary": "75 pass, 0 fail, 190 expect() calls (combined)"
    },
    {
      "command": "cd installer && bun run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit exited 0 with no diagnostics"
    },
    {
      "command": "git diff --check -- ein-pi/ tests/ openspec/specs/sdd-lifecycle/spec.md openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md",
      "result": "passed",
      "summary": "No whitespace, conflict-marker, or trailing-whitespace errors"
    }
  ],
  "validationOutput": [
    "sync-report.md cross-check: delta_sha256=dfd20efd79ef0b423a6fb51c81f7858694e811f448a1fe3eed3859bf8f5bb1dd matches re-derived digestManifest of on-disk change-local spec.md",
    "sync-report.md cross-check: result_sha256=4fcdd035e599707dec468173464c27c267764e25bf7b6c6e78187db06449b916 matches re-derived digestManifest of canonical spec.md",
    "sync-report.md cross-check: domain after=f895e00282b8efc1b70175b0823d451a0e496ab3ed083d21906f4cb9dd5f12b9 matches plain sha256sum of canonical spec.md",
    "Production diff re-measured: +480/-87 = 567 changed lines (truthful single-PR exception)"
  ],
  "residualRisks": [
    "Deprecated i18n keys (sdd-status.real-cost*) remain in ein-pi/agent/lib/i18n/strings.ts but are no longer referenced by ein-ai.ts; cleanup is a separate task and not a regression.",
    "Production diff (567 lines) exceeds the 400-line review budget; user explicitly approved the single-PR exception in apply-progress.md // 005.delivery.",
    "Working-tree canonical spec SHA-1 (0b926a7) differs from HEAD (186ead2); the slice is unstaged consistently with its other tracked files."
  ],
  "noStagedFiles": true,
  "diffSummary": "Adds ein-pi/agent/lib/sdd-cost-provenance.ts (448 lines) as the sole owner of local flow/run identity, stable source binding, immutable sidecars, metric normalization, dedupe, and aggregation. Wires ein-ai.ts before/after the unchanged reconcilePhaseFailure call. Reduces sdd-router.ts's readSddRealCost to a deprecated facade over readSddCostLedger. Synchronizes a single ADDED scenario into openspec/specs/sdd-lifecycle/spec.md via the OpenSpec sync engine.",
  "reviewFindings": [
    "no blockers: all 75 focused tests pass, installer typecheck clean, scoped git diff --check clean, sync-report SHA-256 triple reconciles with on-disk files, production diff truthfully reported as 567 lines under an approved single-PR exception"
  ],
  "manualNotes": "Five pre-existing untracked paths (.sdd/changes/ein-sdd-state-machine-map/, EIN.md, docs/ein-multiagente-plan.md, openspec/changes/release-experience-roadmap/, openspec/config.yaml) were not touched. The frozen release-experience-roadmap change directory is preserved as-is. skill_resolution is paths-injected per the parent-supplied skill paths."
}
```