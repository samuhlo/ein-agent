# OpenSpec Delta
format: openspec-delta/v1
domain: apply-packet

## ADDED
### Scenario: apply-evaluation-corpus-is-frozen-and-reproducible
title: The evaluation corpus is frozen, versioned, and reproduces on a second read
requirement: The system MUST record the evaluation corpus as versioned data derived from archived changes, where each item declares the change identifier, lane, TDD stance, known outcome, the files the apply actually touched, and its focused verification command. The corpus MUST be immutable once frozen: reading it twice MUST produce the same items in the same order, so measurements taken against it remain comparable. The corpus MUST NOT be consulted by any phase tool to decide routing, scope, or phase state; it is evaluation data only.
Given: a frozen evaluation corpus derived from archived changes
When: the corpus is read for a measurement run
Then: each item carries its change identifier, lane, TDD stance, known outcome, touched files, and focused check, a second read reproduces the identical set in the identical order, and no phase tool consumes it as a routing or state source

### Scenario: apply-packet-schema-rejects-unexecutable-packet
title: The Apply Packet schema rejects a packet an executor could not run without deciding
requirement: The system MUST validate an Apply Packet against a versioned schema before it can be treated as executable, and MUST reject a packet that declares no invariant, that leaves a decision to the executor, that was compiled from a source artifact which has since changed, or that names an edit or command outside its declared allowed files. Rejection MUST name the failing rule and the offending field. Uncertainty MUST fail closed as `unknown`: an unreadable or ambiguous source artifact MUST NOT yield a valid packet by default.
Given: an Apply Packet compiled from a change's design and tasks artifacts
When: the packet is validated against the schema
Then: a packet missing an invariant, containing an unresolved decision, compiled from a changed source artifact, or naming a path outside its allowed files is rejected with the failing rule and field named, and an unreadable source yields `unknown` rather than a valid packet
