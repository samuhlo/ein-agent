# OpenSpec Specification
format: openspec-spec/v1
domain: sdd-lifecycle

## Scenario: canonical-close-readiness
title: Canonical spec evidence gates close
requirement: The system MUST block close when canonical spec evidence is unresolved, pending, malformed, stale, or conflicted
Given: an OpenSpec change has canonical spec declaration and synchronization evidence
When: close readiness is assessed including with legacy force
Then: only synchronized evidence permits close and the assessment does not synchronize or rewrite specs

## Scenario: canonical-context-budget
title: Scope and design use bounded canonical context
requirement: The system MUST resolve only explicit canonical domain hints within a three-file and 32 KiB UTF-8 budget
Given: scope or design receives canonical domain hints for an OpenSpec change
When: it builds canonical spec context
Then: it records each exact path SHA-256 and byte count or blocks with a narrower-selection request without truncation

## Scenario: legacy-sdd-fallback
title: Legacy SDD changes retain their lifecycle
requirement: The system MUST preserve legacy lifecycle behavior when changes resolve through the .sdd fallback
Given: a project has only a .sdd changes directory with valid legacy artifacts
When: its status or close readiness is evaluated
Then: canonical spec declarations are not required and no canonical specs deltas or reports are written under .sdd
