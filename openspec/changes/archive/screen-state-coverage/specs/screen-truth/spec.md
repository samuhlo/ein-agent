# OpenSpec Delta
format: openspec-delta/v1
domain: screen-truth

## ADDED
### Scenario: screen-truth-distinguishable-states
title: Never paint two different truths the same way
requirement: The system MUST verify that every pair of semantically distinct states in a surface's declared state space renders distinguishable output, and MUST report the surface, the union and both states when it does not.
Given: A surface that receives an enumerable state and a declaration of that state space.
When: The coverage guard renders every declared state.
Then: Any two states producing identical output are reported as a collision naming the surface, the union and both states.

### Scenario: screen-truth-colour-is-not-a-distinction
title: Require a difference a person can read without colour
requirement: The system MUST strip colour before comparing rendered output, so a difference that exists only as a terminal colour code does not count as distinguishing two states.
Given: Two states whose rendering differs only in its ANSI colour codes.
When: The coverage guard compares them.
Then: They are reported as a collision, because a log, a screenshot, or a monochrome terminal shows them as the same text.

### Scenario: screen-truth-declared-emptiness
title: Allow rendering nothing, but only on purpose
requirement: The system MUST report a state that renders no output unless that state is declared as empty by design with its reason, and MUST also report a declared-empty state that starts rendering output.
Given: A surface where some state renders nothing.
When: The coverage guard evaluates it against the declaration.
Then: An undeclared empty state is reported, a declared one passes, and a declaration that no longer matches the behaviour is reported so it cannot stop protecting silently.

### Scenario: screen-truth-failed-verification-is-not-done
title: Never render a failed verification as a completed phase
requirement: The system MUST distinguish a failed verification from a passed, unknown, or absent one on the phase rail, and MUST NOT present a failed verification as a completed phase.
Given: A change whose verify report exists and states that verification failed.
When: The phase rail computes and renders the verify phase.
Then: The phase is marked failed rather than done, is distinguishable from an unknown result, and renders differently from a passed verification.
