# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: readonly-scout-bounded-research-contract
title: Scout research is normalized, tool-call bounded, and locally validated
requirement: The system MUST normalize only direct foreground `ein-scout` launches to fresh context, `maxRuntimeMs: 120000`, `turnBudget: { maxTurns: 12, graceTurns: 2 }`, and `toolBudget: { hard: 30, soft: 24, block: "*" }`; the canonical scout agent frontmatter MUST declare exactly `read`, `grep`, and `find` with `extensions: []`. The system MUST accept only one locally fail-closed, schema-valid report of at most 16384 UTF-8 bytes with valid in-root references, line ranges, and explicit uncertainty. The current empty-extension compatibility contract MUST NOT be represented as a per-run capability probe or a pinned-package guarantee; unpinned future dependency drift remains a residual risk.
Given: a caller requests `ein-scout` research or a scout report is returned.
When: the direct foreground launch is normalized or the returned report is validated.
Then: alternate invocation forms are rejected, the normalized call has the stated wall-clock, turn, and hard tool-call limits, and only a single report passing local schema, reference, uncertainty, and path validation is accepted; malformed, oversized, unreferenced, uncertainly-missing, invalid-line, missing, escaping, or symlink-escaping evidence fails closed.

### Scenario: readonly-scout-remains-outside-sdd-lifecycle
title: Scout inventory membership does not change the seven-phase lifecycle
requirement: The system MUST include `ein-scout` consistently in the authoritative installed-agent inventory, model recommendations, doctor diagnostics, and exact inventory tests while MUST NOT include it in SDD phase order, routing, reconciliation, state, or chain machinery. Scout reports MUST remain advisory evidence and MUST NOT create architecture, implementation, delivery, or lifecycle authority.
Given: the authoritative agent inventory and SDD lifecycle contracts are loaded.
When: installation, doctor, model configuration, inventory tests, and lifecycle routing are evaluated.
Then: all agent-facing inventories agree that `ein-scout` is installed, all lifecycle mechanisms retain exactly `scope → map → design → tasks → apply → verify → close`, and the scout has no architecture or solution-decision authority.
