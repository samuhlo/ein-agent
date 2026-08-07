# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: runtime-adapter-normalized-surface
title: Runtime adapters expose one project-scoped session surface
requirement: The system MUST expose Pi and Claude adapters through one normalized read/launch surface for listing recent project-scoped sessions, creating a new runtime-session request, resuming an existing same-runtime session, and launching the selected runtime, with each result identifying its provider, operation capability, and the ProjectStateV1 identity used.
Given: A caller supplies a selected project and its verified ProjectStateV1 boundary to a supported runtime adapter.
When: The caller requests a session read, create, resume, or launch operation.
Then: The adapter returns the common operation shape with provider-scoped normalized data or an explicit unavailable/error result, and does not compute or persist a competing project-state representation.

### Scenario: runtime-adapter-pi-project-scope
title: Pi listing reads bounded JSONL metadata for the selected project
requirement: The system MUST list Pi sessions for the selected project by reading only bounded first-line session metadata from the existing isolated Pi session JSONL layout, matching the selected project identity, and MUST NOT read transcript content or expose private session paths.
Given: The isolated Pi session directory contains recent JSONL files whose first line may identify a session id and working directory.
When: The Pi adapter lists recent sessions for a ProjectStateV1-selected project.
Then: Only valid metadata for that project is normalized into opaque resume references ordered by recency; malformed, unreadable, missing-scope, or out-of-project entries are omitted or reported as an explicit unavailable condition without guessing another project.

### Scenario: runtime-adapter-private-history
title: Runtime-private histories remain private across adapters
requirement: The system MUST keep Pi and Claude conversation histories private to their originating runtime and MUST NOT export, migrate, merge, or persist transcripts or messages in the normalized adapter surface.
Given: A session is created, listed, resumed, or handed off between runtime adapters with normalized project state available.
When: The adapter emits session metadata or a runtime handoff result.
Then: Only provider-scoped opaque references, capabilities, errors, and normalized ProjectStateV1 identity are exposed; no transcript, prompt, message, private path, shared session store, or false cross-runtime continuity appears.

### Scenario: runtime-adapter-safe-isolated-launch
title: Runtime launch reuses isolated mechanisms without shell injection
requirement: The system MUST launch Pi or Claude through fixed executable arguments, selected working-directory, and the runtime's existing isolated environment contract, MUST NOT interpolate caller input into a shell command, and MUST NOT install, update, or rewrite runtime-owned launcher state.
Given: A normalized create or resume request has passed provider, project, and capability validation.
When: The adapter prepares or executes the runtime launch.
Then: Pi uses the existing isolated Pi environment and Claude uses the existing isolated Claude configuration environment, with no shell-evaluated command string, installer ownership change, shared persistence write, or parallel writer.

### Scenario: runtime-adapter-same-runtime-resume
title: Resume is bound to the same runtime and project state
requirement: The system MUST allow a resume request only for an opaque session reference issued by the same runtime adapter and matching the selected project identity, and MUST carry the ProjectStateV1 state identity used for the request without migrating or refreshing private history.
Given: A caller asks to resume a session reference while selecting a runtime and project state.
When: The adapter validates and prepares the resume operation.
Then: A same-runtime, project-scoped reference yields a bounded resume request carrying the selected state identity; a cross-runtime reference, mismatched project, ambiguous or unavailable project state, or unverifiable session reference fails closed with a normalized reason.

### Scenario: runtime-adapter-unsupported-fails-closed
title: Unsupported runtime operations remain explicit
requirement: The system MUST report an operation as unavailable or unsupported when Pi or Claude cannot provide an equivalent safe capability, and MUST NOT fabricate session metadata, resume semantics, launch flags, or cross-runtime equivalence.
Given: A provider lacks a verified implementation for one of list, create, resume, or launch, or its isolated runtime mechanism is unavailable.
When: The normalized adapter surface receives that operation request.
Then: The result is an explicit provider-scoped unsupported or unavailable error with deterministic diagnostics, no partial session mutation, and no success result that hides the capability difference.
