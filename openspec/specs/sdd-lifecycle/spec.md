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

## Scenario: claude-sdd-syncs-openspec-delta
title: Claude SDD CLI synchronizes canonical OpenSpec deltas
requirement: The system MUST expose a sync command in the Claude SDD CLI that deterministically synchronizes a named existing change through the shared OpenSpec filesystem synchronizer and returns a distinct success, conflict, or failure result without a bridge script.
Given: an existing OpenSpec change has a structured delta for one or more canonical domains
When: Claude invokes cc-ein-sdd sync for that change
Then: the shared synchronizer updates canonical specs and its report on success, reports a conflict without overwriting conflicting canonical bytes, or returns a failure status for malformed or operational errors

## Scenario: cleaner-evidence-invalidation
title: Invalidate evidence after cleaner code changes
requirement: The system MUST invalidate cleaner audit or verification evidence when the relevant code state changes after the evidence was produced.
Given: cleaner evidence is associated with a prior code state
When: a mutation changes the relevant code state
Then: the prior evidence is marked stale or invalid and cannot be presented as current until fresh verification completes

## Scenario: cleaner-fresh-verification
title: Require fresh verification for cleaner mutations
requirement: The system MUST require fresh verification of the exact resulting code state before a bounded cleaner mutation is considered complete.
Given: a bounded cleaner mutation has changed the code state
When: the slice is assessed for completion
Then: the system reports completion only with attributable verification for the resulting state; autonomous cleaner behavior, architect mutations, parallel writers, and bulk undecomposed changes remain excluded

## Scenario: cleaner-mutation-bounded-slice
title: Apply one reviewed cleaner finding as a bounded slice
requirement: The system MUST permit a cleaner mutation only when it is represented as one identifiable SDD slice with explicit ownership, behavioral boundaries, and satisfied preconditions.
Given: a completed read-only cleaner audit contains a selected finding and the slice is within its declared ownership boundary
When: the cleaner mutation is requested
Then: the system applies only that finding's bounded change and stops when a precondition, ownership boundary, or behavioral boundary is not satisfied

## Scenario: cleaner-read-only-audit
title: Cleaner audit reports findings without mutation
requirement: The system MUST audit cleaner opportunities in read-only mode using projected project state and applicable reviewed-area ledger records, and MUST produce traceable findings without mutating source, Git, ledger, or cleaner state.
Given: Projected state and applicable ledger evidence are available, incomplete, stale, invalid, unavailable, or ambiguous.
When: A cleaner audit is requested.
Then: The audit reports classified findings with source and evidence references plus explicit uncertainty, does not present suggestions as applied changes, and leaves all inspected project, Git, and ledger state unchanged.

## Scenario: core-coordinator-source-generates-claude-brain
title: Claude coordinator brain is generated from canonical core
requirement: The system MUST generate the Claude coordinator brain from a canonical coordinator source plus an explicit Claude adaptation block during synchronization, and MUST NOT treat a separately hand-maintained full cc-ein/CLAUDE.md as authoritative.
Given: the canonical coordinator source and Claude adaptation block are present and a synchronization is requested
When: the synchronization compiles the coordinator surface for Claude Code
Then: the generated cc-ein/CLAUDE.md reflects the canonical source and adaptation boundary, and a source change is observable in the next generated output without manual copying

## Scenario: core-parity-check-covers-generated-surfaces
title: Core-to-Claude parity is checked deterministically
requirement: The system MUST provide a deterministic core-to-Claude parity check that detects drift in the canonical coordinator, generated coordinator, tool mappings, translated runtime tokens, and agent-model routing.
Given: canonical core inputs, Claude adaptation inputs, and generated Claude surfaces are available
When: the parity check evaluates the supported core surface
Then: matching inputs pass, while source, mapping, translation, or routing drift reports a failure naming the mismatched surface

