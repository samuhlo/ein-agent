# OpenSpec Delta
format: openspec-delta/v1
domain: active-change-selection

## ADDED
### Scenario: active-change-ambiguity-is-represented
title: Report ambiguity instead of picking by filesystem order
requirement: The system MUST NOT resolve an active change when more than one is open and none was requested, and MUST report the ambiguity with every candidate named in a stable order.
Given: A repository with two or more changes in `openspec/changes/` and no explicitly requested change.
When: The SDD status is resolved.
Then: No change is selected, the selection is reported as ambiguous with its candidates sorted, and a blocker states that one must be chosen explicitly.

### Scenario: active-change-single-and-explicit
title: Keep the unambiguous cases free of ceremony
requirement: The system MUST resolve the only open change without any added prompt or blocker, and MUST always honour an explicitly requested change regardless of how many are open.
Given: A repository with exactly one open change, or any repository plus an explicit request.
When: The SDD status is resolved.
Then: The change resolves as before, and the selection records whether it was the only candidate or an explicit request.

### Scenario: active-change-single-resolver
title: Answer "which change is active" in exactly one place
requirement: The system MUST derive the active change from a single resolver, and every surface that needs it — status, plan preview, preflight record, CLI and tools — MUST consume that resolver rather than reimplementing the choice.
Given: Several surfaces need to know which change is active.
When: Each of them resolves it.
Then: They all obtain the same answer, including the same refusal under ambiguity.

### Scenario: active-change-no-write-under-ambiguity
title: Never write to a change nobody chose
requirement: The system MUST refuse to act, exit non-zero, and name the candidates when a command that writes would otherwise default to an arbitrary active change, and MUST leave every candidate untouched.
Given: Two or more open changes and a lifecycle command that accepts the active change by default.
When: The command runs without an explicit change.
Then: It writes nothing, its output names the candidates and how to disambiguate, and its exit status is non-zero.

### Scenario: active-change-ambiguity-is-not-an-empty-repository
title: Never present ambiguity as absence of work
requirement: The system MUST distinguish "no active change" from "several active changes and none chosen" on every surface that reports it, and MUST NOT render ambiguity as an empty or silent state.
Given: A repository with two or more open changes and none chosen.
When: The status output or the task overlay renders.
Then: Each surface states that several changes are open and names them, and neither claims that there is no active change nor renders nothing at all.
