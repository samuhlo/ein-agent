# OpenSpec Specification
format: openspec-spec/v1
domain: apply-packet

## Scenario: apply-evaluation-corpus-is-frozen-and-reproducible
title: The evaluation corpus is frozen, versioned, and reproduces on a second read
requirement: The system MUST record the evaluation corpus as versioned data derived from archived changes, where each item declares the change identifier, lane, TDD stance, known outcome, the files the apply actually touched, and its focused verification command. The corpus MUST be immutable once frozen: reading it twice MUST produce the same items in the same order, so measurements taken against it remain comparable. The corpus MUST NOT be consulted by any phase tool to decide routing, scope, or phase state; it is evaluation data only.
Given: a frozen evaluation corpus derived from archived changes
When: the corpus is read for a measurement run
Then: each item carries its change identifier, lane, TDD stance, known outcome, touched files, and focused check, a second read reproduces the identical set in the identical order, and no phase tool consumes it as a routing or state source

## Scenario: apply-packet-schema-rejects-unexecutable-packet
title: The Apply Packet schema rejects a packet an executor could not run without deciding
requirement: The system MUST validate an Apply Packet against a versioned schema before it can be treated as executable, and MUST reject a packet that declares no invariant, that leaves a decision to the executor, that was compiled from a source artifact which has since changed, or that names an edit or command outside its declared allowed files. Rejection MUST name the failing rule and the offending field. Uncertainty MUST fail closed as `unknown`: an unreadable or ambiguous source artifact MUST NOT yield a valid packet by default.
Given: an Apply Packet compiled from a change's design and tasks artifacts
When: the packet is validated against the schema
Then: a packet missing an invariant, containing an unresolved decision, compiled from a changed source artifact, or naming a path outside its allowed files is rejected with the failing rule and field named, and an unreadable source yields `unknown` rather than a valid packet

## Scenario: apply-packet-v2-is-observed-before-enforcement
title: Pi observes packet readiness without blocking apply during rollout
requirement: The system MUST make the Pi runtime compile and validate the next group immediately before a sole `sdd-apply` delegation, MUST expose executable, incomplete, rejected or unavailable once for that call, and MUST NOT yet block or modify the delegation because of the observation.
Given: a recognized sole apply delegation with one active change
When: the pre-execution hook evaluates the call during report-only rollout
Then: current artifacts produce one compact observation and all pre-existing acceptance, TDD, runtime, model and delivery behavior remains unchanged

## Scenario: apply-packet-v2-matches-delegated-group
title: A v2 packet represents the exact group delegated to apply
requirement: The system MUST compile one `apply-packet/v2` for the next delegated group, MUST preserve its pending task order as concrete per-file steps, and MUST NOT classify a packet with no steps as executable.
Given: a tasks document has a group with multiple pending tasks and concrete edit declarations
When: the v2 compiler selects the group containing the next pending task
Then: the packet contains every pending step in order, excludes completed steps, and an absent or empty operation keeps it non-executable

## Scenario: apply-packet-v2-requires-exact-live-sources
title: V2 requires exact current design and tasks bindings
requirement: The system MUST bind every v2 packet to exactly the current `design.md` and `tasks.md` digests and MUST reject an absent, additional, unreadable or stale binding with the offending source named.
Given: a packet was compiled from design and tasks bytes that are missing or no longer current
When: validation runs at the apply delegation boundary
Then: the packet is rejected rather than treated as executable and the source problem is reported explicitly

## Scenario: apply-packet-v2-separates-boundaries
title: Read context, write permission and checks remain independent
requirement: The system MUST represent read context, write permission and verification commands as independent fields, MUST require every writable path to be readable and every edit to be writable, and MUST NOT grant write permission because a path appears only in a check.
Given: a packet modifies one production file and runs a test file that it does not modify
When: the packet is validated
Then: the production file is readable and writable, the test command is retained, and the test file remains outside the write allowlist
