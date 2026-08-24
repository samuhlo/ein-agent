status: complete

## Summary
The Claude continuity IPC exchange now separates finite request transport inactivity from finite response preparation. The focused PTY fixture now runs the supervisor in an isolated, controlled temporary Git root while retaining the absolute runner path and real socket/PTY assertions.

## Completed
- Added the finite response deadline and phase-specific IPC settlement in the production runner.
- Added focused delayed-success and response-expiry contracts.
- Corrected the PTY fixture's ambient project state: supervisor `cwd` is the temporary root, which has a committed baseline and ignores its continuity checkpoint.
- No production ambiguity handling, authentication, frame bounds, control suppression, or environment assertions were weakened.

## Files changed
`cc-ein/continuity-runner.ts`
`tests/claude-continuity-runtime.test.ts`

## Verification
- `bun test tests/claude-continuity-runtime.test.ts`: pass, 12 tests / 106 expect calls.
- `bun test`: pass, 2380 tests / 9658 expect calls.
- `bun run typecheck`: pass.
- `cd installer && bun run typecheck`: pass.

## TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|
| Bounded preparation beyond transport inactivity returns its result | Focused delayed-success contract returned `unavailable` before the production deadline split | Delayed real-IPC contract passed after the minimum runner correction | Full focused suite passed delayed success and existing transport/security contracts | Final focused timing command passed |
| Expired response settles once and rejects late result | Focused expiry contract failed before dispatched-response expiry existed | Expiry contract passed with bounded close and late completion ignored | Full focused suite passed expiry, malformed frames, and half-open cleanup | Final focused timing command passed |
| PTY handoff uses isolated project state without masking OpenSpec ambiguity | Original PTY run with supervisor `cwd: ROOT` returned `handoff-blocked` from ambient `openspec-ambiguous` state | PTY-only focused run passed after `cwd: root` plus a committed temporary Git baseline | Full focused suite, then root suite, passed while preserving socket, PTY, and environment assertions | Final focused suite passed without skips or filters |

## Deviations and residual risks
- The PTY fixture needs a real temporary Git baseline because continuity readiness correctly fails closed outside a repository; its checkpoint is ignored to keep fixture state stable.
- No remaining apply tasks; independent verify should confirm fresh evidence.
