# OpenSpec Specification
format: openspec-spec/v1
domain: surface-wiring

## Scenario: claude-sync-deploys-canonical-orchestrator-asset
title: Claude sync deploys the canonical orchestrator asset into the isolated Claude home
requirement: The system MUST deploy the canonical `ein-pi/agent/assets/orchestrator.md` into the isolated Claude home at the path promised by the Claude adapter, preserving its bytes.
Given: Given: Given a checkout containing the canonical orchestrator asset and an isolated temporary Claude home.
When: When: When the existing Claude checkout/runtime sync path runs against that home.
Then: Then: Then the promised destination exists and its bytes are identical to the canonical source bytes.

## Scenario: close-phase-summary-has-a-deterministic-persistence-channel
title: The close phase has a deterministic persistence channel that does not depend on agent initiative
requirement: The system MUST offer the close phase a persistence channel for summary.md that does not depend on the agent writing the file on its own initiative, and that channel MUST validate the destination rather than only dumping bytes.
Given: Given: a summary.md produced by sdd-close and an existing change.
When: When: the content is passed to cc-ein-sdd summary <change> over stdin.
Then: Then: it is written to openspec/changes/<change>/summary.md, and rejected when the name is unsafe, the change does not exist, or the content is empty.

## Scenario: envelope-consumer-rule-is-declared-pi-specific
title: The envelope-consumer rule is declared as Pi-specific, not silently assumed for Claude
requirement: The system MUST declare that the subagent tool_result envelope-consumer rule is specific to Pi: Claude has no subagent-result interception, since its generated hooks are PreToolUse/PostToolUse/SessionStart and never a result hook.
Given: Given: the two runtime surfaces, Pi and Claude.
When: When: the surface-wiring scenario set is read.
Then: Then: the asymmetry is declared instead of silently omitted, per runtime-surface-parity-or-declared-difference.

## Scenario: loud-wasteful-and-safe-degradation-consumers-are-classified-by-failure-mode
title: Consumers are classified by failure mode, not by envelope consumption alone
requirement: The system SHOULD force foreground for a consumer classified loud-wasteful, and MAY leave a consumer classified safe-degradation unprotected only when that is declared explicitly in the inventory.
Given: Given: the drift canary and the phase-failure reconciliation consumers.
When: When: they are audited.
Then: Then: they are accepted without protection because their failure degrades to a no-op and the real verdict comes from evidence on disk.

## Scenario: runtime-surface-clean-session-activation
title: Clean session activates user-facing surfaces
requirement: The system MUST expose explicit Pi and Claude user-facing entry points for the cleaner audit, bounded cleaner mutation flow, and launcher/workbench without requiring knowledge of internal module paths.
Given: Given: A clean Pi or Claude session with the Ein harness installed and the existing cleaner and workbench engines available.
When: When: The user invokes any of the three supported capabilities through its documented command, agent, or skill entry point.
Then: Then: The selected entry point reaches the corresponding engine and reports its result or bounded runtime diagnostic without requiring an internal file import path.

## Scenario: runtime-surface-parity-or-declared-difference
title: Pi and Claude surface behavior is explicit
requirement: The system MUST provide identical observable behavior for the Pi and Claude surface entry points, or MUST declare each runtime-specific difference at the surface boundary.
Given: Given: The same supported cleaner audit, bounded mutation, or launcher/workbench request is made from Pi and Claude.
When: When: Each runtime dispatches the request through its user-facing surface.
Then: Then: Both runtimes produce equivalent activation and result semantics, or the surfaced output identifies the intentional runtime difference without silently changing the contract.

## Scenario: runtime-surface-seam-coverage
title: Surface-to-engine seam is covered
requirement: The system MUST test the real Pi and Claude surface-to-engine connection for cleaner audit, bounded cleaner mutation flow, and launcher/workbench activation.
Given: Given: A clean-session surface fixture and the existing engine implementations.
When: When: The seam coverage invokes each capability through its real user-facing entry point.
Then: Then: The test demonstrates that the entry point dispatches to the intended engine and validates the observable result or bounded diagnostic rather than testing only the engine module directly.

## Scenario: silent-incorrect-state-consumers-require-a-present-protection
title: A silent-incorrect-state consumer must declare a protection that is present in source
requirement: The system MUST require a consumer classified silent-incorrect-state to declare a protection that is present in the source, and MUST fail the audit naming the consumer and the missing protection when it is not.
Given: Given: a consumer declared with protection foreground-forced.
When: When: the source no longer contains the corresponding forcing.
Then: Then: the audit fails, naming the consumer and the missing protection.

## Scenario: subagent-envelope-consumer-inventory-is-declared
title: Every subagent tool_result consumer is declared in a machine-readable inventory
requirement: The system MUST maintain a declared, machine-readable inventory of all code that derives state from a subagent tool_result payload, and an audit of the tree MUST find the same set of consumers as the inventory declares.
Given: Given: Ein's Pi tool_result handler and its declared envelope-consumer inventory.
When: When: the tree is audited against the declared inventory.
Then: Then: the set of consumers found in source equals exactly the set of keys declared in the inventory.
