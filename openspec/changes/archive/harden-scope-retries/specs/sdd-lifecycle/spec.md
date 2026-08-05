# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: router-blocks-map-on-unresolved-spec-provenance
title: Router blocks map on unresolved or conflicting spec provenance
requirement: The system MUST prevent deterministic SDD routing from recommending map while an active canonical change has unresolved or conflicting OpenSpec provenance.
Given: A canonical change has scope.md, lacks map.md, and its existing specState is unresolved or conflict.
When: lifecycle status or sdd-next is resolved.
Then: Routing reports a spec provenance blocker and does not recommend map; pending and synchronized spec states remain eligible to recommend map when no earlier phase gate blocks.

### Scenario: scope-retry-preserves-valid-delta
title: Scope retries preserve valid persisted deltas
requirement: The system MUST preserve a valid persisted OpenSpec delta as the authoritative declaration when sdd-scope is retried, instead of writing a contradictory declaration or delta.
Given: An active canonical OpenSpec change already contains a delta that passes existing delta validation and its scope phase is retried.
When: sdd-scope resumes or re-evaluates the change.
Then: The validated persisted delta remains unchanged and authoritative, no contradictory spec_delta: none declaration is introduced, and the scope contract remains resumable.
