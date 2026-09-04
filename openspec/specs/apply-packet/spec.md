# OpenSpec Specification
format: openspec-spec/v1
domain: apply-packet

## Scenario: apply-evaluation-corpus-is-frozen-and-reproducible
title: The evaluation corpus is frozen, versioned, and reproduces on a second read
requirement: The system MUST record the evaluation corpus as versioned data derived from archived changes, where each item declares the change identifier, lane, TDD stance, known outcome, the files the apply actually touched, and its focused verification command. The corpus MUST be immutable once frozen: reading it twice MUST produce the same items in the same order, so measurements taken against it remain comparable. The corpus MUST NOT be consulted by any phase tool to decide routing, scope, or phase state; it is evaluation data only.
Given: a frozen evaluation corpus derived from archived changes
When: the corpus is read for a measurement run
Then: each item carries its change identifier, lane, TDD stance, known outcome, touched files, and focused check, a second read reproduces the identical set in the identical order, and no phase tool consumes it as a routing or state source

## Scenario: apply-packet-accepts-technical-notation-as-resolved
title: Technical notation is not mistaken for an unresolved decision
requirement: The system MUST distinguish an unfilled template placeholder from ordinary technical notation when it scans packet text for unresolved decisions. Programming-language notation that an author writes deliberately — a generic type parameter attached to an identifier, or a two-character nullish-coalescing operator — MUST NOT be reported as an unresolved decision and MUST NOT reject the packet. A placeholder that is genuinely unfilled — an angle-bracketed token that is not attached to a preceding identifier, such as one embedded in a path or standing alone, or a run of three or more question marks — MUST still be reported as an unresolved decision and MUST still reject the packet rather than degrade it to incomplete. The remaining unresolved markers MUST keep their current behaviour.
Given: an Apply Packet whose text fields and steps mix deliberate technical notation with genuinely unfilled placeholders
When: the packet is validated for unresolved decisions
Then: a generic type attached to an identifier and a two-character nullish-coalescing operator leave the packet executable, while an unattached angle-bracketed placeholder, a run of three or more question marks, and the pre-existing word and bracket markers are each reported as an unresolved decision that rejects the packet with the offending field named

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

## Scenario: apply-packet-v2-observation-is-durable-and-bounded
title: Packet readiness observations survive as bounded session evidence
requirement: The system MUST persist exactly one bounded versioned pre-execution observation for each recognized sole sdd-apply delegation, MUST bind it to the tool call and available packet provenance, and MUST NOT copy full packet, task, prompt, or free-form issue detail into the session record.
Given: a recognized sole sdd-apply delegation has been observed as executable, incomplete, rejected, or unavailable
When: the pre-execution hook reports readiness during the report-only rollout
Then: the active Pi session receives one parseable custom record while delegation mutation and blocking behavior remain unchanged

## Scenario: apply-packet-v2-readiness-accounting-is-honest
title: Accounting distinguishes valid readiness, malformed evidence, and no samples
requirement: The system MUST parse durable packet observations fail closed in the existing bounded session pass, MUST count malformed matching records separately from all readiness statuses, and MUST represent the executable rate as unknown when no valid observation exists.
Given: the session corpus contains valid, malformed, or no apply packet observation entries
When: the accounting report is built and rendered
Then: valid states, distinct executable packet digests and changes, and the current executable streak are counted, malformed entries remain visible but cannot improve any state, and absence is not reported as a zero percent executable rate

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
