# Delta for launcher-update-surface

## ADDED Requirements

### Requirement: Terminal app executes confirmed allowlisted updates

The terminal application MAY execute an update command only when the update probe identifies a supported component, the evidence is actionable, the command belongs to the application's closed allowlist, and the user explicitly confirms it. Unsupported, uncertain, stale, or incomplete update evidence MUST remain informational and non-actionable. The existing launcher surface MUST continue to print handoff commands without executing them.

#### Scenario: Actionable update requires confirmation

- GIVEN a supported component has fresh actionable update evidence
- WHEN the user activates its update row once
- THEN the app names the exact allowlisted command and launches nothing

#### Scenario: Confirmed update is handed off

- GIVEN the app is awaiting confirmation for a supported allowlisted command
- WHEN the user confirms
- THEN the terminal is handed to that exact command and no other command is executed

#### Scenario: Uncertain update cannot be executed

- GIVEN update evidence is stale, incomplete, unavailable, or for an unsupported component
- WHEN the system view renders or the row is activated
- THEN it reports the state as informational and provides no executable action

## MODIFIED Requirements

### Requirement: Launcher prints the command; does not execute it

The launcher surface MUST print the exact handoff command without launching the installer, executing a subprocess, or automatically applying the update; the user explicitly chooses to run the command if they wish. This non-execution rule applies to the launcher surface and does not prohibit the terminal application's separate, explicitly confirmed allowlisted handoff.
(Previously: The non-execution requirement did not distinguish the launcher surface from the terminal application's confirmed handoff.)

#### Scenario: Launcher handoff remains inert

- GIVEN a valid installer handoff exists
- WHEN the launcher prints the command to the user
- THEN no subprocess is spawned and the handoff remains unperformed
