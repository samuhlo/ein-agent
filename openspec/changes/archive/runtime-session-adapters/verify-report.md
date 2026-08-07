# Verification Report — runtime-session-adapters

status: pass
behavior_coverage: partial
skill_resolution: paths-injected

## Executive result

Independent re-verification passes after the approved launch-plan/type remediation. The focused adapter suite passes 33 tests / 227 assertions, and the combined adapter plus compatibility run passes 103 tests / 497 assertions. The four provider isolation values are exact and every tested post-construction mutation is rejected before executor invocation.

Behavior coverage is **partial** because the real Pi/Claude processes and the default process executor remain intentionally uninvoked. The injectable executor boundary, launch normalization, cancellation, privacy, no-write, and perimeter behavior are exercised and green. No production build was run.

## Inputs reviewed

- `openspec/changes/runtime-session-adapters/scope.md`
- `openspec/changes/runtime-session-adapters/map.md`
- `openspec/changes/runtime-session-adapters/design.md`
- `openspec/changes/runtime-session-adapters/tasks.md`
- `openspec/changes/runtime-session-adapters/apply-progress.md`
- `openspec/changes/runtime-session-adapters/specs/sdd-lifecycle/spec.md`
- `openspec/config.yaml`
- `EIN.md`
- `ein-pi/agent/lib/runtime-session-adapters.ts`
- `ein-pi/agent/lib/sessions.ts`
- `ein-pi/agent/lib/project-state.ts`
- `tests/runtime-session-adapters.test.ts`
- `tests/sessions.test.ts`
- `tests/shared-project-state.test.ts`
- `tests/installer-runtime-menu.test.ts`

The implementation task file has all five task groups checked. `apply-progress.md` contains RED → GREEN → TRIANGULATE → REFACTOR evidence for groups 1–5 and the approved verification remediation group 6.

## Specification coverage

| Requirement | Coverage | Verification result |
|---|---|---|
| 1. Normalized asymmetric surface | verified | Pi/Claude factories, provider/operation/outcome envelopes, and the exact capability matrix remain green. |
| 2. Exact project/state binding | verified in exercised paths | Repository root/subdirectory matching, exact non-repository cwd, complete repository `stateRef`, stale/wrong-project binding, inconsistent identity, and unknown state cases pass. No basename or neighboring-repository match is accepted. |
| 3. Opaque/private metadata | verified | Pi references remain `pi:v1:sha256:<64 lowercase hex>`; first-line-only metadata, serialized privacy, path/id/cwd/transcript/prompt/message/secret exclusion, and bounded B references pass. |
| 4. Bounded Pi listing | verified | Scope filtering precedes limits; malformed/missing metadata, unreadable entries, deterministic ties, 1,024-byte first-line behavior, duplicate references, and 4,096-candidate fail-closed overflow pass. |
| 5. Request-only create/resume | verified | Create remains non-persisting/request-only; Pi and Claude resume remain explicitly unsupported after envelope/reference validation; cross-provider references reject. |
| 6. Capability matrix | verified | Pi advertises list/create/launch; Claude advertises create/launch; Claude list and both resumes remain unsupported. |
| 7. Fixed isolated launch boundary | verified for the injectable boundary | Tests observe fixed executable/empty argv, selected metacharacter-safe cwd, `shell: false`, and exact environment values. All four post-construction provider-environment mutation cases reject before the executor is reached. The real process path remains uninvoked by policy. |
| 8. Pure B metadata translation | verified | Capability/reference/reason mapping remains bounded and pure; state, verification, runtime stores, and persistence are not mutated. |
| 9. Deterministic failures/cancellation/exit | verified for injected execution | Abort, zero/non-zero exit, signal, spawn failure, missing executable, malformed result, and private diagnostic redaction pass through the injectable executor. Default Bun process execution remains unobserved. |
| 10. No migration/freshness claim | verified | No-write, no-history-transfer, no-projector, immutable-input, ownership, and verification-freshness assertions remain green. |

Overall specification coverage is **partial** only for the explicitly retained real-process/default-executor gap (and the existing unexercised malformed supplied request-project edge noted in the prior report); all implemented and injectable behavior requested for this remediation is green.

## Task completion

- Task 1.1: complete and independently behavior-tested.
- Task 2.1: complete; legacy `sessions.ts` behavior independently green.
- Task 3.1: complete; lifecycle/state binding, capability asymmetry, unsupported resume/list, and no-write behavior green.
- Task 4.1: complete; fixed plans, structured non-shell executor, exact environment integrity, cancellation, exits, signals, and spawn failures green.
- Task 5.1: complete; pure B metadata translation and compatibility/privacy behavior green.
- Verification remediation group 6: complete; strict diagnostics and launch-plan environment-integrity blockers from the prior report are closed in the touched adapter/test.

## Commands and results

### Focused behavior

