# OpenSpec Specification
format: openspec-spec/v1
domain: installer-runtime

## Scenario: claude-code-runtime-installation
title: Claude Code target installs cc-ein
requirement: The system MUST install the Claude Code EIN runtime by invoking bun cc-ein/sync.ts and installing cc-ein.fish under the Fish functions directory.
Given: the Claude Code runtime path is selected
When: installation runs
Then: cc-ein/sync.ts is invoked with Bun, cc-ein.fish is installed, and the installer reports a failed Claude Code path when either operation fails

## Scenario: pi-runtime-isolated-installation
title: Pi target installs the isolated EIN runtime
requirement: The system MUST deploy Pi EIN through the existing isolated-agent resolution, install pi-ein.fish, and migrate legacy EIN from ~/.pi/agent only when legacy EIN is detected.
Given: the Pi runtime path is selected
When: installation runs with an isolated or legacy Pi agent state
Then: the template targets the isolated Pi directory, the pi-ein launcher is installed under the Fish functions directory, and a detected legacy installation is migrated without treating an ordinary vanilla Pi directory as EIN

## Scenario: runtime-menu-target-selection
title: Installer offers explicit runtime targets
requirement: The system MUST offer Pi, Claude Code, and both as installer runtime choices and execute only the selected runtime path or paths.
Given: the interactive installer menu is opened
When: the user selects Pi, Claude Code, or both
Then: the installer runs the corresponding target path exactly once and does not run an unselected runtime path
