# OpenSpec Delta
format: openspec-delta/v1
domain: installer-runtime

## ADDED
### Scenario: install-journal-canonical-codec-boundary
title: Stored journals cross one canonical codec boundary
requirement: The system MUST accept stored installation journal bytes only when they decode to a structurally valid and reachable journal and exactly match that journal's canonical encoding.
Given: stored bytes contain a canonical valid journal, malformed JSON, a structurally invalid journal, an unreachable journal, or valid but non-canonical JSON
When: the installer decodes the stored journal
Then: only the canonical valid and reachable bytes produce a journal, while every other input produces the stable recovery-required outcome

### Scenario: install-journal-resume-policy-is-consistent
title: CLI and execution use one fail-closed resume policy
requirement: The system MUST classify installation journal resume eligibility identically before CLI effects and before journaled plan mutation, without broadening the supported recovery cases.
Given: a matching supported pre-mutation Pi retry, a matching supported retirement retry, or any other valid non-complete journal
When: installation startup and journaled execution decide whether work may continue
Then: both admit exactly the same two supported retry kinds and reject every ambiguous case before any handler runs

### Scenario: install-journal-lifecycle-remains-single-owner
title: Journaled execution preserves checkpoints and terminal lifecycle exactly once
requirement: The system MUST coordinate journal transitions, persistence, signals, rollback and finalization through their owning boundaries without changing the observable installation lifecycle.
Given: a fresh plan, an admitted retry, a handler or persistence failure, an interruption, or a successful global commit
When: journaled execution runs
Then: it persists each required reachable checkpoint, executes only admitted handlers, removes its signal listeners, and invokes rollback or finalization at most once according to the proven terminal outcome
