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

## Scenario: guard-allowlist-flag-inspection
title: Allowlist promotion inspects flags, including bundled short options
requirement: The system MUST refuse allowlist promotion for an otherwise safe git subcommand that carries a mutating, history-rewriting, or interactive flag, and MUST detect such flags when they are bundled into a single short-option token.
Given: a shell command invokes an allowlisted git subcommand with flags such as branch deletion, branch renaming, commit amendment, hook bypass, or an interactive or editor-opening mode, expressed as long flags, separate short flags, or one bundled short-option token.
When: the harness guard evaluates the command for allowlist promotion.
Then: the command is not promoted to allow, while the listing, inspection, and creation forms of the same subcommands remain promotable, and the denial and confirmation tables are unchanged by the allowlist.

## Scenario: guard-allowlist-whole-command
title: Allowlist promotion requires the whole command to be safe
requirement: The system MUST promote a shell command to allow only when every operator-separated segment is an allowlisted git subcommand with clean flags and the command contains no command substitution or redirection.
Given: a shell command that combines an allowlisted git subcommand with another segment, a substitution, or a redirection.
When: the harness guard evaluates the command.
Then: promotion is withheld unless every segment is itself allowlisted and metacharacter-free, and a withheld promotion yields no decision so the host permission flow stays in control rather than a weaker decision being emitted.

## Scenario: guard-decision-precedence
title: The allowlist can never shadow a denial or a confirmation
requirement: The system MUST evaluate denied patterns first, confirmation-required patterns second, and allowlist promotion only third, so that an allowlist match never approves a command that also matches a denied or confirmation-required pattern.
Given: a shell command whose text matches both an allowlisted git subcommand and a denied or confirmation-required pattern.
When: the harness guard resolves a permission decision for that command.
Then: the decision is deny or ask according to the pattern that matched, never allow, regardless of the order in which the matching fragments appear in the command.

## Scenario: guard-envelope-degrades-open
title: The guard degrades open on unusable hook input
requirement: The system MUST emit at most one permission decision per guard invocation, MUST complete successfully when the hook payload is absent, unparseable, or missing its command field, and MUST NOT emit output fields it has not verified against the host.
Given: the guard receives invalid JSON, an empty object, or a payload without a command field.
When: the guard runs as the pre-tool-use hook.
Then: it writes no decision, exits successfully, relies on the independent host-level denial rules as the remaining protection, and never introduces a second output channel alongside the permission decision.

## Scenario: guard-ignores-cross-harness-delivery-grants
title: Delivery grants do not cross harness boundaries
requirement: The system MUST NOT consume the Pi delivery-grant file when resolving Claude Code guard decisions, so a grant minted by one harness cannot silently suppress a confirmation in the other.
Given: a delivery grant file exists for the current working directory because a Pi session minted it, and a guarded delivery command is attempted from the Claude Code harness.
When: the harness guard evaluates that command.
Then: the grant is neither read nor consumed, the command still resolves to ask, and confirmation is obtained through the host's own permission prompt.

## Scenario: guard-sdd-state-is-advisory
title: SDD state informs guard reasons but never creates a decision
requirement: The system MUST derive guard decisions from command policy alone and MAY attach current SDD change state only to a decision it has already taken.
Given: a shell command is evaluated while no active change exists under the OpenSpec changes directory.
When: the harness guard resolves the permission decision.
Then: the decision is exactly what the command-policy layers produced with no additional confirmation introduced by the absent change, and any SDD state text appears only inside an already-emitted deny or ask reason.

## Scenario: legacy-sdd-fallback
title: Legacy SDD changes retain their lifecycle
requirement: The system MUST preserve legacy lifecycle behavior when changes resolve through the .sdd fallback
Given: a project has only a .sdd changes directory with valid legacy artifacts
When: its status or close readiness is evaluated
Then: canonical spec declarations are not required and no canonical specs deltas or reports are written under .sdd

## Scenario: openspec-artifacts-excluded-from-review-budget
title: OpenSpec artifacts stay outside the review size budget
requirement: The system MUST exclude every path under the OpenSpec directory from the production line count used by the review-size forecast.
Given: a measured range contains production source changes together with changes to OpenSpec configuration and to change artifacts nested under the OpenSpec changes directory.
When: the review-size forecast measures that range.
Then: the production count reflects only the production source lines, the OpenSpec lines are counted as neither production nor tests, and identical source changes yield the same production count regardless of artifact size.

## Scenario: repository-bootstrap-is-best-effort
title: Missing-repository bootstrap is bounded, opt-outable, and never fatal
requirement: The system MUST attempt repository initialization only for a working directory that is outside a repository, already holds OpenSpec change artifacts, exposes no existing repository metadata entry, and has no opt-out set, and MUST degrade to a reported notice when initialization is unavailable.
Given: SDD status is resolved in a directory that is not inside a repository, or whose repository metadata exists but cannot be read, or where initialization fails because the location is read-only, the tool is missing, or an opt-out or continuous-integration signal is set.
When: SDD status runs in that directory.
Then: initialization is attempted only under the bounded conditions, an existing metadata entry is never reinitialized, any failure is reported as an absent repository with its reason, and status completes normally with an unchanged exit code.

## Scenario: working-tree-signal-single-channel
title: Repository and working-tree state is reported through one channel
requirement: The system MUST report repository presence and working-tree cleanliness through the SDD status output as the single channel and MUST NOT duplicate that report in the permission-decision envelope or in the harness deployment step.
Given: the working directory has uncommitted changes while the coordinator resolves SDD status between phases.
When: SDD status output is produced.
Then: it carries exactly one working-tree block naming the uncommitted state and its stash or commit remedy, no other harness surface repeats that signal, and phase routing and the exit code are unaffected.