## Scenario: core-sync-rejects-agent-routing-drift
title: Agent-model routing drift fails synchronization
requirement: The system MUST fail core synchronization when the canonical agent inventory and Claude model-routing declarations differ, including a canonical agent without routing or a stale routing entry, instead of silently using an incomplete hardcoded table.
Given: the canonical agent inventory has a missing or stale Claude model-routing declaration
When: synchronization builds Claude agent frontmatter
Then: synchronization exits unsuccessfully with the routing mismatch identified and does not claim a complete Claude agent surface

## Scenario: core-sync-rejects-unknown-agent-tools
title: Unknown agent tools fail synchronization
requirement: The system MUST fail core synchronization when a canonical agent declares a tool without an explicit Claude mapping or approved runtime mapping, instead of copying the unknown tool name into generated frontmatter.
Given: a canonical agent includes an unmapped tool name
When: synchronization translates agent frontmatter
Then: synchronization exits unsuccessfully with the agent and tool identified, and no successful generated artifact claims parity

## Scenario: core-sync-rejects-untranslated-runtime-tokens
title: Untranslated runtime tokens fail synchronization
requirement: The system MUST fail core synchronization when canonical agent or coordinator content contains a Pi-only ein_* tool token or runtime concept without an explicit Claude adaptation rule, instead of leaving the token literal or silently treating it as inert.
Given: canonical agent or coordinator content contains an untranslated Pi-only token or runtime concept
When: synchronization translates or generates the Claude surface
Then: synchronization exits unsuccessfully with the source token and location identified, and the generated surface is not accepted as synchronized

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

## Scenario: legacy-out-of-flow-allowed
title: Allow explicitly reconciled out-of-flow legacy delivery
requirement: The system MUST allow archival of a declarationless legacy record only when an explicitly selected out-of-flow reconciliation signal and auditable reason identify the record, a fresh summary states that delivery occurred outside SDD, and concrete repository verification is fresh and passing.
Given: a change contains only its original scope artifact and is otherwise recognized as an approved declarationless legacy record
When: the caller selects the out-of-flow reconciliation path with a non-empty reason and supplies the required fresh summary and repository verification evidence
Then: the deterministic close path permits archival without inventing map, design, tasks, apply, or verify artifacts

## Scenario: legacy-out-of-flow-denied
title: Deny incomplete or ambiguous out-of-flow reconciliation
requirement: The system MUST deny out-of-flow reconciliation when the explicit signal or reason is absent, malformed, stale, non-concrete, or inferred from missing lifecycle artifacts.
Given: a record lacks the required explicit signal, auditable reason, fresh summary, or concrete repository verification
When: a caller attempts to archive it through the out-of-flow path
Then: the path fails closed and leaves the record unarchived

## Scenario: legacy-sdd-fallback
title: Legacy SDD changes retain their lifecycle
requirement: The system MUST preserve legacy lifecycle behavior when changes resolve through the .sdd fallback
Given: a project has only a .sdd changes directory with valid legacy artifacts
When: its status or close readiness is evaluated
Then: canonical spec declarations are not required and no canonical specs deltas or reports are written under .sdd

## Scenario: legacy-summary-auditability
title: Record the out-of-flow delivery claim explicitly
requirement: The system MUST require the reconciliation summary to explicitly state that delivery occurred outside SDD and to identify concrete repository verification rather than treating a generic completion claim as evidence.
Given: an approved legacy record is being reconciled after implementation outside the SDD lifecycle
When: the close path evaluates the supplied summary and verification evidence
Then: only an explicit outside-SDD statement paired with concrete current-repository evidence can satisfy the reconciliation gate

## Scenario: openspec-artifacts-excluded-from-review-budget
title: OpenSpec artifacts stay outside the review size budget
requirement: The system MUST exclude every path under the OpenSpec directory from the production line count used by the review-size forecast.
Given: a measured range contains production source changes together with changes to OpenSpec configuration and to change artifacts nested under the OpenSpec changes directory.
When: the review-size forecast measures that range.
Then: the production count reflects only the production source lines, the OpenSpec lines are counted as neither production nor tests, and identical source changes yield the same production count regardless of artifact size.

