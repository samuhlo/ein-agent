status: complete
change: surface-wiring
phase: apply

## Group 1 — Shared surface runner contract

Completed task 1.1 only. Added a versioned cleaner JSON request/result protocol and shared dispatch entrypoint with explicit authority-read, mutation-write, and workbench invocation adapter interfaces. Validation rejects unsupported versions/capabilities, unknown or unsafe keys, malformed/oversized/over-complex JSON, and invalid adapter statuses/reasons/results. Diagnostics are fixed, bounded, and do not expose caught errors.

### Files changed

- `ein-pi/agent/surfaces/surface-runner.ts`
- `tests/surface-wiring.test.ts`
- `openspec/changes/surface-wiring/tasks.md`
- `openspec/changes/surface-wiring/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Versioned cleaner requests dispatch only supported capabilities and fail closed with bounded diagnostics | Import of the absent runner failed: 0 pass, 1 fail | Minimal protocol, validators, adapters, and dispatch passed 4 focused tests | Added all three capability branches, equivalent adapter failures, and workbench/unsupported entrypoint routing; 6 passed | Reviewed transport helpers and adapter boundaries; no semantic refactor was needed; final rerun stayed green | `bun test tests/surface-wiring.test.ts --test-name-pattern 'protocol|request|diagnostic'` — 6 pass, 0 fail |

### Verification

- Focused command run three times for RED, GREEN, and final triangulated/refactor state.
- No production build or full suite run. No repository-wide TypeScript configuration covers this boundary; Bun executed the focused TypeScript tests successfully.

### Deviations and risks

- No design deviations.
- Production authority adapter assembly and launcher/package wiring intentionally remain unwired for later groups.

### Remaining tasks

Groups 3–7 remain pending. Group 2 is recorded below.

## Group 2 — Authority-owned cleaner read adapters

Completed task 2.1 only. Added production authority-read assembly at the runner edge: each audit rereads B-owned project state, normalizes the canonical ledger and explicit evidence resolutions, delegates review meaning to G, and passes those assessments unchanged to the read-only audit engine. Completion remains explicitly unwired for group 3.

### Files changed

- `ein-pi/agent/surfaces/surface-runner.ts`
- `tests/surface-wiring.test.ts`
- `openspec/changes/surface-wiring/tasks.md`
- `openspec/changes/surface-wiring/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Fresh authority audit preserves unavailable, stale, mismatched, and verified evidence semantics without acquiring mutation ownership | Missing `createAuthorityReadAdapters` export caused import failure: 0 pass, 1 fail | Fresh B read, canonical G evaluation, and read-only H dispatch passed unavailable/stale/valid cases: 3 pass | Added mismatched evidence/reference case; unresolved result remained fail closed: 4 pass | Removed loose fixture typing and reviewed assembly for duplicated policy; final check stayed green | `bun test tests/surface-wiring.test.ts --test-name-pattern 'audit|authority'` — 4 pass, 0 fail |

### Verification and scope

- Final focused test command passed; `git diff --check` passed for the production and focused test files.
- No full suite, production build, or unrelated group checks were run.
- No protected B/G/H engine file changed; there were no design deviations.
- Groups 3–7 remain pending; next apply must start with group 3.

## Group 3 — Authority-owned cleaner mutation adapters

Completed task 3.1 only. Added bounded mutation/completion assembly that rereads B/G authority, rebuilds the selected H finding from the canonical workspace ledger, delegates admission/application/completion to I, and keeps completion independent of the single synchronous writer. The default filesystem seam canonicalizes the repository root, rejects links/non-regular or escaping targets, and never retries an uncertain write.

### Files changed

