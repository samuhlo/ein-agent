# OpenSpec Delta
format: openspec-delta/v1
domain: installer-runtime

## ADDED
### Scenario: installer-bootstrap-mandatory-checksum
title: Bootstrap installation requires a verified checksum
requirement: The system MUST install the selected bootstrap release asset only after downloading checksums.txt and verifying exactly one valid checksum entry matches the asset.
Given: the bootstrap has selected and downloaded a platform release asset and requested checksums.txt
When: checksums.txt is unavailable, malformed, missing exactly one entry for the selected asset, or contains a digest that differs from the downloaded asset
Then: the installer exits nonzero before publishing or executing the asset; when checksums.txt is valid and the digest matches, the installer verifies first and then uses the existing successful installation path
