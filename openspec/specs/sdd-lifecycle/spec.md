# OpenSpec Specification
format: openspec-spec/v1
domain: sdd-lifecycle

## Scenario: apply-default-acceptance-none
title: Normal apply does not require an acceptance report
requirement: The system MUST inject `acceptance: none` for normal apply work and MUST NOT require or claim an acceptance report for that mode, while preserving the independent `sdd-verify` final gate.
Given: an SDD change enters normal or mechanical apply work without an explicit verified override.
When: the apply contract and runtime handoff are evaluated.
Then: acceptance is none, no acceptance report is required, and the change still proceeds to independent sdd-verify.

## Scenario: apply-explicit-verified-override
title: Verified apply remains an evidence-bearing exception
requirement: The system MUST treat `acceptance: verified` as an explicit exceptional override and MUST require fresh re-execution and evidence for that mode.
Given: an apply request explicitly selects the verified acceptance override.
When: apply completion is assessed.
Then: completion requires the specified checks to be re-executed and their evidence recorded; the normal acceptance-none default does not satisfy the override.

## Scenario: canonical-close-readiness
title: Canonical close readiness requires synchronized evidence except for one declarationless legacy escape
requirement: The system MUST block close when canonical spec evidence is unresolved, pending, malformed, stale, or conflicted, except that force MAY admit only an unresolved declarationless legacy record after all non-spec close gates pass and a valid audit reason is supplied; assessment and close MUST NOT synchronize or rewrite specs.
Given: a canonical SDD change has otherwise passing task, apply, verify, summary, naming, source, and archive-destination gates, while its canonical spec evidence is synchronized, pending, conflicted, malformed, stale, or unresolved.
When: close readiness is evaluated normally or with force and an audit reason.
Then: normal close requires synchronized evidence; pending, conflict, malformed, and stale evidence always blocks; only the exact unresolved declarationless legacy shape may close with force and a valid reason, returning distinguishable legacy evidence without reclassifying or synchronizing the spec state.

## Scenario: canonical-context-budget
title: Scope and design use bounded canonical context
requirement: The system MUST resolve only explicit canonical domain hints within a three-file and 32 KiB UTF-8 budget
Given: scope or design receives canonical domain hints for an OpenSpec change
When: it builds canonical spec context
Then: it records each exact path SHA-256 and byte count or blocks with a narrower-selection request without truncation

## Scenario: early-phase-status-distinguishes-pending-artifacts-from-blockers
title: Status suppresses only future task absence during early phases
requirement: The system MUST treat absent `tasks.md` as pending work rather than a blocker while the recommended phase is scope, map, or design, and MUST surface actionable task, apply, and verify blockers once their downstream phases are reached.
Given: an SDD change is in an early phase without `tasks.md`, or has reached tasks, apply, or verify with an actionable artifact problem.
When: lifecycle status or next-step diagnostics are resolved.
Then: early-phase diagnostics do not report absent `tasks.md` as a blocker, while absent, unreadable, malformed, or blocked tasks and incomplete or blocked apply and failed or unknown verify outcomes remain visible at their applicable downstream phases.

## Scenario: explicit-sdd-startup-bootstraps-config-and-enters-scope
title: Explicit SDD startup creates or preserves configuration before scope
requirement: The system MUST create missing OpenSpec configuration during an explicit SDD request, MUST preserve the exact existing `openspec/config.yaml` bytes when configuration already exists, and MUST continue the original request to `sdd-scope` without requiring manual initialization.
Given: a user explicitly requests SDD and `openspec/config.yaml` is either absent or already contains user-provided bytes.
When: SDD startup preparation completes.
Then: a missing configuration is created, existing configuration bytes are unchanged, and the original request continues to `sdd-scope` without requiring `/sdd-init`, a repeated request, or a separate initialization confirmation.

