# OpenSpec Specification
format: openspec-spec/v1
domain: launcher-update-surface

## Scenario: ausencia-silencio-declarado
title: No update produces honest silence, not confusion
requirement: The system MUST NOT print an empty or ambiguous message when no update is available or evidence did not arrive; absence of update MUST result in silence or a brief honest statement, never a false "all current" message.
Given: Given: No update is available for a component, or the evidence failed to arrive within the timeout.
When: When: The launcher renders the update notice.
Then: Then: That component is either omitted from the output or labeled "no update available" / "not verified", without suggesting that the state is known to be current.

## Scenario: aviso-accionable-con-componente-y-comando
title: Launcher prints exact component and command when update is available
requirement: The system MUST display the exact component name (Ein, Pi binary, Pi packages, or Claude Code) and the command to execute (e.g., `ein update`) when an update is available with a valid installer handoff, and MUST NOT present vague or ambiguous text.
Given: Given: The launcher has detected an available update for one or more components with a valid handoff (owner=installer, action=update, performed=false).
When: When: The launcher renders the update notice after confirming the project and before runtime selection.
Then: Then: The output identifies each component by name and prints the exact command to apply the update, in a format distinct from diagnostics or errors.

## Scenario: claude-code-informativo-no-accionable
title: Claude Code updates are informative, not actionable via installer handoff
requirement: The system MUST detect and display Claude Code updates when available, but MUST NOT produce an installer handoff for Claude Code; Claude Code is external to the installer (F-007), so only print the version information without an actionable command.
Given: Given: Claude Code is installed locally and a newer release is available, or Claude Code is not installed.
When: When: The launcher checks for updates and Claude Code evidence arrives.
Then: Then: If available, the launcher prints "Claude Code: version X → Y available" or similar. No installer handoff is constructed (it would be F-007 unsupported). The user sees informational status but no one-click update command for Claude Code.

## Scenario: evidencia-stale-no-accionable
title: Stale or incomplete evidence is never presented as actionable
requirement: The system MUST NOT present an update as actionable if its evidence is obsolete (older than a threshold), expired, or incomplete; stale evidence MUST be declared or silenced, never hidden.
Given: Given: A probe returned evidence marked stale (freshness=stale) or unknown (freshness=unknown), or a probe timed out and failed-open.
When: When: The launcher renders the update notice for that component.
Then: Then: If the evidence is stale, the output declares the age or incompleteness (e.g., "Verified 5 minutes ago" or "Information unavailable"). No actionable command is printed; the user cannot mistakenly act on uncertain data.

## Scenario: launcher-no-ejecuta-accion
title: Launcher prints the command; does not execute it
requirement: The system MUST print the exact handoff command without launching the installer, executing a subprocess, or automatically applying the update; the user explicitly chooses to run the command if they wish.
Given: Given: A valid installer handoff exists (performed=false, owner=installer, actionId coherent).
When: When: The launcher prints the command to the user.
Then: Then: The handoff remains inerte with performed=false. No subprocess is spawned, no process is invoked, no callback is executed. The boundary between launcher and installer is explicit and auditable.

## Scenario: paridad-pi-claude-o-diferencia-declarada
title: Pi and Claude produce equivalent output or declare explicit differences
requirement: The system MUST produce identical observable behavior when the same update status is detected from Pi and Claude, OR MUST explicitly declare each runtime-specific difference at the output boundary without silently changing the contract.
Given: Given: The launcher is invoked from Pi and Claude with the same project and runtime context.
When: When: Both runtimes execute the update detection and rendering logic.
Then: Then: The output is semantically identical (same components, same commands, same honesty about evidence), or differences are declared in the output (e.g., "Pi packages not verifiable in Claude" is printed explicitly, not hidden). No silent semantic drift between runtimes.
