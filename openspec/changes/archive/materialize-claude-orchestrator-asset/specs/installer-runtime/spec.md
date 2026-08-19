# OpenSpec Delta
format: openspec-delta/v1
domain: installer-runtime

## ADDED
### Scenario: claude-payload-materializes-canonical-orchestrator
title: Claude payload materializes the canonical orchestrator asset into the installed home
requirement: The system MUST validate and extract the packaged Claude payload, run its existing checkout/runtime sync hand-off, and leave the canonical orchestrator asset at the installed Claude home path `assets/orchestrator.md` with identical bytes.
Given: Given a packaged Claude payload containing the canonical orchestrator asset, an installed Claude home, and the existing transport and checkout sync contracts.
When: When Claude runtime installation stages the payload and invokes the existing sync hand-off.
Then: Then validation rejects an incomplete or checksum-invalid payload, extraction works from a compiled BunFS asset, and the installed home contains byte-identical `assets/orchestrator.md` without reimplementing transport or sync semantics.
