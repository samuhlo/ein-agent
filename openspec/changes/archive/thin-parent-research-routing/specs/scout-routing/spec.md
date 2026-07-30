# OpenSpec Delta
format: openspec-delta/v1
domain: scout-routing

## ADDED
### Scenario: delegate-four-or-more-files
title: Delegate four-or-more-file research
requirement: The system MUST ensure that the parent delegates understanding that requires evidence from four or more files to read-only ein-scout.
Given: a pre-scope request requires evidence from four or more files
When: the parent determines the research route
Then: the parent delegates broad exploration to read-only ein-scout instead of reading those files itself

### Scenario: delegate-two-source-classes-without-sdd-state
title: Delegate multi-source research without SDD state
requirement: The system MUST ensure that the parent delegates research combining at least two source classes among repository, memory, and external documentation without creating OpenSpec change or SDD lifecycle state.
Given: a pre-scope request combines at least two source classes among repository, memory, and external documentation
When: the parent routes the assessment
Then: the parent delegates through read-only ein-scout and the assessment creates no OpenSpec change or SDD lifecycle state

### Scenario: limit-parent-routing-reads
title: Limit parent routing reads
requirement: The system MUST ensure that the parent performs no more than two routing reads before delegating broad pre-scope research.
Given: a pre-scope request meets a scout delegation boundary
When: the parent gathers enough information to route the request
Then: the parent performs at most two routing reads before delegation

### Scenario: use-independent-scouts-before-scope
title: Use bounded independent scouts before scope
requirement: The system MUST ensure that the parent uses at most three scouts with independent research angles and MUST NOT invoke speculative sdd-map for pre-scope research.
Given: a pre-scope assessment benefits from parallel research
When: the parent delegates the assessment
Then: the parent uses one to three scouts with independent angles instead of speculative sdd-map

### Scenario: reserve-sdd-map-for-scoped-change
title: Reserve sdd-map for scoped changes
requirement: The system MUST ensure that the parent invokes sdd-map only after the change has a bounded scope.
Given: a change does not yet have a bounded scope
When: the parent selects the next research or reasoning step
Then: the parent does not invoke sdd-map until the change is scoped

### Scenario: construct-bounded-research-packet
title: Construct a bounded research packet
requirement: The system MUST ensure that each delegated research request provides a bounded RESEARCH PACKET with finite inputs, budgets, and requested outputs.
Given: the parent delegates pre-scope research
When: the parent constructs the RESEARCH PACKET
Then: the packet specifies a concrete question, allowed roots, optional bounded memory and documentation inputs, explicit read, output-byte, and runtime limits, and bounded cited findings, uncertainties, alternatives, and candidate slices

### Scenario: forward-accepted-scout-evidence
title: Forward accepted scout evidence
requirement: The system MUST ensure that the parent forwards accepted cited findings and explicit uncertainties without automatic rediscovery.
Given: a scout report contains accepted findings with citations and explicit uncertainties
When: the parent continues routing or scoping
Then: the parent forwards the accepted findings and uncertainties without automatically repeating the scout research

### Scenario: limit-material-spot-checks
title: Limit material spot-checks
requirement: The system MAY allow the parent, after accepting a valid cited scout report, to perform no more than two spot-checks limited to material claims.
Given: the parent has accepted a valid cited scout report
When: the parent validates material claims before continuing
Then: the parent performs at most two material spot-checks