## Scenario: ordinary-close-guards-preserved
title: Preserve ordinary close readiness
requirement: The system MUST continue to require the normal close readiness guards for ordinary changes, including complete apply, fresh passing verification, fresh summary, no pending tasks, and existing synchronization, conflict, and sequence checks.
Given: a change is not an approved declarationless legacy record using the explicit out-of-flow path
When: a caller requests close or supplies an out-of-flow-like argument
Then: the standard close decision is unchanged and incomplete or out-of-sequence work is denied

## Scenario: project-state-binds-verification-to-exact-git-state
title: Verification freshness is bound to the exact Git state
requirement: The system MUST bind verification evidence to the exact Git state it inspected and MUST mark that evidence stale or invalid when a relevant code-state change is detected, rather than inheriting freshness across a changed state, session resume, or runtime switch.
Given: Verification evidence identifies an exact repository state and the relevant code or tests subsequently differ, or the evidence cannot be bound to an exact state.
When: The shared project-state projection evaluates verification freshness.
Then: The projection exposes the evidence as stale, invalid, or unavailable with the reason and exact-state mismatch, and never presents it as current solely because a session resumed or a runtime changed.

## Scenario: project-state-exposes-ambiguous-or-incomplete-sources
title: Project state exposes ambiguous and incomplete source values
requirement: The system MUST represent missing, unreadable, unavailable, ambiguous, and stale source values explicitly and MUST NOT invent an active change, phase, next step, project context, Git state, or verification result.
Given: One or more authoritative sources are absent, unreadable, malformed, or ambiguous, including multiple active OpenSpec changes without a selected change.
When: The projection resolves the project state.
Then: The affected field or source carries a distinguishable non-current status and actionable reason, while unaffected sources remain available and no guessed current value is emitted.

## Scenario: project-state-keeps-runtime-sessions-private
title: Runtime references do not expose private session history
requirement: The system MUST expose runtime capabilities, availability, errors, and references needed by future adapters without exporting, migrating, or treating private Pi or Claude conversation history as shared project state.
Given: A supported or unavailable runtime reports session capability metadata or a reference to a private session.
When: The projection includes runtime information for continuity or a future adapter.
Then: Only normalized capability and reference metadata is exposed, runtime-specific differences remain visible, and private conversation content is absent from the shared state.

## Scenario: project-state-normalizes-authoritative-sources
title: Project state normalizes authoritative sources without a competing store
requirement: The system MUST produce a deterministic shared project-state projection from the authoritative OpenSpec work state, stable EIN.md context, exact Git worktree state, verification freshness, and runtime capability references, and MUST NOT create a competing state store.
Given: A project is inspected with zero or more active OpenSpec changes, an optional EIN.md, a Git worktree or unavailable repository metadata, verification evidence, and runtime capability metadata.
When: A caller requests the shared project-state projection.
Then: The result contains source-attributed normalized values and freshness signals, preserves each source's ownership, and does not persist or claim ownership of duplicated project state or private conversation history.

## Scenario: repository-bootstrap-is-best-effort
title: Missing-repository bootstrap is bounded, opt-outable, and never fatal
requirement: The system MUST attempt repository initialization only for a working directory that is outside a repository, already holds OpenSpec change artifacts, exposes no existing repository metadata entry, and has no opt-out set, and MUST degrade to a reported notice when initialization is unavailable.
Given: SDD status is resolved in a directory that is not inside a repository, or whose repository metadata exists but cannot be read, or where initialization fails because the location is read-only, the tool is missing, or an opt-out or continuous-integration signal is set.
When: SDD status runs in that directory.
Then: initialization is attempted only under the bounded conditions, an existing metadata entry is never reinitialized, any failure is reported as an absent repository with its reason, and status completes normally with an unchanged exit code.

