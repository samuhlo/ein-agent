# Scope: docs-site-mobile-surfaces

## Scope packet

scope: Reconcile the undelivered mobile-specific portion of legacy change `docs-site-shell` by adding explicit Starlight mobile surface treatment for `MobileMenuToggle`, `MobileMenuFooter`, and `MobileTableOfContents`, or behavior-equivalent composition when current Starlight APIs require it. Preserve the delivered desktop shell, all 22 routes (21 Markdown documents plus `index.mdx`), and current cleaner docs content; do not redesign the site or reopen the superseded documentation brief.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 150000

## Purpose and reconciliation basis

This change is explicitly split from `openspec/changes/docs-site-shell` because that change's mobile-specific scope items are absent from the delivered repository. Its legacy scope is reconciliation evidence only. Current product direction comes from `docs/roadmap-features-ein.md` §10, which marks `EIN_DOCUMENTATION_BRIEF.md` as superseded and identifies `roadmap-features-ein.md` as the canonical roadmap.

The delivered `docs-site/` is an Astro 7 + Starlight 0.41.7 site. `astro.config.mjs` currently registers custom `Head`, `Header`, `Sidebar`, and `Pagination` components, but no explicit mobile component overrides. The content tree currently contains 22 route files: 21 `.md` files and `src/content/docs/index.mdx`.

## In scope

- Inspect the current Starlight 0.41.7 component composition points and implement the smallest safe treatment for `MobileMenuToggle`, `MobileMenuFooter`, and `MobileTableOfContents`.
- Prefer direct Starlight component overrides where supported; otherwise compose/wrap the current Starlight components while preserving required slots, attributes, accessibility state, route context, and heading navigation semantics.
- Keep the existing desktop shell and existing content untouched except for wiring required to support the mobile surfaces.
- Keep mobile navigation compact and usable, with access to the intended content navigation, table of contents, and search actions.
- Verify behavior through the project’s existing build/validation path in later phases; this scope phase runs no tests or build.

## Out of scope and non-goals

- No redesign of the site, desktop shell, typography, content hierarchy, or visual language.
- No reopening or treating `docs/EIN_DOCUMENTATION_BRIEF.md` as current product direction.
- No changes to the 22 content routes, their cleaner prose, route count, or page contract.
- No implementation, map, design, tasks, tests, apply-progress, or verify-report artifacts in this phase.
- No new mobile product features beyond the three named Starlight surfaces and behavior-equivalent wiring.

## Acceptance boundaries for later phases

1. Mobile menu toggle is present, accessible, and opens/closes navigation without regressing the delivered desktop shell.
2. Mobile menu footer exposes the agreed essential mobile actions without requiring desktop header layout.
3. Mobile table of contents remains present, legible, and navigates to document headings correctly.
4. Starlight-required slots and accessibility semantics remain intact when components are wrapped or replaced.
5. Build and existing documentation contract/drift checks remain compatible; route inventory remains 22 files.

## Project context and testing configuration

`openspec/config.yaml` already exists and was not rewritten. It declares `strict_tdd: true`, Bun as package manager/runtime, `bun test` as the test runner, tests under `tests/`, and `cd installer && bun run typecheck` for typechecking. The docs-site package provides `bun run build` (`astro build`); no test command is added by this scope. Strict TDD is recorded as configuration for later phases only; this phase does not run tests or build.

## Evidence inspected

- `docs/roadmap-features-ein.md` — canonical roadmap index (§10); SHA-256 `279b3600e566227aa2961a09ecc6cec7bc7138499cdee0b0df0c2001d33ad818`; 28941 bytes.
- `openspec/changes/docs-site-shell/scope.md` — legacy reconciliation evidence; SHA-256 `fb8af86b9cf5aeaca61874ba5ef6dd62d77b9f2f9dad791fcaec2bc15ebd8483`; 12448 bytes.
- `docs-site/astro.config.mjs` — current Starlight component wiring; mobile surfaces are not explicitly registered.
- `docs-site/package.json` — Astro/Starlight dependency and build script.
- `docs-site/src/components/Header.astro` and `Sidebar.astro` — delivered desktop shell composition to preserve.

## Spec delta

This change has observable behavior deltas for mobile documentation navigation. The canonical declaration is the persisted delta at `openspec/changes/docs-site-mobile-surfaces/specs/docs-site-mobile-surfaces/spec.md`; no `spec_delta: none` block is included.
