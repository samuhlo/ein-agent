status: ready
scope_status: bounded
change: fix-cleaner-participant-slicing
phase: map
lane: standard
tdd: strict

# Map: final authorized test-only participant assertion

## Boundary

This is a final, narrowly authorized expansion after apply group 009. The only owned source path is `tests/subagent-envelope-contract.test.ts`, and only its participant-specific T2 integration expectation may change. No production file, adapter implementation, inventory contract, unrelated envelope assertion, continuity behavior, installer behavior, or other artifact is in scope.

The stale dependency is the participant-handler contract: the prior expectation is coupled to `completeSddParticipantCall`, while the live private Pi terminal edge recognizes terminal evidence through `recognizePiParticipantTerminal` in `ein-pi/agent/extensions/ein-ai.ts`. The test repair must bind only that participant-specific assertion to the live recognizer edge and preserve the remaining detector, audit, protection, scout, reconciliation, and envelope assertions.

## Exact evidence and ownership

| Path/symbol | Evidence | Ownership |
|---|---|---|
| `tests/subagent-envelope-contract.test.ts` T2 | T2 extracts the real `tool_result` handler and compares discovered consumers against the declared inventory. This is the failing test-only dependency surfaced by final full-suite verification. | Change only the stale participant-specific expectation; preserve both fictitious-detector red behavior and all T1/T3 assertions byte-for-byte where practical. |
| `ein-pi/agent/extensions/ein-ai.ts::recognizePiParticipantTerminal` | Private Pi edge validates `subagent`, foreground terminal shape, single child, identity, bounded output, and exactly one supported status line. It is called from the live participant result path. | Read-only evidence. Do not edit the adapter or expose the private function. |
| `ein-pi/agent/lib/subagent-envelope-contract.ts::ENVELOPE_CONSUMER_INVENTORY` | Inventory currently contains the historical participant consumer key and is consumed by the test; it is shared contract code and outside this final test-only expansion. | Read-only evidence. Do not alter inventory or other consumers. |
| `ein-pi/agent/lib/sdd-participants.ts::completeSddParticipantCall` | Current coordinator completion API remains a production call target after Pi edge recognition; the stale dependency being corrected is the test's participant-specific handler expectation, not coordinator behavior. | Protected production behavior. No edits. |

## Dependency and blast-radius notes

- The test's T2 real-handler scan is the sole final verification failure recorded in `apply-progress.md` (full suite otherwise passed; focused test had 7 passing and 1 failing).
- The live handler still invokes coordinator completion after recognition. This map therefore does not authorize deleting or renaming `completeSddParticipantCall`; it only routes the test's participant-specific assertion to the recognized Pi edge as requested.
- `auditEnvelopeConsumers`, `findEnvelopeConsumers`, `extractToolResultHandlerBody`, T1 fixture checks, T3 real-source audit, scout normalization, original-error reconciliation, and foreground protection remain unchanged.
- Strict TDD and the standard lane remain unchanged. This phase maps only; no tests, build, or typechecks run.

## Apply guard

The next phase should first formulate the smallest assertion-level replacement, then apply only the authorized hunk in `tests/subagent-envelope-contract.test.ts`. Do not edit `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/subagent-envelope-contract.ts`, `ein-pi/agent/lib/sdd-participants.ts`, or any continuity/installer/test file. Do not weaken the closed-world detector or remove unrelated envelope consumers to make T2 pass.

## Risks

- A broad inventory or handler rewrite would violate the final one-file test-only authorization.
- The private recognizer is not itself a public test surface; the assertion must remain source-contract based and fail closed.
- The handler legitimately retains coordinator completion, so conflating recognizer replacement with production API removal would create an invalid scope expansion.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/fix-cleaner-participant-slicing/scope.md", lines: 122, estimated_tokens: 3600 }
    - { path: "openspec/changes/fix-cleaner-participant-slicing/map.md", lines: 180, estimated_tokens: 2800 }
    - { path: "openspec/changes/fix-cleaner-participant-slicing/design.md", lines: 260, estimated_tokens: 4200 }
    - { path: "openspec/changes/fix-cleaner-participant-slicing/tasks.md", lines: 230, estimated_tokens: 3900 }
    - { path: "openspec/changes/fix-cleaner-participant-slicing/apply-progress.md", lines: 225, estimated_tokens: 4000 }
    - { path: "tests/subagent-envelope-contract.test.ts", lines: 94, estimated_tokens: 1500 }
    - { path: "ein-pi/agent/lib/subagent-envelope-contract.ts", lines: 45, estimated_tokens: 700 }
    - { path: "codegraph explore: participant envelope symbols and callers", lines: 0, estimated_tokens: 1200 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: 55, estimated_tokens: 1000 }
    - { path: "ein-pi/agent/lib/sdd-participants.ts", lines: 108, estimated_tokens: 1800 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 24700, reads: 10 }
  budget_source: scope.md
  budget_exceeded: true

## Next phase

Recommend `sdd-design` for the exact assertion-level replacement and hunk-safe apply sequence.