## Scenario: review-ledger-bounded-areas
title: Reviewed areas have bounded deterministic identity and state
requirement: The system MUST record each reviewed area with an explicit bounded boundary, deterministic granularity and review state, and MUST distinguish reviewed, unreviewed, stale, invalid, and unknown values.
Given: A future audit consumes a reviewed-area ledger containing zero or more area records.
When: The ledger is produced or read for an audit.
Then: Each record identifies its area boundary and stable identity, records a permitted review state and reason, and ambiguous or unknown boundaries or states fail closed instead of being treated as reviewed.

## Scenario: review-ledger-evidence-git-freshness
title: Review evidence is bound to fresh Git state
requirement: The system MUST bind a reviewed area to privacy-safe evidence identity and the exact relevant Git state, and MUST invalidate the reviewed state when a relevant Git change affects that area.
Given: A ledger record references review evidence for a bounded area and a Git-linked state.
When: The relevant committed, staged, tracked, or in-scope untracked content differs, or the evidence cannot be verified against an exact state.
Then: Consumers receive stale, invalid, unavailable, or unknown status with deterministic reasons and state references, and the record is not presented as current reviewed evidence.

## Scenario: review-ledger-human-review-boundary
title: Review state requires evidence and does not imply approval
requirement: The system MUST NOT declare an area reviewed merely because a session exists, an artifact is present, or an automated process completed, and MUST keep the ledger separate from human review, SDD completion, and automatic approval.
Given: A session, audit artifact, or implementation result exists without attributable review evidence satisfying the ledger contract.
When: A consumer requests the area's review state.
Then: The area remains unreviewed or unknown with a fail-closed reason, and no approval, lifecycle completion, or human-review claim is emitted.

## Scenario: review-ledger-readonly-consumption
title: Future audits consume the ledger read-only
requirement: The system MUST expose reviewed-area records for deterministic read-only audit consumption without parallel writers, cleaner or architect mutation, autonomous mutation, or scope leakage into later roadmap blocks.
Given: A future audit reads a ledger produced by the designated review workflow.
When: The audit evaluates reviewed, unreviewed, or stale areas.
Then: It receives the recorded states and privacy-safe references without rewriting ledger data, changing source or Git state, inferring approval, or performing mutations.

## Scenario: router-blocks-map-on-unresolved-spec-provenance
title: Router blocks map on unresolved or conflicting spec provenance
requirement: The system MUST prevent deterministic SDD routing from recommending map while an active canonical change has unresolved or conflicting OpenSpec provenance.
Given: A canonical change has scope.md, lacks map.md, and its existing specState is unresolved or conflict.
When: lifecycle status or sdd-next is resolved.
Then: Routing reports a spec provenance blocker and does not recommend map; pending and synchronized spec states remain eligible to recommend map when no earlier phase gate blocks.

## Scenario: runtime-adapter-normalized-surface
title: Runtime adapters expose one project-scoped session surface
requirement: The system MUST expose Pi and Claude adapters through one normalized read/launch surface for listing recent project-scoped sessions, creating a new runtime-session request, resuming an existing same-runtime session, and launching the selected runtime, with each result identifying its provider, operation capability, and the ProjectStateV1 identity used.
Given: A caller supplies a selected project and its verified ProjectStateV1 boundary to a supported runtime adapter.
When: The caller requests a session read, create, resume, or launch operation.
Then: The adapter returns the common operation shape with provider-scoped normalized data or an explicit unavailable/error result, and does not compute or persist a competing project-state representation.

