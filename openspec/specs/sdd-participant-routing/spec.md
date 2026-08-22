# OpenSpec Specification
format: openspec-spec/v1
domain: sdd-participant-routing

## Scenario: architect-binding-fresh-after-cleaner
title: Architect binding remains fresh within the advisory run
requirement: The system MUST bind Architect work to the fresh post-Cleaner source identity produced by the current advisory participant run.
Given: All Cleaner slices in the current session have completed and Cleaner may have changed in-scope files.
When: The coordinator prepares Architect execution.
Then: The coordinator recomputes the source identity, admits Architect only for that identity, and abandons the advisory run if the source becomes stale.

## Scenario: cleaner-scope-slices-respect-limits
title: Complete changed scope is deterministically sliced within Cleaner limits
requirement: The system MUST deterministically partition the complete changed-file scope into ordered Cleaner audit slices within the existing Cleaner limits.
Given: An applied SDD change declares a complete changed-file scope and Cleaner file/source-byte limits.
When: The advisory participant coordinator creates its current-session Cleaner plan.
Then: Every changed file is assigned exactly once, each slice respects both limits, and an impossible file is reported unavailable without filtering or raising limits.

## Scenario: cleaner-slices-gate-architect
title: Cleaner slices order Architect inside the advisory run
requirement: The system MUST complete every planned Cleaner slice before executing Architect within the same advisory participant run.
Given: A current-session advisory run contains Cleaner slices and Architect is enabled.
When: The coordinator requests the next advisory participant.
Then: Architect remains unavailable until all Cleaner slices complete; a blocked, failed, missing, stale, or unavailable Cleaner result ends that advisory run without blocking SDD verify.

## Scenario: participant-failure-does-not-gate-verify
title: Advisory participant failure never blocks mechanical verify
requirement: The system MUST allow SDD verify to run regardless of automatic participant availability or outcome.
Given: An apply-complete SDD change has participants disabled, pending, blocked, stale, unavailable, interrupted, or complete.
When: The deterministic router recommends verify or sdd-verify is delegated.
Then: The participant outcome is reported honestly as advisory evidence, while verify remains available and any participant source mutation invalidates prior verification freshness.

## Scenario: participant-state-is-ephemeral
title: Participant progress is session-local and continuity-independent
requirement: The system MUST keep automatic participant progress ephemeral and independent from cross-runtime continuity checkpoints.
Given: An apply-complete SDD change has automatic participants enabled, with or without continuity.json.
When: The coordinator starts or resumes in a Pi session.
Then: It derives a fresh advisory plan from current changed files, creates or modifies no continuity checkpoint, and safely restarts from the first Cleaner slice after a session restart.
