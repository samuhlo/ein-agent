# Terminal App Experience Specification

## Purpose

Make the terminal application an actionable, navigable, and readable project dashboard.

## Requirements

### Requirement: Provide actionable project navigation

The system MUST show the project, branch, uncommitted changes, active SDD change, phase, next step, blockers, and open changes. Selecting an open change MUST focus it and recalculate its phase. Every selectable row MUST have an action; non-actionable rows MUST NOT be selectable.

#### Scenario: Open change is focused

- GIVEN the dashboard lists an open SDD change
- WHEN the user selects it and presses `enter`
- THEN the application focuses that change and refreshes its phase and next step

#### Scenario: Long status value remains accessible

- GIVEN a status value is truncated to fit the terminal width
- WHEN the user activates its row
- THEN the complete value is exposed in the status area

### Requirement: Handoff runtimes and system commands safely

The system MUST use one terminal handoff for creating or resuming runtimes and for executing system commands. System commands MUST come from a closed allowlist and require explicit confirmation before execution. Missing runtime executables MUST produce an actionable runtime-specific message without silently closing the application.

#### Scenario: First confirmation does not execute

- GIVEN an allowlisted update is available
- WHEN the user presses `enter` once
- THEN the application names the literal command and starts no process

#### Scenario: Confirmation cancellation is safe

- GIVEN command confirmation is pending
- WHEN the user presses any non-confirmation key
- THEN the pending action is discarded and no process starts

### Requirement: Render a branded responsive interface

The system MUST provide a branded dashboard with visible selection, contextual shortcuts, view orientation, and a return-to-dashboard action. The sessions view MUST be the single combined runtime session view; a duplicate runtime list MUST NOT be presented.

#### Scenario: View orientation is persistent

- GIVEN the user opens a non-dashboard view
- WHEN the view renders
- THEN it identifies the current view, lists that view's valid shortcuts, and supports `esc` to return

### Requirement: Degrade honestly across terminal environments

The system MUST emit ANSI styling only for an interactive color-capable terminal. With `NO_COLOR`, a non-TTY destination, or `--once`, output MUST contain no escape sequences. Narrow terminals MUST remain legible without uncontrolled line wrapping.

#### Scenario: Colorless output contains no escapes

- GIVEN `NO_COLOR` is set or output is non-TTY
- WHEN any view is rendered
- THEN no ANSI escape sequence is emitted
