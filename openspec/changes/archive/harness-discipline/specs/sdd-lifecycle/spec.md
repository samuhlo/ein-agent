# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED

### Scenario: guard-allowlist-flag-inspection
title: Allowlist promotion inspects flags, including bundled short options
requirement: The system MUST refuse allowlist promotion for an otherwise safe git subcommand that carries a mutating, history-rewriting, or interactive flag, and MUST detect such flags when they are bundled into a single short-option token.
Given: a shell command invokes an allowlisted git subcommand with flags such as branch deletion, branch renaming, commit amendment, hook bypass, or an interactive or editor-opening mode, expressed as long flags, separate short flags, or one bundled short-option token.
When: the harness guard evaluates the command for allowlist promotion.
Then: the command is not promoted to allow, while the listing, inspection, and creation forms of the same subcommands remain promotable, and the denial and confirmation tables are unchanged by the allowlist.

### Scenario: guard-allowlist-whole-command
title: Allowlist promotion requires the whole command to be safe
requirement: The system MUST promote a shell command to allow only when every operator-separated segment is an allowlisted git subcommand with clean flags and the command contains no command substitution or redirection.
Given: a shell command that combines an allowlisted git subcommand with another segment, a substitution, or a redirection.
When: the harness guard evaluates the command.
Then: promotion is withheld unless every segment is itself allowlisted and metacharacter-free, and a withheld promotion yields no decision so the host permission flow stays in control rather than a weaker decision being emitted.

### Scenario: guard-decision-precedence
title: The allowlist can never shadow a denial or a confirmation
requirement: The system MUST evaluate denied patterns first, confirmation-required patterns second, and allowlist promotion only third, so that an allowlist match never approves a command that also matches a denied or confirmation-required pattern.
Given: a shell command whose text matches both an allowlisted git subcommand and a denied or confirmation-required pattern.
When: the harness guard resolves a permission decision for that command.
Then: the decision is deny or ask according to the pattern that matched, never allow, regardless of the order in which the matching fragments appear in the command.

### Scenario: guard-envelope-degrades-open
title: The guard degrades open on unusable hook input
requirement: The system MUST emit at most one permission decision per guard invocation, MUST complete successfully when the hook payload is absent, unparseable, or missing its command field, and MUST NOT emit output fields it has not verified against the host.
Given: the guard receives invalid JSON, an empty object, or a payload without a command field.
When: the guard runs as the pre-tool-use hook.
Then: it writes no decision, exits successfully, relies on the independent host-level denial rules as the remaining protection, and never introduces a second output channel alongside the permission decision.

### Scenario: guard-ignores-cross-harness-delivery-grants
title: Delivery grants do not cross harness boundaries
requirement: The system MUST NOT consume the Pi delivery-grant file when resolving Claude Code guard decisions, so a grant minted by one harness cannot silently suppress a confirmation in the other.
Given: a delivery grant file exists for the current working directory because a Pi session minted it, and a guarded delivery command is attempted from the Claude Code harness.
When: the harness guard evaluates that command.
Then: the grant is neither read nor consumed, the command still resolves to ask, and confirmation is obtained through the host's own permission prompt.

### Scenario: guard-sdd-state-is-advisory
title: SDD state informs guard reasons but never creates a decision
requirement: The system MUST derive guard decisions from command policy alone and MAY attach current SDD change state only to a decision it has already taken.
Given: a shell command is evaluated while no active change exists under the OpenSpec changes directory.
When: the harness guard resolves the permission decision.
Then: the decision is exactly what the command-policy layers produced with no additional confirmation introduced by the absent change, and any SDD state text appears only inside an already-emitted deny or ask reason.

### Scenario: openspec-artifacts-excluded-from-review-budget
title: OpenSpec artifacts stay outside the review size budget
requirement: The system MUST exclude every path under the OpenSpec directory from the production line count used by the review-size forecast.
Given: a measured range contains production source changes together with changes to OpenSpec configuration and to change artifacts nested under the OpenSpec changes directory.
When: the review-size forecast measures that range.
Then: the production count reflects only the production source lines, the OpenSpec lines are counted as neither production nor tests, and identical source changes yield the same production count regardless of artifact size.

### Scenario: repository-bootstrap-is-best-effort
title: Missing-repository bootstrap is bounded, opt-outable, and never fatal
requirement: The system MUST attempt repository initialization only for a working directory that is outside a repository, already holds OpenSpec change artifacts, exposes no existing repository metadata entry, and has no opt-out set, and MUST degrade to a reported notice when initialization is unavailable.
Given: SDD status is resolved in a directory that is not inside a repository, or whose repository metadata exists but cannot be read, or where initialization fails because the location is read-only, the tool is missing, or an opt-out or continuous-integration signal is set.
When: SDD status runs in that directory.
Then: initialization is attempted only under the bounded conditions, an existing metadata entry is never reinitialized, any failure is reported as an absent repository with its reason, and status completes normally with an unchanged exit code.

### Scenario: working-tree-signal-single-channel
title: Repository and working-tree state is reported through one channel
requirement: The system MUST report repository presence and working-tree cleanliness through the SDD status output as the single channel and MUST NOT duplicate that report in the permission-decision envelope or in the harness deployment step.
Given: the working directory has uncommitted changes while the coordinator resolves SDD status between phases.
When: SDD status output is produced.
Then: it carries exactly one working-tree block naming the uncommitted state and its stash or commit remedy, no other harness surface repeats that signal, and phase routing and the exit code are unaffected.
