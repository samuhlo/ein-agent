# OpenSpec Specification
format: openspec-spec/v1
domain: sdd-session-binding

## Scenario: continue-new-propagates-change-intent
title: Continue-as-new propagates change intent
requirement: The system MUST propagate the explicitly continued change through the terminal launcher and runtime launch path into the newly created Pi session.
Given: The dashboard has a focused active change and the user chooses continue-as-new.
When: The terminal app creates and launches the new Pi provider session.
Then: The new session starts bound to that explicit change and the TODO widget reflects it immediately.

## Scenario: explicit-selection-repaints-immediately
title: Explicit selection repaints immediately
requirement: The system MUST bind an explicitly selected, created, or continued change to the current Pi session and repaint the TODO widget immediately.
Given: An interactive Pi session is unbound or bound to another change.
When: The user explicitly selects, creates, or continues a valid active OpenSpec change.
Then: The session records the selected change and the widget immediately shows TODO for that change without waiting for a turn or tool completion.

## Scenario: fresh-session-remains-unbound
title: Fresh session remains unbound
requirement: The system MUST leave a fresh Pi UI session without a bound change even when the filesystem contains exactly one active OpenSpec change.
Given: The project contains one active OpenSpec change and Pi creates a fresh session without explicit change intent.
When: The SDD overlay starts for that session.
Then: The TODO widget is cleared and no filesystem-only change is adopted.

## Scenario: invalid-session-binding-clears-widget
title: Invalid session binding clears widget
requirement: The system MUST fail closed when a Pi session binding refers to a missing, stale, closed, or invalid OpenSpec change.
Given: The current Pi session contains a saved change binding that is no longer a valid active change for the project.
When: The overlay restores or refreshes the session binding.
Then: The binding is treated as unbound and the TODO widget is cleared.

## Scenario: non-ui-selection-semantics-preserved
title: Non-UI selection semantics are preserved
requirement: The system MUST preserve deterministic filesystem-based OpenSpec selection semantics for CLI and non-UI tools.
Given: A non-UI consumer resolves the active OpenSpec change from project state.
When: The session-bound UI selection behavior is introduced.
Then: The existing explicit and sole-active-change resolution behavior remains unchanged for that non-UI consumer.

## Scenario: resumed-session-restores-binding
title: Resumed session restores binding
requirement: The system MUST restore the change binding saved in a resumed Pi session without leaking bindings across sessions.
Given: One Pi session saved a valid active change binding and another session has a different binding or none.
When: The first session is resumed by its Pi session identifier.
Then: Only its own saved binding is restored and its TODO widget immediately reflects that change.
