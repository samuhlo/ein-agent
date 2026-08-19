# OpenSpec Specification
format: openspec-spec/v1
domain: claude-payload-transport

## Scenario: claude-payload-carries-canonical-orchestrator
title: Claude payload carries the canonical orchestrator asset
requirement: The system MUST include the canonical `ein-pi/agent/assets/orchestrator.md` in the Claude payload inventory and generated archive at the stable payload-relative path `ein-pi/agent/assets/orchestrator.md`, preserving its bytes and declaring it in the manifest.
Given: Given a checkout containing the canonical orchestrator asset and the Claude payload bundler.
When: When the payload inventory and bundle pipeline generate the Claude archive.
Then: Then the archive contains `ein-pi/agent/assets/orchestrator.md` at that exact path, the manifest contains its path and checksum, and a missing or unreadable canonical asset fails bundling instead of producing an apparently valid payload.
