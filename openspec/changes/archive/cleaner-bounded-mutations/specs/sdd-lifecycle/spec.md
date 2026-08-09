# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: cleaner-evidence-invalidation
title: Invalidate evidence after cleaner code changes
requirement: The system MUST invalidate cleaner audit or verification evidence when the relevant code state changes after the evidence was produced.
Given: cleaner evidence is associated with a prior code state
When: a mutation changes the relevant code state
Then: the prior evidence is marked stale or invalid and cannot be presented as current until fresh verification completes

### Scenario: cleaner-fresh-verification
title: Require fresh verification for cleaner mutations
requirement: The system MUST require fresh verification of the exact resulting code state before a bounded cleaner mutation is considered complete.
Given: a bounded cleaner mutation has changed the code state
When: the slice is assessed for completion
Then: the system reports completion only with attributable verification for the resulting state; autonomous cleaner behavior, architect mutations, parallel writers, and bulk undecomposed changes remain excluded

### Scenario: cleaner-mutation-bounded-slice
title: Apply one reviewed cleaner finding as a bounded slice
requirement: The system MUST permit a cleaner mutation only when it is represented as one identifiable SDD slice with explicit ownership, behavioral boundaries, and satisfied preconditions.
Given: a completed read-only cleaner audit contains a selected finding and the slice is within its declared ownership boundary
When: the cleaner mutation is requested
Then: the system applies only that finding's bounded change and stops when a precondition, ownership boundary, or behavioral boundary is not satisfied
