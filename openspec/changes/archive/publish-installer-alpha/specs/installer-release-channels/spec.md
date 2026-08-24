# OpenSpec Delta
format: openspec-delta/v1
domain: installer-release-channels

## ADDED
### Scenario: installer-alpha-preference-target-isolation
title: Persist alpha only for the targeted Pi Ein installation
requirement: The system MUST persist and read back an alpha preference only within the explicitly targeted managed Pi Ein installation and leave Claude Ein, vanilla runtimes, and client homes unchanged.
Given: An alpha installer is requested for the Pi Ein dogfooding home while other managed or client homes exist.
When: The installer commits and reads back the release-channel preference.
Then: Only the targeted Pi Ein installation resolves alpha on a later run, persistence failure blocks a success claim, and every non-target home remains byte-for-byte unchanged.

### Scenario: installer-alpha-publication-contract
title: Publish prerelease tags with coherent release metadata
requirement: The system MUST accept full Semantic Version installer tags for push and manual publication, require the tag, installer version pointers, and changelog entry to agree, preserve the main-tip gate, and mark only Semantic Version prerelease tags as GitHub prereleases.
Given: A push tag or workflow_dispatch input requests publication of an installer final or prerelease version.
When: The GitHub Actions release workflow validates and creates the release.
Then: Malformed or inconsistent versions fail before publication, the tagged commit remains subject to the existing main-tip gate, prerelease tags create prerelease GitHub Releases, and final tags create normal GitHub Releases.

### Scenario: installer-bootstrap-explicit-release-selection
title: Bootstrap an explicitly requested installer release
requirement: The system MUST allow an explicit validated installer tag or alpha request to select assets and checksums from that exact eligible prerelease instead of resolving through GitHub latest stable.
Given: The bootstrap receives an explicit installer prerelease tag or alpha selection.
When: It constructs download locations for the platform asset and checksums manifest.
Then: Both downloads are bound to the requested eligible release tag, malformed or unsupported prerelease input fails closed, and the default path without explicit input continues to use the stable release.