## Scenario: forced-close-explicit-legacy-escape
title: Declarationless unresolved legacy close is narrow and auditable
requirement: The system MUST allow forced close only for an unresolved spec state caused solely by the declarationless legacy record shape after all non-spec close-readiness gates pass, and MUST distinguish that result from normal close by returning legacy escape evidence and a non-empty valid reason.
Given: a canonical legacy SDD change has an unresolved state caused solely by a readable declarationless scope, no delta document, no sync-report.md, all non-spec close-readiness gates pass, and the caller explicitly supplies force and a valid audit reason.
When: forced close readiness and archival are evaluated.
Then: the system may archive through the legacy escape, returns distinguishable legacy evidence with the reason without reclassifying or synchronizing the unresolved state, and does not weaken normal close or admit incomplete modern changes.

## Scenario: forced-close-preserves-readiness-gates
title: Forced close cannot archive incomplete or unverified work
requirement: The system MUST preserve task, apply, verify, summary, and canonical-spec readiness gates when forced close is requested and MUST NOT archive a change with pending tasks, incomplete apply, missing, failing, or stale verify evidence, missing or stale summary evidence, or an OpenSpec conflict.
Given: an SDD change is not fully close-ready because one or more required lifecycle conditions are incomplete, absent, failing, stale, or conflicted.
When: close is requested with force enabled.
Then: the change remains active, every applicable blocker is reported, and force does not classify or archive the change as complete.

## Scenario: legacy-sdd-fallback
title: Legacy SDD changes retain their lifecycle
requirement: The system MUST preserve legacy lifecycle behavior when changes resolve through the .sdd fallback
Given: a project has only a .sdd changes directory with valid legacy artifacts
When: its status or close readiness is evaluated
Then: canonical spec declarations are not required and no canonical specs deltas or reports are written under .sdd

## Scenario: structured-run-cost-attribution-and-provenance
title: SDD cost aggregates are attributable, truthful, and reproducible
requirement: The system MUST use the local delegation hook to mint and persist structured flowId, exact changeId, canonical phase, runId, attempt, retry ordinal, and timestamps, and MUST bind a receipt only to one exact changed canonical phase artifact and one stable-read new or changed producer metadata artifact. It MUST fail closed and persist no receipt when phase or metadata candidates are zero, multiple, unreadable, unstable, mismatched, or otherwise ambiguous; task text, prefixes, substrings, filenames, agent names, and later prose MUST NOT supply identity. The system MUST preserve independent reported, estimated, or unavailable states for input, output, cache-read, cache-write, provider cost, estimated cost, and duration; unqualified usage.cost MUST be neither provider-reported nor estimated cost. It MUST validate and deduplicate local sidecars before aggregation, expose sorted exact memberRunIds for change, phase, and attempt/retry aggregates, keep cache metrics separate, and make an incomplete metric unavailable rather than zero or a partial total. Metadata without a valid local sidecar MUST be visibly excluded as legacy or rejected. Status MUST retain existing lifecycle fields and the realCost compatibility slot while exposing the provenance ledger; costUsd MUST alias only complete provider-reported cost. The adapter MUST preserve the existing conservative timeout reconciliation as its sole authority and MUST NOT introduce numeric token or cost gates or external package changes.
Given: SDD runs include similar change names, retries, later prose mentions, zero, multiple, unreadable, unstable, or ambiguous candidates, partial provider metrics, unqualified usage.cost, legacy metadata without sidecars, or timeout reconciliation observations.
When: the local hook records a receipt or status produces change, phase, or attempt/retry aggregates.
Then: only the locally owned exact stable bindings determine membership; rejected candidates create visible bounded problems and no receipt; each accepted run is counted at most once in every applicable aggregate; metric provenance remains distinct; unavailable values are not rendered as zero or partial totals; provider cost is never inferred from usage.cost or estimates; legacy records do not contribute; aggregate memberRunIds reproduce each total; and lifecycle status compatibility, routing, acceptance, and timeout reconciliation behavior remain unchanged.
