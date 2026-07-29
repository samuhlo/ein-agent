# Map — candidate-receipt-retirement

status: complete
scope_status: ok
change: candidate-receipt-retirement
phase: map
skill_resolution: paths-injected
budget_source: scope.md
budget: { max_tokens: 15000, max_reads: 30 }

## Ledger

ledger:
  reads:
    - { path: /home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md, lines: 101, estimated_tokens: 1500 }
    - { path: /home/samuhlo/.pi/agent/skills/local/architecture/SKILL.md, lines: 132, estimated_tokens: 1800 }
    - { path: /home/samuhlo/.pi/agent/skills/local/comment-style/SKILL.md, lines: 184, estimated_tokens: 1800 }
    - { path: /home/samuhlo/.pi/agent/skills/downloaded/typescript/SKILL.md, lines: 250, estimated_tokens: 2100 }
    - { path: openspec/changes/candidate-receipt-retirement/map.md, lines: 129, estimated_tokens: 1900 }
    - { path: openspec/changes/candidate-receipt-retirement/scope.md, lines: 89, estimated_tokens: 1600 }
    - { path: "codegraph explore: candidate receipt/delivery wiring and focused tests", lines: 216, estimated_tokens: 300 }
    - { path: "codegraph explore: extension wiring", lines: 280, estimated_tokens: 300 }
    - { path: "codegraph explore: focused tests", lines: 280, estimated_tokens: 300 }
    - { path: "codegraph query: receipt removal and attempt clearing", lines: 20, estimated_tokens: 100 }
    - { path: tests/candidate-receipt.test.ts, lines: 620, estimated_tokens: 1000 }
    - { path: tests/delivery-gate.test.ts, lines: 460, estimated_tokens: 1000 }
    - { path: tests/ein-git-noninteractive.test.ts, lines: 78, estimated_tokens: 450 }
    - { path: ein-pi/agent/extensions/ein-ai.ts, lines: "90-169, 700-1049, 1050-1450", estimated_tokens: 1000 }
    - { path: "grep: ein-pi/agent/extensions/ein-ai.ts candidate/delivery symbols", lines: 30, estimated_tokens: 250 }
    - { path: "grep: focused test seams", lines: 50, estimated_tokens: 250 }
  webfetch_used: false
  budget_consumed: { tokens: 13750, reads: 16 }

## Existing lifecycle constraints

- The live slot is `<gitDir>/ein/candidate-receipt.json`. `emitCandidateReceipt()` serializes it with a trailing newline and atomically replaces that one file with temp-in-directory then rename (`ein-pi/agent/lib/candidate-receipt.ts:407-424`); `readCandidateReceipt()` and validation read that slot only (`:431-438`, `:462-507`).
- The receipt fingerprint is the serialized SHA-256. `validateFreshCandidateReceipt()` rejects a changed active receipt during an attempt (`candidate-receipt.ts:447-459`). `VerifiedDeliveryAttempt` carries that fingerprint and gains `validatedDeliveryHead` only after a successful post-commit tree check (`ein-pi/agent/lib/delivery-receipt.ts:96-101,159-179`).
- The four existing gates remain the authority for content identity: pre-commit creates the attempt, post-commit binds its delivery head, pre-push checks that selected source head/tree, and pre-PR checks local/effective-remote/PR heads (`delivery-receipt.ts:130-226`). Missing receipts currently pass the content gate, so retirement must never remove the live slot before archival and completion proof both succeed.
- No inspected runtime path removes, moves, or archives an active `candidate-receipt.json`. Existing `renameSync` use publishes the active receipt only; temporary candidate-index/emission cleanup is not receipt retirement (`candidate-receipt.ts:193-211,407-424`).

## Exact extension wiring and retirement seam

- `ein-ai.ts` imports the delivery evaluator/state at `:113` and candidate emission helpers at `:114`. The session-only stores are `deliveryAttemptBySession` and `pendingPostCommit` at `:145-147`.
- In `pi.on("tool_call")`, the Bash path applies confirmation and staging gates before calling `evaluateDeliveryGate()` with the session attempt at `ein-ai.ts:784-805`; it stores the returned attempt at `:805`. A qualifying pre-commit records its tool call at `:809-810`.
- In `pi.on("tool_result")`, `pendingPostCommit` is consumed at `:822-824`. A failed commit explicitly writes `undefined` to the attempt map (`:828-830`); a successful commit calls `evaluatePostCommit()` and stores its result (`:832-833`).
- Push and PR commands travel only through the `tool_call` evaluation at `:804-805`: there is no success callback that clears or rotates `deliveryAttemptBySession` after push or PR. The map is process/session memory, not durable completion evidence.
- The only explicit receipt tool is `ein_candidate_receipt`, registered at `ein-ai.ts:1305-1348`; its `execute` calls `emitCandidateReceipt()` at `:1338-1342`. The smallest explicit retirement surface is a sibling deterministic tool registration adjacent to it. It should obtain a normalized remote completion observation, invoke a pure retirement decision, and clear the session attempt only after archive publication and active-slot removal report success. It must not overload pre-push/pre-PR evaluation, whose observations are pre-mutation identity checks.
- Delivery grants/declarations are separate from receipt state: `tool_call` routes subagent calls through `confirmDelegatedDelivery()` before Bash handling (`ein-ai.ts:755-783`), while content gates run only on Bash (`:784-812`). Retirement must not mint, consume, or reinterpret a delivery grant.

