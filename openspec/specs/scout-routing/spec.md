# OpenSpec Specification
format: openspec-spec/v1
domain: scout-routing

## Scenario: accept-runner-decorated-wrap-up-report
title: Recover an exact runner wrap-up note without weakening the report contract
requirement: The system MUST recover a scout report when a successful runtime branch prefixes `finalOutput` with the exact turn-budget wrap-up note reconstructed from that branch's structured metadata, MUST record that the recovered output may be partial as a material uncertainty, and MUST continue to reject arbitrary preambles or notes that are not proven by matching metadata.
Given: a scout branch exits successfully with `wrapUpRequested: true`, a `turnBudget.outcome` of `wrap-up-requested`, and an exact runner-generated note before one JSON report
When: the local scout adapter consumes the branch
Then: only the exact reconstructed note is removed, the JSON still passes the complete `ein-scout-report/v1` validation, the wrap-up provenance reaches the parent as an uncertainty, and any mismatched preamble remains off-contract

## Scenario: accept-safe-cheap-model-report-variants
title: Accept the safe natural variants of a cheap model report without weakening the citation gold
requirement: The system MUST normalize a scout report that names the contract version under a top-level `schema` key, cites a reference range as `lineStart`/`lineEnd`, names the supporting text as `quote`, carries an extra `id` key inside a finding, or declares an empty `uncertainties` list as an explicit absence of uncertainty. The system MUST reject as ambiguous any report that carries both `schema` and `version`, or both `lines` and `lineStart`/`lineEnd`, or both `quote` and `supports`. The system MUST NOT synthesize a missing `summary` or `summaryReferenceIds`, and MUST keep validating every citation against the real file and line on disk.
Given: a cheap model returns a schema-valid scout report expressed in one of the measured natural variants, or a report that carries an alias together with its canonical key
When: the local scout adapter parses and validates the report
Then: each safe variant is normalized to the canonical report shape and accepted, an empty uncertainty list is accepted as an explicit absence, a report mixing an alias with its canonical key is rejected as ambiguous, a report missing `summary` or `summaryReferenceIds` is still rejected, and disk citation validation stays unchanged

## Scenario: construct-bounded-research-packet
title: Construct a bounded research packet
requirement: The system MUST ensure that each delegated research request provides a bounded RESEARCH PACKET with finite inputs, budgets, and requested outputs.
Given: the parent delegates pre-scope research
When: the parent constructs the RESEARCH PACKET
Then: the packet specifies a concrete question, allowed roots, optional bounded memory and documentation inputs, explicit read, output-byte, and runtime limits, and bounded cited findings, uncertainties, alternatives, and candidate slices

## Scenario: delegate-four-or-more-files
title: Delegate four-or-more-file research
requirement: The system MUST ensure that the parent delegates understanding that requires evidence from four or more files to read-only ein-scout.
Given: a pre-scope request requires evidence from four or more files
When: the parent determines the research route
Then: the parent delegates broad exploration to read-only ein-scout instead of reading those files itself

## Scenario: delegate-two-source-classes-without-sdd-state
title: Delegate multi-source research without SDD state
requirement: The system MUST ensure that the parent delegates research combining at least two source classes among repository, memory, and external documentation without creating OpenSpec change or SDD lifecycle state.
Given: a pre-scope request combines at least two source classes among repository, memory, and external documentation
When: the parent routes the assessment
Then: the parent delegates through read-only ein-scout and the assessment creates no OpenSpec change or SDD lifecycle state

## Scenario: forward-accepted-scout-evidence
title: Forward accepted scout evidence
requirement: The system MUST ensure that the parent forwards accepted cited findings and explicit uncertainties without automatic rediscovery.
Given: a scout report contains accepted findings with citations and explicit uncertainties
When: the parent continues routing or scoping
Then: the parent forwards the accepted findings and uncertainties without automatically repeating the scout research

## Scenario: limit-material-spot-checks
title: Limit material spot-checks
requirement: The system MAY allow the parent, after accepting a valid cited scout report, to perform no more than two spot-checks limited to material claims.
Given: the parent has accepted a valid cited scout report
When: the parent validates material claims before continuing
Then: the parent performs at most two material spot-checks

