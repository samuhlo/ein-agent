# OpenSpec Delta
format: openspec-delta/v1
domain: installer-runtime

## ADDED
### Scenario: cross-platform-installer-version-display
title: Installer version display is consistent on macOS
requirement: The system MUST display the running installer SemVer consistently on macOS without introducing a separate public display version.
Given: A supported macOS installer binary is invoked through its version or interactive banner surface
When: the installer renders its version
Then: the displayed installer version identifies the running binary using the same SemVer contract as Linux, while the existing template-version probe remains available where required

### Scenario: noninteractive-runtime-flag-selection
title: Non-interactive installer accepts an explicit runtime
requirement: The system MUST accept --runtime pi, --runtime claude, or --runtime both for non-interactive installation, default to Pi when the flag is omitted, and reject unsupported values before running a runtime path.
Given: ein install is invoked with --yes and an optional --runtime value
When: the installer parses the flags and selects runtime targets
Then: Pi, Claude Code, or both run in the existing Pi-then-Claude order exactly as selected, omission preserves the current Pi-only behavior, and an invalid value fails before installation