## Scenario: runtime-adapter-pi-project-scope
title: Pi listing reads bounded JSONL metadata for the selected project
requirement: The system MUST list Pi sessions for the selected project by reading only bounded first-line session metadata from the existing isolated Pi session JSONL layout, matching the selected project identity, and MUST NOT read transcript content or expose private session paths.
Given: The isolated Pi session directory contains recent JSONL files whose first line may identify a session id and working directory.
When: The Pi adapter lists recent sessions for a ProjectStateV1-selected project.
Then: Only valid metadata for that project is normalized into opaque resume references ordered by recency; malformed, unreadable, missing-scope, or out-of-project entries are omitted or reported as an explicit unavailable condition without guessing another project.

## Scenario: runtime-adapter-private-history
title: Runtime-private histories remain private across adapters
requirement: The system MUST keep Pi and Claude conversation histories private to their originating runtime and MUST NOT export, migrate, merge, or persist transcripts or messages in the normalized adapter surface.
Given: A session is created, listed, resumed, or handed off between runtime adapters with normalized project state available.
When: The adapter emits session metadata or a runtime handoff result.
Then: Only provider-scoped opaque references, capabilities, errors, and normalized ProjectStateV1 identity are exposed; no transcript, prompt, message, private path, shared session store, or false cross-runtime continuity appears.

## Scenario: runtime-adapter-safe-isolated-launch
title: Runtime launch reuses isolated mechanisms without shell injection
requirement: The system MUST launch Pi or Claude through fixed executable arguments, selected working-directory, and the runtime's existing isolated environment contract, MUST NOT interpolate caller input into a shell command, and MUST NOT install, update, or rewrite runtime-owned launcher state.
Given: A normalized create or resume request has passed provider, project, and capability validation.
When: The adapter prepares or executes the runtime launch.
Then: Pi uses the existing isolated Pi environment and Claude uses the existing isolated Claude configuration environment, with no shell-evaluated command string, installer ownership change, shared persistence write, or parallel writer.

## Scenario: runtime-adapter-same-runtime-resume
title: Resume is bound to the same runtime and project state
requirement: The system MUST allow a resume request only for an opaque session reference issued by the same runtime adapter and matching the selected project identity, and MUST carry the ProjectStateV1 state identity used for the request without migrating or refreshing private history.
Given: A caller asks to resume a session reference while selecting a runtime and project state.
When: The adapter validates and prepares the resume operation.
Then: A same-runtime, project-scoped reference yields a bounded resume request carrying the selected state identity; a cross-runtime reference, mismatched project, ambiguous or unavailable project state, or unverifiable session reference fails closed with a normalized reason.

## Scenario: runtime-adapter-unsupported-fails-closed
title: Unsupported runtime operations remain explicit
requirement: The system MUST report an operation as unavailable or unsupported when Pi or Claude cannot provide an equivalent safe capability, and MUST NOT fabricate session metadata, resume semantics, launch flags, or cross-runtime equivalence.
Given: A provider lacks a verified implementation for one of list, create, resume, or launch, or its isolated runtime mechanism is unavailable.
When: The normalized adapter surface receives that operation request.
Then: The result is an explicit provider-scoped unsupported or unavailable error with deterministic diagnostics, no partial session mutation, and no success result that hides the capability difference.

## Scenario: scope-retry-preserves-valid-delta
title: Scope retries preserve valid persisted deltas
requirement: The system MUST preserve a valid persisted OpenSpec delta as the authoritative declaration when sdd-scope is retried, instead of writing a contradictory declaration or delta.
Given: An active canonical OpenSpec change already contains a delta that passes existing delta validation and its scope phase is retried.
When: sdd-scope resumes or re-evaluates the change.
Then: The validated persisted delta remains unchanged and authoritative, no contradictory spec_delta: none declaration is introduced, and the scope contract remains resumable.

## Scenario: shared-config-advisor-consistent-surfaces
title: Relevant surfaces consume one advisor contract
requirement: The system MUST expose configuration and update advice consistently across relevant existing surfaces by consuming one shared contract rather than duplicating authority.
Given: The launcher or another existing supported surface requests the same project configuration/update status.
When: Each surface renders the result.
Then: Equivalent inputs produce equivalent state, recommendation, ownership, and uncertainty semantics, while surface-specific presentation does not add updater behavior or move installer logic into the launcher.

