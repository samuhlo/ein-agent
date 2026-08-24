## // 000. RESUMEN
The Claude continuity IPC exchange now separates transport inactivity from bounded supervisor response preparation. Valid delayed preparation succeeds, while inactive, failed, malformed, or expired exchanges remain finite and fail-closed.

## // 001. QUÉ CAMBIÓ
- `cc-ein/continuity-runner.ts`: added phase-specific finite response timing and single-shot settlement for late or failed IPC responses.
- `tests/claude-continuity-runtime.test.ts`: added delayed-success and response-expiry contracts, plus an isolated temporary Git/PTY fixture baseline.
- The OpenSpec delta for `claude-continuity-ipc` was synchronized successfully with no conflicts (`sync-report.md`).

## // 002. CÓMO FUNCIONA POR DENTRO
- IPC transport retains a short finite bound for connection and request/input inactivity.
- After a valid request is dispatched, supervisor preparation uses a separate finite response allowance rather than the transport interval.
- Timeout, socket failure, malformed traffic, handler failure, or expired response normalizes to bounded `unavailable`; sockets close and late results cannot overwrite settlement.
- Authentication, frame limits, bounded output, control interception, and `decision:block` suppression remain unchanged.
- The focused PTY fixture runs the supervisor in a committed temporary Git root while retaining real socket and PTY behavior.

## // 003. DECISIONES
- Split the existing IPC deadline by exchange phase instead of broadly increasing transport timeouts.
- Keep lifecycle preparation and protocol framing unchanged; place timing ownership at the IPC edge.
- Preserve fail-closed behavior and reject unbounded waits, heartbeats, TMPDIR workarounds, test skips, and timeout-only masking.

## // 004. VERIFICACIÓN
- Focused suite: PASS — 12 tests, 106 expect calls.
- Root `bun test`: PASS — 2354 tests, 9588 expect calls.
- Root `bun run typecheck`: PASS.
- `cd installer && bun run typecheck`: PASS.
- Strict TDD audit: PASS for delayed success, expiry/late-result rejection, and isolated PTY behavior.

## // 005. PENDIENTE / RIESGOS
- No verification blockers remain.
- The PTY contract performs temporary Git initialization and commit by design; it passed within the test bound.
- Initial macOS `timeout` wrapper was unavailable; bounded Python execution was used for verification instead.