- `ein-pi/agent/surfaces/surface-runner.ts`
- `tests/surface-wiring.test.ts`
- `openspec/changes/surface-wiring/tasks.md`
- `openspec/changes/surface-wiring/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Fresh authority admits at most one bounded mutation and preserves blocked or uncertain outcomes | Missing `createAuthorityMutationAdapters` export: 0 pass, 1 fail | Fresh H/I assembly produced one write and kept writer failure uncertain: 4 pass | Added stale/unavailable ledger cases; first run exposed `finding-not-found` instead of uncertainty, then preserved `evidence-unavailable`: 5 pass | Removed redundant finding-id branching and reviewed root/write helpers; final focused rerun stayed green | `bun test tests/surface-wiring.test.ts --test-name-pattern 'mutate|complete'` — 5 pass, 0 fail |
| Completion is a separate fresh B/router decision and never invokes the mutation writer | Missing adapter export blocked the completion seam: 0 pass, 1 fail | Exact resulting state plus current attributable verification completed without writes: 4 pass | Added missing and stale verification; both remained `verification-required` with zero writes: 5 pass | Kept one normalized completion path with no verification execution; final focused rerun stayed green | `bun test tests/surface-wiring.test.ts --test-name-pattern 'mutate|complete'` — 5 pass, 0 fail |

### Verification and scope

- Focused RED/GREEN/triangulation command only; final state: 5 pass, 0 fail; Bun loaded the changed TypeScript without syntax errors.
- No protected ledger/audit/mutation engine changed; no full suite, typecheck, production build, launcher, packaging, or group 4 work was run.
- No design deviations. Architecture and Ein-discipline skills applied; Bun guided the focused runner. Vitest, web-design, and skill-registry guidance were inapplicable (Bun tests, no UI, no skill changes).
- Groups 4–7 remain pending; next apply must start with group 4.

## Group 4 — Workbench seam

Completed task 4.1 only. Moved the existing entrypoint and production dependency assembly into the deployable surface closure, exposed its production invocation adapter from the shared runner, and retained `ein-pi/workbench.ts` as a thin compatibility launcher. Parsing, the 20-candidate bound, TTY gating, cancellation/disposal, diagnostics, runtime selection, effects, and exit classification still flow through the same implementation.

### Files changed

- `ein-pi/agent/surfaces/workbench-entrypoint.ts`
- `ein-pi/agent/surfaces/surface-runner.ts`
- `ein-pi/workbench.ts`
- `tests/minimal-workbench-launcher.test.ts`
- `openspec/changes/surface-wiring/tasks.md`
- `openspec/changes/surface-wiring/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Public and deployable workbench activation share one assembly while preserving bounded interactive and exit behavior | Import of the absent shared workbench entrypoint failed: 0 pass, 1 fail | Extracted the entrypoint/production assembly and connected the surface adapter: 55 pass | The focused suite covered help, non-TTY zero-effects gating, candidate bound, Pi/Claude runtime selection, cancellation, launch effects, and normal/operational/usage/cancelled exits: 55 pass | Reduced the root launcher to re-exports plus one production invocation; `git diff --check` passed | `bun test tests/minimal-workbench-launcher.test.ts` — 55 pass, 0 fail |

### Verification and scope

- Ran only the requested focused Bun test and scoped `git diff --check`; no full suite, typecheck, build, launcher, or packaging checks ran.
- No workbench engine policy or installer/updater behavior changed. No design deviations.
- Architecture and Ein-discipline guided the thin compatibility seam; Bun guided execution. Vitest was inapplicable because this repository uses Bun test. Document-writer applied only to this progress update.
- Groups 5–7 remain pending; next apply must start with group 5.

## Group 5 — Pi launcher adapter

Completed task 5.1 only. `pi-ein` now reserves exactly `cleaner` and `workbench`, resolves the shipped runner from the isolated Pi agent home, forwards arguments and exit status unchanged, and fails with a bounded unavailable diagnostic when that runner is absent. Empty and unrelated invocations still pass through to vanilla `pi` with the existing isolated environment.

### Files changed

