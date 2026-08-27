# OpenSpec Delta
format: openspec-delta/v1
domain: installer-runtime

## ADDED
### Scenario: runtime-surface-rename-cleans-owned-legacy-entrypoints
title: Upgrade removes only installer-owned retired runtime entry points
requirement: The system MUST publish the Ein-first runtime launchers and SDD command before removing retired installer-owned entry points, and MUST NOT delete unrelated user-owned files or migrate runtime data homes.
Given: an existing managed alpha installation contains retired runtime launcher or SDD executable names
When: the supported install or update path deploys the renamed runtime surfaces
Then: the new entry points are usable, each retired installer-owned entry point is removed through a bounded explicit cleanup, unrelated functions remain byte-identical, and the Pi and Claude data homes stay in place

## MODIFIED
### Scenario: claude-code-runtime-installation
title: Claude Code target installs the Ein-first runtime surface
requirement: The system MUST install the Claude Code Ein runtime by invoking `bun ein-cc/sync.ts`, installing `ein-cc.fish`, and publishing `ein-cc-sdd` as its deterministic SDD command.
Given: the Claude Code runtime path is selected
When: installation runs
Then: the renamed sync path runs with Bun, the Ein-first launcher and SDD command are installed, and either failure produces a failed Claude Code installation result

### Scenario: pi-runtime-isolated-installation
title: Pi target installs the isolated Ein-first runtime surface
requirement: The system MUST deploy Ein for Pi through the existing isolated-agent resolution, install `ein-pi.fish`, preserve `~/.pi-ein/agent`, and migrate legacy Ein from `~/.pi/agent` only when legacy Ein is detected.
Given: the Pi runtime path is selected
When: installation runs with an isolated or legacy Pi agent state
Then: the template targets the unchanged isolated Pi data directory, the `ein-pi` launcher is installed under the Fish functions directory, and a detected legacy installation is migrated without treating an ordinary vanilla Pi directory as Ein