## Scenario: shared-config-advisor-fails-closed-on-ambiguity
title: Advisor preserves ambiguity and errors
requirement: The system MUST represent missing, unreadable, unsupported, conflicting, and ambiguous configuration or update information explicitly and MUST NOT infer a safe action from incomplete evidence.
Given: A configuration source, version/update signal, or installer capability cannot be read or yields conflicting values.
When: Advice is computed or rendered.
Then: The result is a deterministic unavailable, invalid, unsupported, or ambiguous state with an actionable reason, and no update or configuration mutation occurs.

## Scenario: shared-config-advisor-normalizes-readonly-state
title: Shared advisor normalizes configuration and update state read-only
requirement: The system MUST expose deterministic, source-attributed configuration and update state and recommendations without mutating configuration, installer state, or update state.
Given: A supported project and runtime configuration may be complete, incomplete, unavailable, or ambiguous, and installer-owned update capabilities may or may not be available.
When: A participating surface requests configuration or update advice.
Then: The surface receives the same normalized state and recommendation, with explicit quality and reason fields for uncertain values, and no installation or update operation is executed.

## Scenario: shared-config-advisor-separates-advice-from-action
title: Advisor separates recommendation from installer action
requirement: The system MUST distinguish read-only advice from an installation or update action and MUST identify the installer as the owner of any such action.
Given: The advisor determines that configuration is incomplete, incompatible, or eligible for an update.
When: The recommendation is presented to a user or consumer surface.
Then: The output explains the observed state and the recommended installer-owned next step, but does not claim that the action was requested, started, completed, or performed automatically.

## Scenario: verify-deduplicates-final-focused-commands
title: Verify runs one final focused command per behavior seam
requirement: The system MUST deduplicate identical final focused verification commands before execution while retaining one final focused command for each distinct behavior seam and preserving its independent evidence.
Given: Strict TDD apply evidence names focused commands for one or more behavior seams, and the independent verify phase receives those commands among its relevant checks.
When: sdd-verify builds its final command plan.
Then: Each identical command is scheduled and executed at most once, each distinct behavior seam retains one final focused command, and the resulting evidence identifies the command and seam without relying on apply results.

## Scenario: verify-preserves-fresh-independent-evidence
title: Verify reruns commands without result caching
requirement: The system MUST execute the deduplicated verification plan freshly in each sdd-verify run and MUST NOT reuse cross-run results, timestamps, file hashes, or cached command outcomes as behavioral evidence.
Given: A prior apply or verify run recorded a passing command whose exact command may also appear in the current verification plan.
When: sdd-verify assesses the current working tree and close readiness.
Then: The current verify run starts fresh execution for every scheduled command, records independent current evidence, and does not treat prior results or cache metadata as a substitute.

## Scenario: verify-retains-tdd-audit-and-close-gate
title: Command deduplication does not weaken TDD or close gates
requirement: The system MUST preserve strict-TDD evidence auditing and the independent fresh sdd-verify close gate when deduplicating commands.
Given: strict_tdd is active and an apply artifact claims RED, GREEN, TRIANGULATE, and REFACTOR evidence for the assigned focused tests.
When: sdd-verify audits the change and the lifecycle evaluates close readiness.
Then: Verify still audits the TDD evidence and behavioral coverage, close still requires a fresh passing verify report, and deduplication never bypasses a required check or permits stale evidence.

## Scenario: verify-runs-global-checks-once
title: Verify executes relevant global checks once
requirement: The system MUST execute each relevant global verification check once in sdd-verify and MUST keep production-build checks out of the sdd-apply focused-test loop.
Given: A change has strict-TDD focused-test evidence and the verification plan includes relevant global checks such as typechecking, linting, a full suite, or a production build.
When: The SDD lifecycle executes apply and then independent sdd-verify.
Then: Apply runs only its bounded focused checks, while verify schedules and executes each relevant global check once without weakening any required close check.

