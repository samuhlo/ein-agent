# Scope: docs-site-contract-ci

## Overview

Reconcile the undelivered CI-validation portion of legacy `docs-site-shell`. Add deterministic validation for the 21 Markdown documentation pages' exact four-key provenance/frontmatter contract (`title`, `description`, `sources`, `verified_rev`) and a built-HTML scan rejecting literal semantic versions matching `v\d+\.\d+\.\d+`. Preserve the existing Astro build, drift detector/report, 22 total routes (21 Markdown documents plus `index.mdx`), and `docs-deploy` workflow.

This change was split from the broader legacy `docs-site-shell` scope because the current `.github/workflows/ci.yml` already runs the Astro build and drift checks, but has no exact four-key contract validator and no built-HTML semantic-version scan. This slice reconciles only those undelivered gates.

## Scope packet

```
scope: Reconcile the undelivered CI validation portion of legacy change docs-site-shell: add exact four-key validation for 21 Markdown pages and a built-HTML semantic-version scan while preserving Astro build, drift checks/report, 22 routes, and docs-deploy.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 150000
```

## In scope

- Define the deterministic validator contract for exactly the four allowed frontmatter keys on all 21 Markdown pages.
- Define the deterministic scan of generated HTML for literals matching `v\d+\.\d+\.\d+`.
- Add both checks to the existing documentation CI path without weakening or replacing the Astro build or drift detector/report checks.
- Preserve the 22-route inventory and existing `docs-deploy` workflow.
- Keep source Markdown content unchanged.
- Add focused tests/fixtures in later phases for valid pages, extra/missing keys, and matching/non-matching built HTML.

## Out of scope

- No Markdown prose edits, frontmatter rewrites, or documentation redesign.
- No Astro build replacement, route restructuring, or deployment redesign.
- No revival of superseded roadmap documents; `docs/roadmap-features-ein.md` §10 is the canonical document index.
- No map, design, tasks, implementation, or test execution in this scope run.

## Acceptance boundaries for later phases

1. Every one of the 21 Markdown pages is accepted only with the exact key set `title`, `description`, `sources`, `verified_rev`.
2. The contract validator fails deterministically with actionable file/key diagnostics for missing, extra, or malformed contract fields.
3. The built-output scan fails on any literal matching the legacy semantic-version rule and passes otherwise.
4. Existing Astro build, drift detector/report checks, 22 routes, and `docs-deploy` remain present and operational.
5. No page content is rewritten by this change.

## Project and SDD context

- Stack: Astro/Starlight docs site within a Bun/TypeScript ESM monorepo; GitHub Actions CI.
- Testing configuration already exists in `openspec/config.yaml`: `strict_tdd: true`, runner `bun test`, typecheck `cd installer && bun run typecheck`.
- Existing docs CI builds in `docs-site`, runs focused drift detector/report tests, and runs the drift detector informatively. This scope does not execute those commands.
- `docs-site/src/content/docs/` currently contains 21 Markdown files. The route invariant additionally includes `index.mdx` for 22 total routes.

## Canonical context references

Only the explicitly supplied canonical context was used:

- `docs/roadmap-features-ein.md` §10 (canonical docs index): SHA-256 `279b3600e566227aa2961a09ecc6cec7bc7138499cdee0b0df0c2001d33ad818`, 28941 bytes.
- `openspec/config.yaml` (existing SDD/testing configuration): SHA-256 `22a847c4ba14080c9974ae911eee642e5b9cf766af79e03ca9284270b579aad9`, 1409 bytes.

Legacy `openspec/changes/docs-site-shell/scope.md` is reconciliation evidence only, not canonical roadmap direction.

## Phase boundary

This artifact is scope-only. No implementation, map, design, tasks, build, or test execution was performed.
