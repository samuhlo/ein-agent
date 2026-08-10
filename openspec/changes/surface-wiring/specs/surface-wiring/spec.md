# OpenSpec Delta
format: openspec-delta/v1
domain: surface-wiring

## ADDED
### Scenario: runtime-surface-clean-session-activation
title: Clean session activates user-facing surfaces
requirement: The system MUST expose explicit Pi and Claude user-facing entry points for the cleaner audit, bounded cleaner mutation flow, and launcher/workbench without requiring knowledge of internal module paths.
Given: Given: A clean Pi or Claude session with the Ein harness installed and the existing cleaner and workbench engines available.
When: When: The user invokes any of the three supported capabilities through its documented command, agent, or skill entry point.
Then: Then: The selected entry point reaches the corresponding engine and reports its result or bounded runtime diagnostic without requiring an internal file import path.

### Scenario: runtime-surface-parity-or-declared-difference
title: Pi and Claude surface behavior is explicit
requirement: The system MUST provide identical observable behavior for the Pi and Claude surface entry points, or MUST declare each runtime-specific difference at the surface boundary.
Given: Given: The same supported cleaner audit, bounded mutation, or launcher/workbench request is made from Pi and Claude.
When: When: Each runtime dispatches the request through its user-facing surface.
Then: Then: Both runtimes produce equivalent activation and result semantics, or the surfaced output identifies the intentional runtime difference without silently changing the contract.

### Scenario: runtime-surface-seam-coverage
title: Surface-to-engine seam is covered
requirement: The system MUST test the real Pi and Claude surface-to-engine connection for cleaner audit, bounded cleaner mutation flow, and launcher/workbench activation.
Given: Given: A clean-session surface fixture and the existing engine implementations.
When: When: The seam coverage invokes each capability through its real user-facing entry point.
Then: Then: The test demonstrates that the entry point dispatches to the intended engine and validates the observable result or bounded diagnostic rather than testing only the engine module directly.