## Scenario: limit-parent-routing-reads
title: Limit parent routing reads
requirement: The system MUST ensure that the parent performs no more than two routing reads before delegating broad pre-scope research.
Given: a pre-scope request meets a scout delegation boundary
When: the parent gathers enough information to route the request
Then: the parent performs at most two routing reads before delegation

## Scenario: live-smoke-proves-three-branch-scout-fan-out
title: Prove the fan-out end to end in the live smoke
requirement: The system MUST make the live scout smoke launch a three-branch `ein-scout` fan-out and require all three returned reports to pass the report contract. The system MUST make the smoke observer recognize a scout launch through the same delegation shape logic as the contract, so a `workflowScript` fan-out is tracked exactly like a direct launch. The system MUST fail the smoke when more than one tracked tool result is observed for the fan-out call, and MUST fail it when the run selects a model other than the configured one.
Given: the opt-in live scout smoke runs against a configured cheap model with a present provider credential
When: the smoke launches one foreground fan-out of three independent read-only scout branches
Then: the observer tracks the `workflowScript` launch, exactly one tool result is captured for that call, all three branch reports pass validation against the controlled evidence, and any retry or implicit model fallback fails the smoke

## Scenario: off-contract-scout-result-does-not-free-the-turn
title: Stop scout relaunch loops while preserving runtime startup failures
requirement: The system MUST record a scout report that fails the report contract wholesale as off-contract and MUST reject a further scout launch once two reports fail that way, but MUST classify an execution that produced no results and carries structured child errors as runtime unavailable, preserve its bounded cause, and reject the next launch in the same turn immediately. A salvageable report MUST consume neither allowance, and no rejection MAY assert an unverified async or foreground cause.
Given: a scout call returns a malformed report, a partially salvageable fan-out, or zero results with structured workflow child failures
When: the local adapter processes it and a later scout launch is considered in the same turn
Then: malformed reports keep the two-strike rule, salvageable evidence passes, runtime unavailable names the original cause and cuts the next launch, and clearing turn tracking restores availability

## Scenario: readonly-scout-bounded-research-contract
title: Scout research is normalized, tool-call bounded, and locally validated
requirement: The system MUST normalize accepted foreground `ein-scout` launches to fresh context, `maxRuntimeMs: 120000`, `turnBudget: { maxTurns: 12, graceTurns: 2 }`, and `toolBudget: { hard: 30, soft: 24, block: "*" }`; the canonical scout agent frontmatter MUST declare exactly `read`, `grep`, and `find` with a defined but blank `extensions:` field. This declaration is the logical empty list used to disable ambient extensions. The system MUST validate each returned report at two levels: internal consistency fails closed, while disk citations are clamped or dropped with recorded provenance. Malformed, oversized, unreferenced, unknown-identifier, and uncertainty-missing reports MUST still fail closed, as MUST a report left without any surviving valid reference. The current empty-extension compatibility contract MUST NOT be represented as a per-run capability probe or a pinned-package guarantee; unpinned future dependency drift remains a residual risk.
Given: a caller requests `ein-scout` research or a scout report is returned.
When: the foreground launch is normalized or a returned report is validated.
Then: alternate invocation forms are rejected, the normalized call has the stated wall-clock, turn, and hard tool-call limits, internally inconsistent reports fail closed, an end line past the end of an existing file is clamped, a missing, escaping, or symlink-escaping citation is dropped with its reason recorded as an uncertainty, and a report with no surviving valid reference fails closed

## Scenario: readonly-scout-remains-outside-sdd-lifecycle
title: Scout inventory membership does not change the seven-phase lifecycle
requirement: The system MUST include `ein-scout` consistently in the authoritative installed-agent inventory, model recommendations, doctor diagnostics, and exact inventory tests while MUST NOT include it in SDD phase order, routing, reconciliation, state, or chain machinery. Scout reports MUST remain advisory evidence and MUST NOT create architecture, implementation, delivery, or lifecycle authority.
Given: the authoritative agent inventory and SDD lifecycle contracts are loaded.
When: installation, doctor, model configuration, inventory tests, and lifecycle routing are evaluated.
Then: all agent-facing inventories agree that `ein-scout` is installed, all lifecycle mechanisms retain exactly `scope → map → design → tasks → apply → verify → close`, and the scout has no architecture or solution-decision authority.