## Completion proof and ordered persistence

- A local push, local HEAD movement, or a successful `gh pr create` cannot prove the intended PR completed. Current pre-PR observations are not a merge observer and current runtime does not persist a PR number/URL or remote completion record.
- Design should support one narrow proof only: an explicit operation observes a uniquely bound remote PR and demonstrates that its completed/merged result contains or is otherwise deterministically bound to the attempt's `validatedDeliveryHead`. Missing attempt state, absent PR binding, unavailable/auth-failed remote observation, unmerged/ambiguous PR, corrupt receipt, or divergent head must fail closed and retain the active receipt.
- The archive transition must retain raw source bytes: read and validate active bytes; prove completion; atomically publish those exact bytes to an archive temp then final archive name; compare an existing archive byte-for-byte for idempotency; only then remove the active slot. Archive failure leaves the active gate intact. If removal fails after archive publication, a retry must compare the archive and retry removal, never overwrite conflicting bytes.
- Because archive publication and active removal are two filesystem operations, design needs a serialization seam around the transition or equivalent gate treatment for the conservative intermediate state where both files exist. The unsafe state is neither file existing.

## Focused test seams

- `tests/candidate-receipt.test.ts:468-480` already proves active receipt publication leaves no `.tmp` file and leaves the live slot present. Add archive-byte, archive-conflict, archive-publication-failure, active-removal-failure/retry, and active-versus-retired state cases beside this persistence seam.
- `tests/candidate-receipt.test.ts:488-620` already drives the receipt through pre-commit, post-commit, pre-push, pre-PR, and fingerprint replacement failures. It is the direct fixture seam for a valid `validatedDeliveryHead`, corrupt/missing/replaced receipt, and raw-byte comparison.
- `tests/delivery-gate.test.ts:111-117` proves a receipt does not block a commit wholly outside its manifest. `:184-194` asserts post-commit captures `validatedDeliveryHead`; `:282-303` asserts a new session with divergent content is rejected without attempt state; `:329-340` distinguishes mechanical overlap with divergent versus clean HEAD. Add the required post-retirement overlapping-manifest case here, preserving existing gate behavior before retirement.
- `tests/ein-git-noninteractive.test.ts:44-48` asserts the exact one-mode `mechanical-unverified: no-verification-receipt-applies` declaration, and `:50-58` asserts the four delivery boundary instructions. It is a static agent-contract test only: no receipt filesystem or attempt lifecycle is exercised there. It need not change unless the delivery-agent contract gains retirement instructions.
- No focused extension wiring test exists in the requested files. If the new tool has nontrivial parameter/result formatting, add the smallest direct extension/tool-contract test rather than expanding `ein-git-noninteractive.test.ts` beyond its prompt contract.

## Smallest implementation slice and forecast

1. `ein-pi/agent/lib/candidate-receipt.ts` — archive path/raw-byte publication, exact conflict comparison, safely ordered active removal, and idempotent result types.
2. `ein-pi/agent/lib/delivery-receipt.ts` — pure consumability evaluation over the validated attempt plus a normalized remote completion observation; no remote I/O in this module.
3. `ein-pi/agent/extensions/ein-ai.ts` — sibling explicit retirement tool, remote-observer adapter boundary, session-attempt lookup, and post-success clearing.
4. `tests/candidate-receipt.test.ts` — archive atomicity, exact bytes, conflicts, failure/retry, corrupted evidence.
5. `tests/delivery-gate.test.ts` — missing-attempt/unobserved/unmerged outcomes and overlapping manifest behavior before versus after safe retirement.

Expected production change: 180-270 lines; focused tests: 190-290 lines. This remains below the 400-production-line review guard. Keep `delivery-gate.ts` unchanged unless design proves it must recognize the conservative both-active-and-archived transition; keep `tests/ein-git-noninteractive.test.ts` unchanged unless the written ein-git contract changes.

## Design handoff

Proceed to `sdd-design`. Choose the explicit retirement tool and one supported remote merge-completion proof; define durable PR identity binding, archive naming, normalized observation/result types, exact idempotency rules, and the serialization rule. Preserve all four existing delivery gates and mechanical declaration semantics unchanged; retirement is permitted only after the validated delivery head is proven complete and the original active receipt bytes are durably archived.
