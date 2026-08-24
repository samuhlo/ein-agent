# OpenSpec Specification
format: openspec-spec/v1
domain: claude-continuity-ipc

## Scenario: preparation-duration-distinct-from-transport-inactivity
title: Preparation duration is distinct from transport inactivity
requirement: The system MUST distinguish an accepted Claude continuity IPC request that is still performing legitimate bounded preparation from an inactive or failed transport, while preserving a finite fail-closed response deadline.
Given: A valid authenticated continuity control request reaches the Claude continuity supervisor and its preparation may take longer than the transport inactivity interval.
When: The hook waits for the supervisor response.
Then: Preparation that completes within the bounded response deadline returns its bounded supervisor result; actual transport inactivity, failure, or expiry returns unavailable without hanging or bypassing the root test.