## Scenario: workbench-launcher-capability-aware-sessions
title: Workbench offers only provider-supported session actions
requirement: The system MUST list recent sessions through the selected provider adapter, request a new session, or offer resume only when that adapter advertises and validates resume support, while presenting unsupported or unavailable operations explicitly and never fabricating session metadata or cross-runtime continuity.
Given: A confirmed ProjectStateV1 and provider adapter expose an evidence-based capability matrix, including provider-specific unsupported operations from the runtime adapter contract.
When: The user chooses session management for Pi or Claude.
Then: The workbench shows bounded provider-supported recent-session metadata, can request a new session, offers only a validated supported resume reference, and renders deterministic unsupported or unavailable diagnostics without exposing private transcript content or paths.

## Scenario: workbench-launcher-compact-doctor
title: Workbench exposes read-only compact doctor access
requirement: The system MUST expose a compact doctor action that delegates to the existing read-only doctor surface and MUST NOT move installation, update, repair, or release logic into the separate workbench.
Given: The user is in the minimal workbench with a selected project or runtime context.
When: The user requests doctor access.
Then: The workbench presents the existing doctor result or a bounded actionable unavailable diagnostic, returns to the workbench flow, and does not mutate installer-owned state.

## Scenario: workbench-launcher-project-runtime-flow
title: Workbench confirms a project and supported runtime before orchestration
requirement: The system MUST provide one separate workbench entrypoint that requires selecting and confirming a project, selecting Pi or Claude, and consuming the confirmed ProjectStateV1 for all displayed and requested operations without becoming a second project-state owner.
Given: A user starts the minimal workbench in a directory with zero or more discoverable project candidates and the existing ProjectStateV1 projector is available.
When: The user selects and confirms a project and a supported runtime.
Then: The workbench binds the flow to that project and runtime, presents the selected identity, and does not enter session actions until the confirmation is complete.

## Scenario: workbench-launcher-safe-runtime-launch
title: Workbench launches only through the safe adapter boundary
requirement: The system MUST launch the selected runtime only through the runtime adapter's validated state-bound launch plan and non-shell executor, and MUST NOT accept caller-controlled command strings, migrate private history, write shared session state, or assume installer or updater ownership.
Given: The user has selected a confirmed project, provider, and either a new-session request or a supported resume request.
When: The user confirms launch.
Then: The workbench delegates the request to the adapter with the selected ProjectStateV1 identity, reports the normalized outcome, and leaves installer files, update state, shared project state, and private runtime histories unchanged.

## Scenario: workbench-launcher-state-freshness
title: Workbench presents OpenSpec progress and verification freshness honestly
requirement: The system MUST show the selected project's active OpenSpec phase and next step together with source quality and verification freshness, and MUST visibly distinguish incomplete, ambiguous, unavailable, stale, invalid, and current values without promoting stale evidence to current.
Given: The selected ProjectStateV1 contains active or absent OpenSpec work and may contain incomplete sources or verification evidence that is stale, invalid, unavailable, or current.
When: The workbench renders the project summary before session orchestration.
Then: The rendered summary preserves the projector's state and reason values, shows the active phase and next step when known, and labels unknown or stale evidence instead of guessing or inheriting freshness from a runtime switch or resume.

## Scenario: working-tree-signal-single-channel
title: Repository and working-tree state is reported through one channel
requirement: The system MUST report repository presence and working-tree cleanliness through the SDD status output as the single channel and MUST NOT duplicate that report in the permission-decision envelope or in the harness deployment step.
Given: the working directory has uncommitted changes while the coordinator resolves SDD status between phases.
When: SDD status output is produced.
Then: it carries exactly one working-tree block naming the uncommitted state and its stash or commit remedy, no other harness surface repeats that signal, and phase routing and the exit code are unaffected.