- `pi-ein/pi-ein.fish`
- `tests/surface-wiring.test.ts`
- `openspec/changes/surface-wiring/tasks.md`
- `openspec/changes/surface-wiring/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Pi reserves only cleaner/workbench and reaches the installed runner without changing unrelated passthrough | Existing launcher sent cleaner/workbench to `pi`; dispatch, malformed forwarding, and missing-runner assertions failed while passthrough passed: 1 pass, 3 fail | Exact namespace switch, isolated-home runner resolution, and bounded missing-runner exit passed: 4 pass | Added non-zero runner-exit preservation/no-fallthrough coverage; all command, malformed, passthrough, and activation-failure cases passed: 5 pass | Kept one small shell switch with no cleaner/workbench policy duplication; Fish syntax and diff checks stayed clean | `bun test tests/surface-wiring.test.ts --test-name-pattern 'Pi|pi-ein|passthrough'` — 5 pass, 0 fail |

### Verification and scope

- Focused Bun test passed after GREEN and TRIANGULATE; `fish -n pi-ein/pi-ein.fish` and scoped `git diff --check` passed.
- No full suite, build, typecheck, Claude adapter, packaging, or group 6 work ran. No design deviations.
- Architecture/Ein-discipline guided the thin adapter; Bun guided the focused runner. Vitest was inapplicable because the project uses Bun test.
- Groups 6–7 remain pending; next apply must start with group 6.

## Group 6 — Claude adapter and packaging seams

Completed tasks 6.1 and 6.2 only. Claude sync now compiles the canonical shared surface-runner entrypoint and its Bun import closure into a required standalone payload, promotes it only after a non-empty artifact exists, and removes stale artifacts on compile, missing-payload, or install failure. `cc-ein` reserves exactly `cleaner` and `workbench`, invokes that isolated payload, preserves its exit status, and leaves every unrelated invocation on unchanged Claude passthrough with scoped `CLAUDE_CONFIG_DIR`.

### Files changed

- `cc-ein/sync.ts`
- `cc-ein/cc-ein.fish`
- `tests/surface-wiring.test.ts`
- `openspec/changes/surface-wiring/tasks.md`
- `openspec/changes/surface-wiring/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Claude sync deploys the canonical runner closure and fails closed for required compile/payload failures | Missing sync exports stopped test loading: 0 pass, 1 fail | Canonical source compilation, missing payload, stale cleanup, and compile failure passed | Added payload-promotion failure; it initially did not throw, then failed closed with no runnable artifact | Kept one compile/promote helper reused by `runSync`; no capability policy entered sync | `bun test tests/surface-wiring.test.ts --test-name-pattern 'Claude|sync|payload|compile'` — 7 pass, 0 fail |
| Claude reserves only cleaner/workbench while preserving isolated passthrough | Missing sync exports blocked the shared focused RED run before launcher assertions | Exact payload dispatch, isolated environment, passthrough, missing artifact, and exit preservation passed | Exercised all cleaner stages, workbench arguments, empty/help/prefix-like/chat passthrough, and absent payload | Kept one explicit Fish switch and one bounded activation diagnostic | `bun test tests/surface-wiring.test.ts --test-name-pattern 'Claude|sync|payload|compile'` — 7 pass, 0 fail |

### Verification and scope

- Final focused Bun command passed; `cd installer && bun run typecheck`, `fish -n cc-ein/cc-ein.fish`, and scoped `git diff --check` passed.
- No full suite or production build ran. The production Bun compilation was not executed during apply; helper seams verified source identity, protocol marker, promotion, and fail-closed behavior.
- No design deviations. Architecture/Ein-discipline guided the thin packaging and launcher seams; Bun guided focused execution. Vitest was inapplicable because the repository uses Bun test.
- Group 7 remains pending; stop after group 6.

## Group 7 — Installed seam and isolation coverage

Completed task 7.1 and the apply phase. Added isolated Pi/Claude homes that copy the deployable agent closure, invoke the real Fish launchers, and keep stubbed vanilla runtimes and vanilla homes outside the Ein deployment. The shared runner now assembles production audit/mutation/completion/workbench adapters at its executable entrypoint and emits versioned JSON with stable usage/unavailable exit classes.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Installed Pi and Claude surfaces reach cleaner/workbench while preserving isolation | Real copied runner returned exit 0 with no malformed diagnostic because it had no executable production entrypoint | Added minimal production adapter assembly and CLI rendering; malformed and non-TTY workbench cases passed through both launchers | Added audit parity, valid mutate, separate complete, stale/symlink and writer-failure safety, oversized/unsafe input, missing deployment, passthrough, and vanilla-home assertions; 30 focused tests passed | Consolidated copied-home setup and result parsing; shell syntax and diff checks stayed clean | `bun test tests/surface-wiring.test.ts` — 30 pass, 0 fail |

### Verification and scope

- Focused suite: `bun test tests/surface-wiring.test.ts` — 30 pass, 0 fail.
- Scoped checks: `git diff --check` and `fish -n pi-ein/pi-ein.fish cc-ein/cc-ein.fish` passed.
- No full suite, production build, dependency install, or work beyond group 7 ran. All task checkboxes are complete; no design deviations.
- Architecture/Ein-discipline guided thin production assembly and isolated fixtures; Bun guided testing. Vitest was inapplicable because Bun test is the runner. Document-writer applied to this compact progress record.

### Remaining tasks and risks

- No apply tasks remain. Independent full-suite/type verification remains owned by `sdd-verify`.
- Claude installed tests use an executable payload surrogate over the copied canonical closure; compile/promotion identity remains covered by group 6 sync tests without running a production build here.
