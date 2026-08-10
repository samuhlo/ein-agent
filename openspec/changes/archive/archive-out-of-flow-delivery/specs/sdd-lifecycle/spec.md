# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: legacy-out-of-flow-allowed
title: Allow explicitly reconciled out-of-flow legacy delivery
requirement: The system MUST allow archival of a declarationless legacy record only when an explicitly selected out-of-flow reconciliation signal and auditable reason identify the record, a fresh summary states that delivery occurred outside SDD, and concrete repository verification is fresh and passing.
Given: a change contains only its original scope artifact and is otherwise recognized as an approved declarationless legacy record
When: the caller selects the out-of-flow reconciliation path with a non-empty reason and supplies the required fresh summary and repository verification evidence
Then: the deterministic close path permits archival without inventing map, design, tasks, apply, or verify artifacts

### Scenario: legacy-out-of-flow-denied
title: Deny incomplete or ambiguous out-of-flow reconciliation
requirement: The system MUST deny out-of-flow reconciliation when the explicit signal or reason is absent, malformed, stale, non-concrete, or inferred from missing lifecycle artifacts.
Given: a record lacks the required explicit signal, auditable reason, fresh summary, or concrete repository verification
When: a caller attempts to archive it through the out-of-flow path
Then: the path fails closed and leaves the record unarchived

### Scenario: legacy-summary-auditability
title: Record the out-of-flow delivery claim explicitly
requirement: The system MUST require the reconciliation summary to explicitly state that delivery occurred outside SDD and to identify concrete repository verification rather than treating a generic completion claim as evidence.
Given: an approved legacy record is being reconciled after implementation outside the SDD lifecycle
When: the close path evaluates the supplied summary and verification evidence
Then: only an explicit outside-SDD statement paired with concrete current-repository evidence can satisfy the reconciliation gate

### Scenario: ordinary-close-guards-preserved
title: Preserve ordinary close readiness
requirement: The system MUST continue to require the normal close readiness guards for ordinary changes, including complete apply, fresh passing verification, fresh summary, no pending tasks, and existing synchronization, conflict, and sequence checks.
Given: a change is not an approved declarationless legacy record using the explicit out-of-flow path
When: a caller requests close or supplies an out-of-flow-like argument
Then: the standard close decision is unchanged and incomplete or out-of-sequence work is denied
