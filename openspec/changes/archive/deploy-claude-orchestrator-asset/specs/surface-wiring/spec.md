# OpenSpec Delta
format: openspec-delta/v1
domain: surface-wiring

## ADDED
### Scenario: claude-sync-deploys-canonical-orchestrator-asset
title: Claude sync deploys the canonical orchestrator asset into the isolated Claude home
requirement: The system MUST deploy the canonical `ein-pi/agent/assets/orchestrator.md` into the isolated Claude home at the path promised by the Claude adapter, preserving its bytes.
Given: Given: Given a checkout containing the canonical orchestrator asset and an isolated temporary Claude home.
When: When: When the existing Claude checkout/runtime sync path runs against that home.
Then: Then: Then the promised destination exists and its bytes are identical to the canonical source bytes.