- `timeout 300 bun test tests/runtime-session-adapters.test.ts` — **passed**, 33 tests / 227 assertions.
- `timeout 300 bun test tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/shared-project-state.test.ts tests/installer-runtime-menu.test.ts` — **passed**, 103 tests / 497 assertions.
- `timeout 300 bun test tests/sessions.test.ts && timeout 300 bun test tests/shared-project-state.test.ts && timeout 300 bun test tests/installer-runtime-menu.test.ts` — **passed**, respectively 5 / 14, 39 / 160, and 26 / 96 assertions.

The focused suite specifically exercises:

- exact Pi and Claude environment key/value snapshots;
- empty argv, selected cwd, trusted executable, and shell-disabled structured input;
- mutation of `PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME`, `CLAUDE_CONFIG_DIR`, and Claude `PATH`, with executor invocation asserted false for every mutation;
- capability/project binding, Pi scan/filter/overflow, unsupported Claude list and Pi/Claude resume;
- privacy/no-write, metadata translation, no migration, cancellation, exit, signal, and spawn-error normalization.

### TypeScript

- `timeout 300 bash -lc 'cd installer && bun run typecheck'` — **passed** (`tsc --noEmit`).
- `timeout 300 ./installer/node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler --moduleDetection force --allowImportingTsExtensions --verbatimModuleSyntax --noUncheckedIndexedAccess --noFallthroughCasesInSwitch --types bun ein-pi/agent/lib/runtime-session-adapters.ts ein-pi/agent/lib/sessions.ts ein-pi/agent/lib/project-state.ts tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/shared-project-state.test.ts tests/installer-runtime-menu.test.ts` — **failed at the repository root** with only `TS2688: Cannot find type definition file for 'bun'`, because Bun types resolve from `installer/node_modules`.
- `timeout 300 bash -lc 'cd installer && ./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler --moduleDetection force --allowImportingTsExtensions --verbatimModuleSyntax --noUncheckedIndexedAccess --noFallthroughCasesInSwitch --types bun ../ein-pi/agent/lib/runtime-session-adapters.ts ../ein-pi/agent/lib/sessions.ts ../ein-pi/agent/lib/project-state.ts ../tests/runtime-session-adapters.test.ts ../tests/sessions.test.ts ../tests/shared-project-state.test.ts ../tests/installer-runtime-menu.test.ts'` — **failed with known imported/baseline diagnostics only**.

The corrected strict closure reports zero diagnostics attributable to `ein-pi/agent/lib/runtime-session-adapters.ts`, `ein-pi/agent/lib/sessions.ts`, `tests/runtime-session-adapters.test.ts`, or `tests/sessions.test.ts`. Remaining diagnostics are outside this adapter remediation: missing `@earendil-works/pi-coding-agent` declarations in existing Ein imports; existing strict errors in `openspec-spec-parser.ts`, `openspec-spec-sync.ts`, `sdd-guardrails.ts`, and `sdd-router.ts`; missing installer Fish/archive asset declarations; and existing `tests/installer-runtime-menu.test.ts:187` narrowing diagnostics.

### Hygiene, privacy/no-write, and perimeter

- `git diff --check && git diff --cached --quiet` — **passed**; no tracked whitespace errors and no staged files.
- The no-index checks for the four untracked implementation/test files (`ein-pi/agent/lib/runtime-session-adapters.ts`, `ein-pi/agent/lib/sessions.ts`, `tests/runtime-session-adapters.test.ts`, `tests/sessions.test.ts`) — **passed**; each `git diff --no-index --check /dev/null <file>` returned its expected non-identical exit 1 with no whitespace diagnostics.
- The no-write/perimeter guard captured `git status --porcelain=v1 --untracked-files=all` and SHA-256 hashes for the four implementation/test files, ran `timeout 300 bun test tests/runtime-session-adapters.test.ts`, then compared status and hashes — **passed**; both remained unchanged. Fixture writes stayed under `/tmp` and no source, runtime store, installer, Fish, OpenSpec, EIN, Git, or verification path was modified by the checks.
- `git status --short --untracked-files=all` — **observed** the same pre-existing dirty/untracked perimeter; no staged files or verification-side source changes appeared. The intentional verification artifact is this `verify-report.md`.
- No production build and no real Pi/Claude runtime invocation were run, per task constraints.

## Strict TDD compliance

`openspec/config.yaml` has `strict_tdd: true`. `apply-progress.md` contains the required TDD Cycle Evidence tables, including remediation group 6. Reported focused test files exist and were independently run. The remediation mutation tests are substantive: they mutate each provider isolation value, invoke `executeLaunchPlan`, assert `invalid-request`, and assert the executor was not called. The test suite contains no tautological loops, ghost loops, type-only assertions, smoke-only assertions, or implementation-detail CSS checks. The configured installer typecheck is green; the corrected targeted strict closure is green for all touched adapter/session/test files, with only pre-existing/imported diagnostics elsewhere.

## Review findings and residual risks

