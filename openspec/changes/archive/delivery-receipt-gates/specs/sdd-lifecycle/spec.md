# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## MODIFIED
### Scenario: delivery-receipt-four-boundary-gates
title: Candidate identity is checked at four delivery boundaries
requirement: The system MUST validate verified candidate content independently before commit, after commit against `HEAD^{tree}`, before push, and before opening or updating a pull request.
Given: verified SDD content has a structurally valid current candidate receipt and delivery intent is authorized.
When: delivery crosses each commit, post-commit, push, and pull-request boundary.
Then: each boundary performs its own current identity check, and no earlier successful check substitutes for a later check.

### Scenario: delivery-receipt-divergence-routes-to-verify
title: Content divergence fails closed and routes to verify
requirement: The system MUST block delivery and visibly route the change back to verify whenever candidate identity is absent, uncertain, stale, malformed, or divergent at a required delivery boundary.
Given: verified SDD delivery reaches one of the four content-identity gates.
When: the required identity cannot be proven equal to the candidate receipt.
Then: the requested delivery action does not proceed, the mismatch boundary and reason are visible, and the next required lifecycle action is verify without automatic recovery or receipt refresh.

### Scenario: delivery-receipt-post-commit-hook-mutation
title: Post-commit validation detects hook mutation
requirement: The system MUST compare the resulting `HEAD^{tree}` to the receipt candidate tree after commit processing and hooks complete.
Given: pre-commit candidate identity matched the receipt.
When: commit processing or a hook changes the content recorded by the commit.
Then: the post-commit gate detects the unequal tree, blocks subsequent push and pull-request delivery, and routes back to verify.

### Scenario: delivery-receipt-pr-head-match
title: Pull-request head must match validated delivery head
requirement: The system MUST block opening or updating a pull request when its effective head differs from the head whose content identity passed the pre-PR gate.
Given: a pull request is about to be opened or updated for validated delivery content.
When: the system resolves the local and effective pull-request head identities.
Then: it proceeds only when the effective PR head is the validated delivery head; any different or unresolvable head blocks the operation and routes back to verify.

### Scenario: delivery-receipt-mechanical-declaration
title: Mechanical delivery is explicit and unverified
requirement: The system MUST require trivial or mechanical delivery without a candidate receipt to be explicitly declared and MUST NOT represent that path as verified SDD delivery.
Given: a delivery is classified as trivial or mechanical and no verification receipt applies.
When: delivery authorization is evaluated.
Then: the no-verification declaration is visible, no candidate receipt is fabricated or implied, and the existing user-intent grant remains required and unchanged.

### Scenario: candidate-receipt-emission-preconditions
title: Receipt evidence resolves one live or archived change
requirement: The system MUST resolve candidate receipt evidence from exactly one live or archived SDD change location and MUST fail closed when neither or both locations exist.
Given: candidate receipt emission or validation names an SDD change.
When: the system resolves receipt preconditions and evidence paths.
Then: it uses the uniquely resolved live or archived change; an archived change is eligible only with complete apply, fresh passing verify, and a current close summary, while ambiguity blocks delivery without silently preferring a location.

### Scenario: candidate-receipt-delivery-limit
title: Candidate receipt delivery enforcement
requirement: The system MUST keep user-intent authorization separate from candidate-content authorization, MUST enforce candidate receipt identity for verified SDD delivery, and MUST allow trivial or mechanical delivery only through an explicit declaration that no verification receipt applies.
Given: a delivery action is requested with an existing user-intent grant.
When: the system determines whether commit, push, or pull-request delivery may proceed.
Then: the unchanged intent grant authorizes only the action, a matching candidate receipt authorizes only verified content, and an explicitly declared trivial or mechanical delivery neither emits nor claims verification evidence.
