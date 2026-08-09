# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: project-state-binds-verification-to-exact-git-state
title: Verification freshness is bound to the exact Git state
requirement: The system MUST bind verification evidence to the exact Git state it inspected and MUST mark that evidence stale or invalid when a relevant code-state change is detected, rather than inheriting freshness across a changed state, session resume, or runtime switch.
Given: Verification evidence identifies an exact repository state and the relevant code or tests subsequently differ, or the evidence cannot be bound to an exact state.
When: The shared project-state projection evaluates verification freshness.
Then: The projection exposes the evidence as stale, invalid, or unavailable with the reason and exact-state mismatch, and never presents it as current solely because a session resumed or a runtime changed.

### Scenario: project-state-exposes-ambiguous-or-incomplete-sources
title: Project state exposes ambiguous and incomplete source values
requirement: The system MUST represent missing, unreadable, unavailable, ambiguous, and stale source values explicitly and MUST NOT invent an active change, phase, next step, project context, Git state, or verification result.
Given: One or more authoritative sources are absent, unreadable, malformed, or ambiguous, including multiple active OpenSpec changes without a selected change.
When: The projection resolves the project state.
Then: The affected field or source carries a distinguishable non-current status and actionable reason, while unaffected sources remain available and no guessed current value is emitted.

### Scenario: project-state-keeps-runtime-sessions-private
title: Runtime references do not expose private session history
requirement: The system MUST expose runtime capabilities, availability, errors, and references needed by future adapters without exporting, migrating, or treating private Pi or Claude conversation history as shared project state.
Given: A supported or unavailable runtime reports session capability metadata or a reference to a private session.
When: The projection includes runtime information for continuity or a future adapter.
Then: Only normalized capability and reference metadata is exposed, runtime-specific differences remain visible, and private conversation content is absent from the shared state.

### Scenario: project-state-normalizes-authoritative-sources
title: Project state normalizes authoritative sources without a competing store
requirement: The system MUST produce a deterministic shared project-state projection from the authoritative OpenSpec work state, stable EIN.md context, exact Git worktree state, verification freshness, and runtime capability references, and MUST NOT create a competing state store.
Given: A project is inspected with zero or more active OpenSpec changes, an optional EIN.md, a Git worktree or unavailable repository metadata, verification evidence, and runtime capability metadata.
When: A caller requests the shared project-state projection.
Then: The result contains source-attributed normalized values and freshness signals, preserves each source's ownership, and does not persist or claim ownership of duplicated project state or private conversation history.
