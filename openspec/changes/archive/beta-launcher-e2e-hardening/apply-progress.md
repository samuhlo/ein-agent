status: complete
change: beta-launcher-e2e-hardening
phase: apply
blocked_by: none

## Completed
- Added Pi/Claude provider sentinel scripts and recording-executor evidence; PTY launch requires exactly one recording event, while default-no and rejected-plan paths require zero events and untouched sentinels.
- Added a second prompt-synchronized PTY flow after the sole tracked mutation. It renders stale verification, preserves report bytes, records exactly one projection, and proves launch does not re-project.
- Wrapped every driver scenario with before/after project and isolated-runtime manifests, sentinel preservation, transcript privacy, PID/terminal/prompt-listener cleanup, and driver SIGINT-listener cleanup evidence.
- Added real Claude PTY launch coverage, deliberate ANSI/CRLF/echo normalization, observed exit-code matrix assertions, and unavailable-candidate PTY coverage.

## Files
- `tests/beta-launcher-e2e-hardening.test.ts`
- `tests/fixtures/beta-launcher-e2e-driver.ts`
- `openspec/changes/beta-launcher-e2e-hardening/apply-progress.md`

## TDD Cycle Evidence
| Seam | RED evidence | GREEN / triangulation |
|---|---|---|
| Provider safety | Initial focused `bun test tests/beta-launcher-e2e-hardening.test.ts` failed the new Claude recording-flow, stale projection evidence, and cleanup assertions (25 tests, 4 failures). | Recording event carries `executor: recording`; fake Pi/Claude scripts remain untouched; Pi/Claude, default-no, rejected, nonzero/signal/throw/invalid flows pass. |
| Freshness | The same RED run failed the new second-run assertion because the project evidence event lacked stale freshness. | Mutation → fresh PTY launch renders `outcome=unknown freshness=stale`; report bytes and one-project/one-executor evidence remain stable. |
| Ownership/cleanup | The RED run failed because the driver emitted no cleanup event. | Manifest, sentinel, PID, terminal, prompt-listener, and SIGINT-listener assertions cover success, failures, invalid/unavailable, doctor outcomes, EOF, SIGINT, and timeout. |
| PTY/normalization | New Claude PTY and deliberate CRLF/echo/ANSI assertions were introduced before the final green run. | Real Claude launch and normalized transcript assertions pass; no blind sleeps are used. |
| Exit/privacy | Tautological `[0,1,2,130]` assertion was replaced with observed invalid/unavailable/EOF results. | All failure transcripts are checked for fixture roots, PRIVATE markers, and ANSI controls; closed exits remain 0/1/2/130. |

## Verification
- `bun test tests/beta-launcher-e2e-hardening.test.ts` — PASS, 26 tests / 325 expectations (post-steering focused rerun; no hung child command).
- Repeated E stress (`for i in 1 2 3; do bun test tests/beta-launcher-e2e-hardening.test.ts; done`) — PASS, 3/3 runs.
- `bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/beta-launcher-e2e-hardening.test.ts` — PASS, 151 tests / 850 expectations.
- `cd installer && bun run typecheck` — PASS (`tsc --noEmit`).
- `bun test` — PASS, 1,259 tests / 4,534 expectations / 0 failures across 96 files.
- Residue scan — PASS, no E/runtime temporary roots.
- `git diff --check` — PASS; staged diff empty; forbidden production/dependency diff empty.

## Boundaries and residuals
- `verify-report.md`, production, installer/dependency files, lockfiles, and provider executables remain untouched; no commit, push, or close performed.
- `tasks.md` checkboxes remain complete. Its `status: ready` header is owned by `sdd-tasks` and was not edited during apply; `apply-progress.md` is the authoritative apply status and is `complete`.
- Native Bun PTY behavior remains platform-specific; one stress run exhibited slower timeout teardown but completed green and left no residue.
