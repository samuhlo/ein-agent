# OpenSpec Specification
format: openspec-spec/v1
domain: installer-release-channels

## Scenario: installer-alpha-preference-target-isolation
title: Persist alpha only for the targeted Pi Ein installation
requirement: The system MUST persist and read back an alpha preference only within the explicitly targeted managed Pi Ein installation and leave Claude Ein, vanilla runtimes, and client homes unchanged.
Given: An alpha installer is requested for the Pi Ein dogfooding home while other managed or client homes exist.
When: The installer commits and reads back the release-channel preference.
Then: Only the targeted Pi Ein installation resolves alpha on a later run, persistence failure blocks a success claim, and every non-target home remains byte-for-byte unchanged.

## Scenario: installer-alpha-publication-contract
title: Publish prerelease tags with coherent release metadata
requirement: The system MUST accept full Semantic Version installer tags for push and manual publication, require the tag, installer version pointers, and changelog entry to agree, preserve the main-tip gate, and mark only Semantic Version prerelease tags as GitHub prereleases.
Given: A push tag or workflow_dispatch input requests publication of an installer final or prerelease version.
When: The GitHub Actions release workflow validates and creates the release.
Then: Malformed or inconsistent versions fail before publication, the tagged commit remains subject to the existing main-tip gate, prerelease tags create prerelease GitHub Releases, and final tags create normal GitHub Releases.

## Scenario: installer-bootstrap-explicit-release-selection
title: Bootstrap an explicitly requested installer release
requirement: The system MUST allow an explicit validated installer tag or alpha request to select assets and checksums from that exact eligible prerelease instead of resolving through GitHub latest stable.
Given: The bootstrap receives an explicit installer prerelease tag or alpha selection.
When: It constructs download locations for the platform asset and checksums manifest.
Then: Both downloads are bound to the requested eligible release tag, malformed or unsupported prerelease input fails closed, and the default path without explicit input continues to use the stable release.

## Scenario: release-artifact-immutable-identity
title: Bind verified artifact identity before local commit
requirement: The system MUST derive an immutable artifact identifier from the normalized release tag and verified artifact digest before committing local mutation, while allowing candidate selection and acquisition to remain pending until digest verification succeeds.
Given: A channel-eligible candidate has been selected and its artifact bytes are available for verification.
When: The installer verifies, commits, reads back, or records the artifact for rollback.
Then: Verified evidence carries the same canonical artifact identifier through marker and rollback records, while missing or conflicting tag, digest, or identifier evidence blocks commit without claiming signature authenticity.

## Scenario: release-authority-separation
title: Keep remote and local rollback authorities separate
requirement: The system MUST treat remote publication and channel movement as remote authority and local install, backup, journal, restore, and rollback as installer authority, with no operation claiming to roll back both.
Given: Remote channel evidence and local installer transaction evidence share an immutable artifact identifier.
When: A remote rollback, local rollback, promotion, repair, or restore is requested or reported.
Then: Remote operations may move channel pointers but do not claim to restore local trees, and local operations may restore managed local trees but do not mutate or claim to mutate remote channels.

## Scenario: release-channel-alpha-expiration
title: Keep alpha expiration evidence-gated
requirement: The system MUST evaluate alpha expiration only from explicit immutable publication evidence and a deterministic policy, and MUST represent expiration as unknown or unavailable when either input is absent.
Given: An alpha release may or may not provide immutable publication evidence and an applicable expiration boundary.
When: The effective alpha status is evaluated.
Then: Complete evidence is evaluated reproducibly, missing evidence remains unknown or unavailable, expired alpha is not reported as current, and no stable channel state is changed.

## Scenario: release-channel-effective-status
title: Expose the effective release channel honestly
requirement: The system MUST expose the installation-scoped persisted channel preference, effective channel, installed version, immutable artifact identifier when verified, and freshness status without presenting expired, stale, conflicting, or unavailable evidence as current.
Given: Channel resolution and installed release evidence are available, stale, expired, conflicting, pending verification, or unavailable.
When: The installer renders or returns release status.
Then: The status identifies preference and effective channel separately with evidenced version and artifact identifier, while pending or uncertain identity and freshness remain visibly unknown or unavailable.

## Scenario: release-channel-prerelease-eligibility
title: Restrict prereleases to alpha while allowing finals
requirement: The system MUST allow stable to resolve only non-draft final releases and alpha to resolve non-draft final releases or non-draft alpha prereleases, selecting the highest eligible Semantic Version and rejecting unsupported prerelease vocabularies.
Given: Published release records include final, alpha prerelease, other prerelease, malformed, and draft variants.
When: Eligibility and ordering are evaluated for stable or alpha.
Then: Stable considers only eligible finals, alpha considers eligible finals and alpha prereleases, both select the highest eligible Semantic Version, and drafts or unsupported prerelease forms are rejected.

## Scenario: release-channel-vocabulary-resolution
title: Resolve an installation-scoped release channel deterministically
requirement: The system MUST recognize only stable and alpha release channels, persist the preference per managed Ein installation, default an absent preference to stable, fail closed on unsupported or unreadable values, and leave client project settings unchanged.
Given: A managed Ein installation has no preference, a valid stable or alpha preference, or unsupported or unreadable bytes while client projects retain their own settings.
When: The installer persists or resolves that installation's requested release channel.
Then: Absence resolves to stable, valid preferences reproduce across runs for that installation only, invalid state is unavailable, and client project settings remain byte-for-byte unchanged.

## Scenario: release-local-rollback-evidence
title: Retain minimum local rollback evidence for alpha dogfooding
requirement: The system MUST retain local transaction evidence sufficient to identify the previous and attempted artifact identifiers, affected local tree, backup reference, journal state, and rollback outcome before an alpha installation can be reported as safely dogfoodable.
Given: Ein locally attempts to install or update to an eligible alpha artifact while client projects remain configured for stable.
When: The local transaction mutates the managed Ein installation or must roll it back.
Then: The installer can prove which local tree and artifact transition were affected and whether restoration completed, while client project preferences remain stable.
