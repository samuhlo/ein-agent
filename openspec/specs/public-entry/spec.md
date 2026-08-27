# OpenSpec Specification
format: openspec-spec/v1
domain: public-entry

## Scenario: public-entry-consistent-story
title: Every surface names one public entry and Ein-first runtime shims
requirement: The system MUST describe `ein` as the public entry, `ein-install` as the bootstrap and repair hatch, and `ein-pi` plus `ein-cc` only as secondary direct-runtime shims in the README, help output, installation messages, and runtime documentation.
Given: a reader consults the README, `ein --help`, `ein-install --help`, installation output, or runtime documentation
When: they look for how to start, install, update, repair, or directly enter a runtime
Then: each surface names `ein` as the single door, keeps `ein-install` as the hatch, uses only the Ein-first names for secondary runtime shims, and never advertises a retired runtime-first name as current

## Scenario: public-entry-lifecycle-delegation
title: Run the lifecycle verb instead of announcing where it moved
requirement: The system MUST execute `ein-install <verb>` when `ein` receives a lifecycle verb, forwarding the remaining arguments unchanged and propagating the child's exit code.
Given: A user types `ein update` with any further arguments on a machine where the app is deployed.
When: The public entry classifies the first argument as a lifecycle verb.
Then: `ein-install update` runs with the terminal inherited and the same arguments, and its exit code becomes the exit code of `ein`.

## Scenario: public-entry-runtime-shims-remain-secondary
title: Direct runtime shims do not become competing product doors
requirement: The system MUST expose `ein-pi` and `ein-cc` for advanced direct runtime access while keeping normal first-run and post-install guidance centered on `ein`.
Given: Ein is installed for Pi, Claude Code, or both
When: the product presents the next command to a normal user or documents an advanced direct-runtime path
Then: normal guidance says to run `ein`, advanced documentation may name the applicable Ein-first shim, and no completion message requires remembering a runtime shim

## Scenario: public-entry-single-lifecycle-surface
title: Offer the lifecycle actions exactly once
requirement: The system MUST NOT present the lifecycle actions in a second interactive menu; `ein-install` with no arguments MUST install, prompting only for the runtime, and MUST stay bounded without a terminal.
Given: A user runs `ein-install` with no arguments.
When: The installer dispatches its no-argument path.
Then: It installs after asking only which runtime to install, a cancelled answer installs nothing, and a non-interactive run explains the explicit runtime flag instead of waiting on a keypress.

## Scenario: public-entry-unavailable-lifecycle
title: An unrunnable lifecycle command is unavailable, never done
requirement: The system MUST report a bounded, named failure with a non-zero exit code when the delegated installer cannot be started, and MUST NOT present the operation as completed.
Given: `ein-install` is missing from the PATH or cannot be spawned.
When: A lifecycle verb is delegated to it.
Then: The output names the command that could not be run, the exit code is 127, and no success is claimed.