## Scenario: reserve-sdd-map-for-scoped-change
title: Reserve sdd-map for scoped changes
requirement: The system MUST ensure that the parent invokes sdd-map only after the change has a bounded scope.
Given: a change does not yet have a bounded scope
When: the parent selects the next research or reasoning step
Then: the parent does not invoke sdd-map until the change is scoped

## Scenario: scout-fan-out-runs-in-parallel-within-one-tool-call
title: Run bounded read-only scout fan-out in parallel
requirement: The system MUST accept a foreground fan-out launch of two or three independent `ein-scout` branches inside one tool call, MUST validate each returned child report independently, and MUST retain the hard bound of three branches with disjoint angles.
Given: a pre-scope assessment benefits from two or three independent research angles
When: the parent launches them as one foreground fan-out and the children return
Then: the launch is accepted, each child report is validated on its own so one off-contract branch does not discard its siblings, the accepted reports reach the parent together, and a fourth branch is still rejected

## Scenario: scout-launch-is-always-foreground
title: Normalize every accepted scout launch to foreground
requirement: The system MUST normalize every accepted ein-scout launch to a foreground call in both the workflow-script form and the direct form, and the canonical scout agent frontmatter MUST declare `async: false` so the runtime resolves the launch as foreground even when the normalized launch input does not reach it.
Given: a direct ein-scout launch request
When: the launch is normalized
Then: the normalized launch is foreground and no asynchronous scout call is produced

## Scenario: scout-model-exclusion-cache-is-short-and-explicit
title: Managed model exclusions recover quickly without hidden fallback
requirement: The system MUST configure the managed subagent runtime to expire model exclusions after 300000 milliseconds, MUST continue failing closed while an exclusion is active, and MUST NOT add or select a fallback model without explicit user configuration.
Given: a configured scout model produces an empty or provider-failed run and upstream records an exclusion
When: the managed subagent configuration is loaded or reloaded
Then: the exclusion lasts at most five minutes, active longer exclusions are shortened by upstream, and no different model is selected implicitly

## Scenario: scout-reference-end-line-clamped-to-file-end
title: Clamp a citation that overruns the end of the file
requirement: The system MUST clamp a scout reference whose end line exceeds the file length to the last line of that file when its start line falls inside the file, and MUST continue to reject a reference whose start line falls outside the file.
Given: a scout reference names an existing in-root file and cites an end line greater than the file's line count
When: the reference is validated against disk
Then: the end line is clamped to the file's last line and the reference is accepted, while a reference whose start line is past the last line is still rejected as an unresolvable citation

## Scenario: scout-reference-rejection-names-the-citation
title: Name the citation in every reference rejection
requirement: The system MUST name the offending reference identifier, repository-relative path, and cited line range in every reference validation failure message, and MUST name the file's actual line count when the failure is a line-range failure.
Given: a scout reference fails disk validation
When: the failure message is produced for the parent
Then: the message names the reference identifier, the path, and the cited range, and a line-range failure also names the file's actual line count, so the parent can correct the citation instead of relaunching blind

## Scenario: scout-report-survives-a-single-invalid-reference
title: Salvage a report that carries one unresolvable citation
requirement: The system MUST drop an unresolvable reference and the findings that rest solely on it instead of discarding the whole report, MUST record each dropped reference and finding as an explicit uncertainty carrying its rejection reason, and MUST reject the report entirely only when the summary retains no valid reference.
Given: a schema-valid scout report whose references include at least one that cannot be resolved against disk
When: the report is validated
Then: the unresolvable reference and the findings resting solely on it are dropped, each drop is returned as an explicit uncertainty naming its reason, the remaining cited evidence reaches the parent, and only a summary left without any valid reference fails the report as a whole

## Scenario: use-independent-scouts-before-scope
title: Use bounded independent scouts before scope
requirement: The system MUST ensure that the parent uses at most three scouts with independent research angles and MUST NOT invoke speculative sdd-map for pre-scope research.
Given: a pre-scope assessment benefits from parallel research
When: the parent delegates the assessment
Then: the parent uses one to three scouts with independent angles instead of speculative sdd-map
