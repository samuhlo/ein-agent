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
requirement: The system MUST make the launcher surface print the exact handoff command without launching the installer, executing a subprocess, or automatically applying the update; the user explicitly chooses to run the command if they wish. This non-execution rule applies to the launcher surface and does not prohibit the terminal application's separate, explicitly confirmed allowlisted handoff.
Given: Given: A valid installer handoff exists (performed=false, owner=installer, actionId coherent).
When: When: The launcher prints the command to the user.
Then: Then: The handoff remains inerte with performed=false. No subprocess is spawned, no process is invoked, no callback is executed. The boundary between launcher and installer is explicit and auditable.

## Scenario: paridad-pi-claude-o-diferencia-declarada
title: Pi and Claude produce equivalent output or declare explicit differences
requirement: The system MUST produce identical observable behavior when the same update status is detected from Pi and Claude, OR MUST explicitly declare each runtime-specific difference at the output boundary without silently changing the contract.
Given: Given: The launcher is invoked from Pi and Claude with the same project and runtime context.
When: When: Both runtimes execute the update detection and rendering logic.
Then: Then: The output is semantically identical (same components, same commands, same honesty about evidence), or differences are declared in the output (e.g., "Pi packages not verifiable in Claude" is printed explicitly, not hidden). No silent semantic drift between runtimes.

## Scenario: pi-session-banner-version-prefix
title: Pi session banner renders one version prefix
requirement: The system MUST render exactly one v prefix for concrete Ein and Pi SemVer values in the Pi session banner whether the source values are bare or prefixed, and MUST leave non-version labels such as dev unprefixed.
Given: The Pi session banner receives installed Ein and Pi version labels.
When: It composes the version plate beside the brand.
Then: The plate reads ein v<version> and pi v<version> with no doubled vv prefix.

## Scenario: terminal-app-confirmed-update-handoff
title: Confirmed terminal update is handed off
requirement: The system MAY make the terminal application execute an update command only when the update probe identifies a supported component, the evidence is actionable, the command belongs to the application's closed allowlist, and the user explicitly confirms it.
Given: Given: The app is awaiting confirmation for a supported allowlisted command.
When: When: The user confirms.
Then: Then: The terminal is handed to that exact command and no other command is executed.

## Scenario: terminal-app-pi-prelaunch-failure
title: Pi prelaunch failure degrades only to a viable installed host
requirement: The system MUST treat a failed Pi prelaunch update as degraded and continue only when a bounded version probe returns a published SemVer, otherwise it MUST report the runtime unavailable without executing the session handoff.
Given: The automatic Pi update exits nonzero or cannot be spawned.
When: The terminal application decides whether the original Pi launch can continue.
Then: A viable installed host launches with an explicit degraded warning, while a missing or invalid host is blocked with a stable reason.

## Scenario: terminal-app-pi-prelaunch-update
title: First Pi handoff updates the isolated runtime before launch
requirement: The system MUST run the authenticated Pi executable with exact argv update --all --no-approve, the selected cwd, isolated launch environment, and no shell before the first Pi create, resume, or continuity handoff in each terminal-app process, while Claude and offline handoffs remain untouched.
Given: A user explicitly selects a Pi handoff from the terminal application and offline mode is not enabled.
When: The terminal application prepares to execute the authenticated Pi launch plan.
Then: One process-local preparation is executed and shared by every later Pi handoff before the original plan runs; no Ein update, Claude update, project-local trust, or adapter-owned mutation occurs.

## Scenario: terminal-app-uncertain-update-informational
title: Uncertain terminal updates cannot be executed
requirement: The system MUST keep unsupported, uncertain, stale, or incomplete update evidence informational and non-actionable.
Given: Given: Update evidence is stale, incomplete, unavailable, or for an unsupported component.
When: When: The system view renders or the row is activated.
Then: Then: It reports the state as informational and provides no executable action.

## Scenario: terminal-app-update-requires-confirmation
title: System commands stay confirmed while Pi selection owns prelaunch maintenance
requirement: The system MUST require fresh actionable evidence, a closed allowlist, and explicit second-key confirmation for update or diagnostic commands activated from the terminal System view; the separate fixed Pi prelaunch command MAY run after the user explicitly selects Pi so new runtime code is loaded before session start.
Given: A supported System-view command is actionable, or a user explicitly selects a Pi runtime handoff.
When: The terminal application handles the selected action.
Then: System-view commands launch only after confirmation, while Pi selection may run only the fixed authenticated prelaunch maintenance command before handing off to Pi.