1. **No blocker — remediation verified.** `ein-pi/agent/lib/runtime-session-adapters.ts` now retains exact per-plan environment snapshots and rejects all four tested environment mutations before executor invocation; `tests/runtime-session-adapters.test.ts` independently proves this for Pi and Claude.
2. **Residual, medium — injectable-only real-process gap.** The default `Bun.spawn` path, executable resolution against an installed Pi/Claude runtime, and actual runtime exit behavior were not exercised. This is intentional under the task constraint not to invoke real runtimes. A later harmless fixture-executable smoke test through the default executor would close the process-boundary gap without launching Pi/Claude.
3. **Residual, low — malformed supplied request-project object edge.** The prior report noted this was not independently exercised; no regression was observed in the exercised exact-binding paths.
4. **Baseline note, non-attributable.** The full corrected strict command remains nonzero because of imported/pre-existing diagnostics listed above; there are zero attributable diagnostics in the changed adapter/session/focused-test files. The configured installer typecheck remains green.

Exact blockers: **none attributable to `runtime-session-adapters` remediation**.

## Acceptance evidence

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Independent focused and combined suites pass; the remediation is confined to the adapter/test contract and its OpenSpec record, with zero attributable strict diagnostics and no staged or verification-side source changes."
    }
  ],
  "changedFiles": [
    "ein-pi/agent/lib/runtime-session-adapters.ts",
    "ein-pi/agent/lib/sessions.ts",
    "tests/runtime-session-adapters.test.ts",
    "tests/sessions.test.ts",
    "openspec/changes/runtime-session-adapters/apply-progress.md",
    "openspec/changes/runtime-session-adapters/verify-report.md"
  ],
  "testsAddedOrUpdated": [
    "tests/runtime-session-adapters.test.ts",
    "tests/sessions.test.ts"
  ],
  "commandsRun": [
    {
      "command": "timeout 300 bun test tests/runtime-session-adapters.test.ts",
      "result": "passed",
      "summary": "33 tests passed; 227 assertions"
    },
    {
      "command": "timeout 300 bun test tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/shared-project-state.test.ts tests/installer-runtime-menu.test.ts",
      "result": "passed",
      "summary": "103 tests passed; 497 assertions"
    },
    {
      "command": "timeout 300 bun test tests/sessions.test.ts && timeout 300 bun test tests/shared-project-state.test.ts && timeout 300 bun test tests/installer-runtime-menu.test.ts",
      "result": "passed",
      "summary": "5, 39, and 26 tests passed"
    },
    {
      "command": "timeout 300 bash -lc 'cd installer && bun run typecheck'",
      "result": "passed",
      "summary": "Configured installer typecheck passed"
    },
    {
      "command": "corrected strict targeted tsc command from installer over adapter, sessions, ProjectStateV1, and required tests",
      "result": "failed",
      "summary": "Only known imported/pre-existing baseline diagnostics; zero adapter/session/focused-test diagnostics"
    },
    {
      "command": "git diff --check && git diff --cached --quiet",
      "result": "passed",
      "summary": "No tracked whitespace errors and no staged files"
    },
    {
      "command": "no-write/perimeter guard with status and SHA-256 comparisons around focused tests",
      "result": "passed",
      "summary": "Status and targeted source/test hashes unchanged"
    }
  ],
  "validationOutput": [
    "behavior_coverage: partial; injectable adapter behavior is exercised and green, while real Pi/Claude processes remain intentionally uninvoked.",
    "Exact Pi and Claude environment values and all four mutation rejection cases passed before executor invocation.",
    "No production build or real runtime invocation was performed."
  ],
  "residualRisks": [
    "medium: default Bun.spawn and installed Pi/Claude runtime behavior remain injectable-only; see ein-pi/agent/lib/runtime-session-adapters.ts.",
    "low: malformed supplied request-project object edge remains unexercised from the prior report.",
    "non-attributable: corrected whole-program strict closure retains existing imported/baseline diagnostics outside the changed adapter/session/test files."
  ],
  "noStagedFiles": true,
  "diffSummary": "Approved remediation preserves the normalized Pi/Claude adapter, bounded Pi scan, compatibility behavior, fixed argv/cwd and shell-disabled boundary, and adds exact launch-environment integrity rejection.",
  "reviewFindings": [
    "none: no blocker attributable to runtime-session-adapters remediation; zero strict diagnostics in ein-pi/agent/lib/runtime-session-adapters.ts, ein-pi/agent/lib/sessions.ts, tests/runtime-session-adapters.test.ts, or tests/sessions.test.ts.",
    "residual medium: default process executor remains uninvoked by the explicit no-real-runtime constraint (ein-pi/agent/lib/runtime-session-adapters.ts)."
  ],
  "manualNotes": "The full corrected strict command is nonzero only for known imported/pre-existing diagnostics; the configured installer typecheck and all touched adapter/session/test diagnostics are clean."
}
```
