# Design: fix-continuity-ipc-response-timeout

## A. Proposal

### Intent

Separate Claude continuity IPC transport inactivity from the finite time allowed for an accepted supervisor response, so legitimate bounded preparation can finish without being mislabeled `unavailable`. Preserve fail-closed control interception and a hard upper bound for every exchange.

### Scope

**In:** the timeout policy around `sendIpc` and `listenIpc` in `cc-ein/continuity-runner.ts`, plus focused timing contracts in `tests/claude-continuity-runtime.test.ts`.

**Out:** lifecycle/checkpoint/handoff redesign, protocol authentication or frame-bound changes, TMPDIR workarounds, unbounded waits, test skips/filters, and unrelated transport deadlines. The authoritative micro lane intentionally has no `map.md` or `tasks.md`.

### Affected areas

- `cc-ein/continuity-runner.ts` — distinguish the request-transport phase from the accepted-response phase while retaining finite cleanup and failure behavior.
- `tests/claude-continuity-runtime.test.ts` — deterministic success and expiry contracts through the real IPC seam.

No adjacent production file is expected to change.

### Risks

- A response allowance that is too short recreates the false `unavailable`; one that is unnecessarily long delays genuine failure reporting.
- Client and listener phase transitions can drift and produce asymmetric timeout behavior.
- A socket can expire while asynchronous handler work is settling; late bytes must not change an already settled fail-closed result.

### Rollback

Revert the production and focused test changes together. This restores the previous one-second behavior and therefore also restores the known false-`unavailable` defect; no data migration or protocol cleanup is required.

### Success criteria

- A valid request whose supervisor preparation exceeds the transport interval but completes within the dedicated finite response allowance returns the supervisor result.
- Connection/input inactivity, handler failure, malformed traffic, or response expiry still settles to bounded failure without hanging.
- The hook continues returning `decision:block` with suppression metadata for continuity controls and never forwards the control to the model.
- Focused RED/GREEN evidence and the unchanged root verification gate pass without timeout-only masking.

### Spec context

Canonical OpenSpec references: none. `scope.md` explicitly records that no canonical `openspec/specs/<domain>/spec.md` path was injected, so there is no canonical path, SHA-256, or byte count to record. The non-canonical change delta used here is `openspec/changes/fix-continuity-ipc-response-timeout/specs/claude-continuity-ipc/spec.md`.

## B. Spec

### Requirement 1 — Phase-specific finite bounds

The system **MUST** apply a short finite transport bound while establishing/receiving an IPC request and a separate finite response bound after the request enters the supervisor response phase. The response bound **MUST NOT** become an unbounded or sliding wait.

**Scenario**

- **Given** a valid continuity request is delivered before the transport deadline
- **When** the supervisor begins bounded response preparation
- **Then** the exchange uses the finite response allowance rather than expiring solely at the transport inactivity interval

### Requirement 2 — Legitimate delayed preparation succeeds

The system **MUST** return the supervisor's bounded result when valid preparation takes longer than the transport interval but completes before the response deadline.

**Scenario**

- **Given** an authenticated control request reaches the supervisor and preparation completes after more than one second but within the response allowance
- **When** the Claude hook waits for the response
- **Then** the hook blocks the control with the supervisor result instead of `reason:unavailable`

### Requirement 3 — Fail-closed expiry and failures

The system **MUST** settle connection failure, request inactivity, malformed traffic, handler failure, and response expiry in finite time using the existing bounded fail-closed outcome. A late response **MUST NOT** replace an already settled outcome.

**Scenario**

- **Given** an IPC peer does not produce a valid final response before its applicable finite deadline
- **When** that deadline expires
- **Then** the exchange closes and the control result is blocked with `reason:unavailable` without hanging

### Requirement 4 — Security and interception invariants

The system **MUST** retain authentication, frame-size validation, bounded result sanitization, and control suppression. It **MUST NOT** forward a recognized continuity control to the model on either success or failure.

**Scenario**

- **Given** a recognized continuity control receives either a delayed valid result or a bounded failure
- **When** the hook emits its result
- **Then** it emits `decision:block` with suppression metadata and no original-control forwarding

### Requirement 5 — Strict TDD coverage

The correction **MUST** be developed under strict TDD with deterministic focused contracts for both sides of the timing boundary, and the focused test **MUST** remain in the root Bun gate.

**Scenario**

- **Given** focused tests model preparation beyond the transport interval and a genuinely inactive/expired response
- **When** the production correction is absent and then added
- **Then** the new contract first fails for the intended timeout reason, then passes without skips, filters, TMPDIR changes, or test-timeout-only changes

## C. Decisions

### 1. Split one timeout by exchange phase

Keep the existing compact Unix-socket request/response protocol. The transport deadline owns connect and request-input inactivity; once the client has connected/sent the request and the listener has accepted a valid frame for dispatch, a dedicated hard response deadline owns the wait for the bounded handler result. Both sides must agree on these phases.

This is smaller than redesigning lifecycle preparation and directly addresses the conflation identified in scope. The response allowance must be an explicit finite production policy sized for the known bounded preparation path, not a test timeout or a global transport increase.

### 2. Preserve fail-closed settlement

Timeout, socket error, malformed output, or handler rejection continue to normalize to `unavailable`; `boundedCode`, authentication, and frame limits remain unchanged. Settlement remains single-shot, sockets are closed on expiry, and late events cannot overwrite the chosen result.

### 3. Keep ownership at the IPC edge

`cc-ein/continuity-runner.ts` owns transport and response deadlines. `createSupervisorHandler` and the lifecycle continue to own continuity semantics and replacement preparation. The focused test owns observable timing evidence; it must exercise the real IPC boundary rather than mocking `handleClaudeHook`'s injected sender alone.

### 4. Rejected alternatives

- **Increase the existing one-second timeout everywhere:** rejected because it still conflates phases and broadens unrelated inactivity waits.
- **Remove socket deadlines or wait for handler completion indefinitely:** rejected because it violates bounded fail-closed behavior.
- **Add acknowledgements/heartbeats or version a new framing protocol:** rejected as unnecessary protocol complexity for a two-phase local exchange.
- **Change TMPDIR/socket paths:** rejected because diagnostics disproved path length as the cause.
- **Raise or skip the four-second reproducer without a behavioral contract:** rejected as test-only masking.
- **Cancel or redesign lifecycle preparation:** rejected as outside this micro change; the IPC edge only bounds whether a result remains usable by the exchange.

## D. Success Criteria

Acceptance requires all of the following observable evidence:

- A focused real-IPC contract delays a valid supervisor result beyond the transport interval and observes that exact bounded result at the blocked hook response.
- A focused real-IPC contract withholds or expires the final response and observes finite `unavailable`, socket settlement, and no hang.
- Existing malformed/oversized-frame, half-open connection, bounded-output, and control-suppression assertions remain green.
- Strict TDD evidence records: RED from the new timing contract against the old single-deadline behavior; GREEN after the minimum production correction; TRIANGULATE with both delayed-success and inactive/expired cases; REFACTOR only while green.
- No `.skip`, `.only`, test filter, TMPDIR workaround, unbounded timer, or test-timeout-only production substitute is introduced.
- Required verification commands after implementation are:
  - `bun test tests/claude-continuity-runtime.test.ts`
  - `bun test`
  - `bun run typecheck`
  - `cd installer && bun run typecheck`

No test, build, or typecheck command was run during this design phase.
