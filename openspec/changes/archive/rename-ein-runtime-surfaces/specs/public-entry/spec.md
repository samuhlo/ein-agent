# OpenSpec Delta
format: openspec-delta/v1
domain: public-entry

## ADDED
### Scenario: public-entry-runtime-shims-remain-secondary
title: Direct runtime shims do not become competing product doors
requirement: The system MUST expose `ein-pi` and `ein-cc` for advanced direct runtime access while keeping normal first-run and post-install guidance centered on `ein`.
Given: Ein is installed for Pi, Claude Code, or both
When: the product presents the next command to a normal user or documents an advanced direct-runtime path
Then: normal guidance says to run `ein`, advanced documentation may name the applicable Ein-first shim, and no completion message requires remembering a runtime shim

## MODIFIED
### Scenario: public-entry-consistent-story
title: Every surface names one public entry and Ein-first runtime shims
requirement: The system MUST describe `ein` as the public entry, `ein-install` as the bootstrap and repair hatch, and `ein-pi` plus `ein-cc` only as secondary direct-runtime shims in the README, help output, installation messages, and runtime documentation.
Given: a reader consults the README, `ein --help`, `ein-install --help`, installation output, or runtime documentation
When: they look for how to start, install, update, repair, or directly enter a runtime
Then: each surface names `ein` as the single door, keeps `ein-install` as the hatch, uses only the Ein-first names for secondary runtime shims, and never advertises a retired runtime-first name as current
