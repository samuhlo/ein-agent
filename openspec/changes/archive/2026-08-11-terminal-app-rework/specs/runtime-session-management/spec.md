# Runtime Session Management Specification

## Purpose

Provide one safe, project-scoped session surface for Pi and Claude Code.

## Requirements

### Requirement: Discover and summarize project sessions

The system MUST discover Pi and Claude Code sessions for the current project using bounded reads. Claude Code membership MUST be determined from transcript content, including its `cwd`, rather than relying solely on encoded directory names. Summaries MUST include runtime, recency, and the latest human phrase when available.

#### Scenario: Mixed sessions are ordered by recency

- GIVEN both runtimes have readable sessions for the project
- WHEN the unified session list is requested
- THEN sessions from both runtimes appear together, ordered newest first, with runtime and age

#### Scenario: Colliding encoded directories do not cross-contaminate

- GIVEN two project paths share the same lossy Claude directory encoding
- WHEN sessions are listed for one project
- THEN only transcripts whose content identifies that exact project are returned

#### Scenario: Unreadable storage is explicit

- GIVEN a runtime store is missing or unreadable
- WHEN the unified list is requested
- THEN that runtime is reported unavailable and is not presented as having zero sessions

### Requirement: Resolve opaque references for resume

The system MUST resume a session by rescanning the bounded project store and matching the opaque reference to its private session identifier. Private identifiers MUST NOT cross the public adapter result boundary. A missing match MUST return `reference-not-found` without creating a launch plan.

#### Scenario: Pi and Claude references resume

- GIVEN a valid opaque reference identifies a live project session
- WHEN resume is requested for the matching provider
- THEN the result is successful and contains a provider-specific resume launch intent

#### Scenario: Provider mismatch is rejected

- GIVEN a Claude reference is submitted to the Pi adapter
- WHEN resume is requested
- THEN the adapter returns `provider-mismatch` and launches nothing

### Requirement: Validate provider launch arguments

The system MUST accept only the exact create and resume argument shapes for each provider, with UUID-only variability in resume arguments. Process execution MUST keep `shell` disabled and reject any other argument shape before spawning.

#### Scenario: Fabricated arguments are rejected

- GIVEN a launch plan contains an invalid UUID or an extra argument
- WHEN execution is requested
- THEN it returns `invalid-request` and starts no process

### Requirement: Read human turns across transcript formats

The system MUST recognize Pi array content and Claude string content, while excluding tool results, sidechain turns, and assistant messages from the latest human phrase.

#### Scenario: Tool output is not summarized as human text

- GIVEN the latest user record contains only a tool result
- WHEN the transcript is summarized
- THEN the prior real human phrase is returned, or no phrase is returned when none exists
