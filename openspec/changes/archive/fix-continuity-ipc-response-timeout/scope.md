# Scope: fix-continuity-ipc-response-timeout

**Change:** `fix-continuity-ipc-response-timeout`  
**Phase:** scope  
**Lane:** micro  
**TDD:** strict (explicit user choice; this phase records it only)  
**Artifact language:** English

## Problem statement

`tests/claude-continuity-runtime.test.ts` reproducibly exceeds its 4-second test timeout while the Claude hook reports `decision:block` with `reason:unavailable`. Diagnostics establish that the IPC request reaches the supervisor but no response bytes return before the current 1-second IPC deadline; shortening `TMPDIR` does not change the failure. The timeout currently conflates transport inactivity with legitimate continuity preparation duration.

## Scope boundary

### In scope

- Correct the Claude continuity IPC/runtime response-timeout behavior so legitimate bounded supervisor preparation is not classified as transport unavailability solely because it exceeds the transport inactivity interval.
- Preserve a finite, fail-closed response bound for genuinely inactive, failed, malformed, or expired IPC exchanges.
- Keep the hook result bounded and preserve control interception (`decision:block`) without forwarding the control to the model.
- Add or adjust only focused contracts in `tests/claude-continuity-runtime.test.ts` needed to prove the corrected success and failure timing behavior under strict TDD.
- Limit the likely production seam to `cc-ein/continuity-runner.ts`; map/design must confirm the smallest exact edit.

### Out of scope

- General continuity lifecycle, checkpoint, handoff, PTY, session, installer, launcher, or runtime-test-fixture redesign.
- Removing deadlines, waiting without a bound, treating uncertainty as success, or weakening authentication/frame bounds.
- Skipping, filtering, quarantining, or otherwise bypassing the failing test or the root `bun test` gate.
- TMPDIR/path-length workarounds, broad timeout increases across unrelated transports, or unrelated test stabilization.
- Implementation, design decisions, test execution, build, typecheck, or verify artifacts during scope.

## Acceptance criteria

1. A valid continuity control request that reaches the supervisor and completes legitimate preparation within the bounded response allowance returns the supervisor's bounded result instead of `unavailable` solely due to the current 1-second transport deadline.
2. Transport inactivity, connection failure, handler failure, malformed traffic, or expiry still resolves in finite time to the existing bounded fail-closed outcome.
3. The contract distinguishes transport inactivity from preparation duration without introducing an unbounded wait or bypassing control interception.
4. Focused tests deterministically cover both a preparation duration beyond the transport inactivity interval and a truly inactive/expired response path.
5. `tests/claude-continuity-runtime.test.ts` remains part of the root test gate; no skip, filter, timeout-only masking, or root-command bypass is introduced.
6. Production and test edits remain within Claude continuity IPC/runtime and its focused test unless map/design proves one directly necessary adjacent seam.

## Evidence and likely seams

- Current hook client: `sendIpc` in `cc-ein/continuity-runner.ts` uses a 1-second socket timeout and maps timeout/error to `unavailable`.
- Current supervisor listener: `listenIpc` applies the same deadline while awaiting the asynchronous handler; `createSupervisorHandler` may await legitimate lifecycle preparation before returning a response.
- Reproducer: `tests/claude-continuity-runtime.test.ts` times out after 4 seconds and prints the bounded blocked/unavailable result.
- Diagnostics supplied by the user rule out socket-path length as the cause and prove request arrival at the supervisor.
- No test, build, or typecheck command was run in this phase.

## Project configuration

- Existing `openspec/config.yaml` was preserved: Node.js/TypeScript ESM, Bun runtime/package manager, `bun test`, and `strict_tdd: true`.
- The change-level `preflight.json` records the user's explicit strict-TDD choice, which governs later apply/verify.
- Root verification must retain `bun test`; CI also expects root `bun run typecheck` and `cd installer && bun run typecheck` where applicable.

## Spec and skill context

No canonical OpenSpec domain paths were injected, so no canonical spec file was read, hashed, or referenced. Observable behavior changes are declared by the validated delta at `openspec/changes/fix-continuity-ipc-response-timeout/specs/claude-continuity-ipc/spec.md`; therefore this scope contains no `spec_delta: none` block.

Applied `ein-discipline` for bounded SDD and strict-TDD recording, and `architecture` for the smallest-seam constraint. The Vitest skill was not applied because this repository and target use Bun's test runner; the Nuxt modules skill was not applicable to Claude continuity IPC/runtime.

## SCOPE PACKET

scope: Fix the Claude continuity IPC response timeout so bounded legitimate supervisor preparation is distinct from transport inactivity, while retaining finite fail-closed behavior. Keep the micro-lane limited to `cc-ein/continuity-runner.ts` and focused `tests/claude-continuity-runtime.test.ts` coverage, with no root-test bypass or unrelated continuity redesign.
budget_allocated:
  max_tokens: 8000
  max_reads: 16
  max_runtime_ms: 90000
