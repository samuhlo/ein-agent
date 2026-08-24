# OpenSpec Delta
format: openspec-delta/v1
domain: public-entry

## ADDED
### Scenario: public-entry-lifecycle-delegation
title: Run the lifecycle verb instead of announcing where it moved
requirement: The system MUST execute `ein-install <verb>` when `ein` receives a lifecycle verb, forwarding the remaining arguments unchanged and propagating the child's exit code.
Given: A user types `ein update` with any further arguments on a machine where the app is deployed.
When: The public entry classifies the first argument as a lifecycle verb.
Then: `ein-install update` runs with the terminal inherited and the same arguments, and its exit code becomes the exit code of `ein`.

### Scenario: public-entry-unavailable-lifecycle
title: An unrunnable lifecycle command is unavailable, never done
requirement: The system MUST report a bounded, named failure with a non-zero exit code when the delegated installer cannot be started, and MUST NOT present the operation as completed.
Given: `ein-install` is missing from the PATH or cannot be spawned.
When: A lifecycle verb is delegated to it.
Then: The output names the command that could not be run, the exit code is 127, and no success is claimed.

### Scenario: public-entry-single-lifecycle-surface
title: Offer the lifecycle actions exactly once
requirement: The system MUST NOT present the lifecycle actions in a second interactive menu; `ein-install` with no arguments MUST install, prompting only for the runtime, and MUST stay bounded without a terminal.
Given: A user runs `ein-install` with no arguments.
When: The installer dispatches its no-argument path.
Then: It installs after asking only which runtime to install, a cancelled answer installs nothing, and a non-interactive run explains the explicit runtime flag instead of waiting on a keypress.

### Scenario: public-entry-consistent-story
title: Every surface names one public entry
requirement: The system MUST describe `ein` as the public entry and `ein-install` as bootstrap and repair hatch in the README, in both binaries' help output, and in the post-install messages.
Given: A reader consults the README, `ein --help`, or `ein-install --help`.
When: They look for how to install, update, or repair Ein.
Then: Each surface names `ein` as the single door and `ein-install` as the hatch, and none of them presents the installer as `ein`.
