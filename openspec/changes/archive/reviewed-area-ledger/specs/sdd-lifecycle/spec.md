# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: review-ledger-bounded-areas
title: Reviewed areas have bounded deterministic identity and state
requirement: The system MUST record each reviewed area with an explicit bounded boundary, deterministic granularity and review state, and MUST distinguish reviewed, unreviewed, stale, invalid, and unknown values.
Given: A future audit consumes a reviewed-area ledger containing zero or more area records.
When: The ledger is produced or read for an audit.
Then: Each record identifies its area boundary and stable identity, records a permitted review state and reason, and ambiguous or unknown boundaries or states fail closed instead of being treated as reviewed.

### Scenario: review-ledger-evidence-git-freshness
title: Review evidence is bound to fresh Git state
requirement: The system MUST bind a reviewed area to privacy-safe evidence identity and the exact relevant Git state, and MUST invalidate the reviewed state when a relevant Git change affects that area.
Given: A ledger record references review evidence for a bounded area and a Git-linked state.
When: The relevant committed, staged, tracked, or in-scope untracked content differs, or the evidence cannot be verified against an exact state.
Then: Consumers receive stale, invalid, unavailable, or unknown status with deterministic reasons and state references, and the record is not presented as current reviewed evidence.

### Scenario: review-ledger-human-review-boundary
title: Review state requires evidence and does not imply approval
requirement: The system MUST NOT declare an area reviewed merely because a session exists, an artifact is present, or an automated process completed, and MUST keep the ledger separate from human review, SDD completion, and automatic approval.
Given: A session, audit artifact, or implementation result exists without attributable review evidence satisfying the ledger contract.
When: A consumer requests the area's review state.
Then: The area remains unreviewed or unknown with a fail-closed reason, and no approval, lifecycle completion, or human-review claim is emitted.

### Scenario: review-ledger-readonly-consumption
title: Future audits consume the ledger read-only
requirement: The system MUST expose reviewed-area records for deterministic read-only audit consumption without parallel writers, cleaner or architect mutation, autonomous mutation, or scope leakage into later roadmap blocks.
Given: A future audit reads a ledger produced by the designated review workflow.
When: The audit evaluates reviewed, unreviewed, or stale areas.
Then: It receives the recorded states and privacy-safe references without rewriting ledger data, changing source or Git state, inferring approval, or performing mutations.
