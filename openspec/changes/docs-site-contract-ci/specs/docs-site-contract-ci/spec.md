# OpenSpec Delta
format: openspec-delta/v1
domain: docs-site-contract-ci

## ADDED
### Scenario: built-html-version-prohibition
title: Built HTML semantic-version prohibition
requirement: The system MUST fail CI when built documentation HTML contains a literal semantic version matching the legacy scope rule v\d+\.\d+\.\d+.
Given: The Astro documentation site has been built using the existing build process
When: CI scans the generated HTML output
Then: The scan passes when no matching literal exists and fails while identifying the offending output.

### Scenario: exact-frontmatter-contract
title: Exact four-key Markdown frontmatter contract
requirement: The system MUST deterministically validate that each of the 21 Markdown documentation pages has exactly the four frontmatter keys title, description, sources, and verified_rev.
Given: The documentation source tree contains the 21 Markdown pages under docs-site/src/content/docs/
When: CI runs the documentation contract validator
Then: The validator passes only when every page has that exact key set and fails with actionable page/key diagnostics otherwise.

### Scenario: preserve-docs-ci-coverage
title: Preserve existing documentation CI coverage
requirement: The system MUST preserve the existing Astro build, drift detector/report checks, 22 total routes, and docs-deploy workflow while adding the two validation gates.
Given: The repository contains the current docs-site and CI/deployment workflows
When: The change is applied and CI executes
Then: The existing build, drift checks, route inventory, and deployment workflow remain operational and the new validators run as additional deterministic checks.
