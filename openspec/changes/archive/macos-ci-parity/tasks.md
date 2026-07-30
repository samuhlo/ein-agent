# Tasks — macos-ci-parity

status: ready
blocked_by: none

## // 001. Main quality-gate parity and scoped policy documentation

**Production files:** `.github/workflows/ci.yml`, `README.md`, `docs/quality-roadmap/01-macos-ci-parity.md`.

**Dependencies:** none. TDD is off. Apply uses static workflow/document inspection only; full suite, installer typecheck, template packaging, and GitHub Actions matrix evidence are reserved for `sdd-verify`.

**Group acceptance:** one shared `test` matrix schedules `ubuntu-latest` and `macos-latest`; both entries retain the existing frozen install, template bundle, root Bun test, and installer typecheck sequence; one workflow-level `BUN_VERSION: "1.3.0"` feeds the shared setup step; README scopes and explains the deliberate update procedure; roadmap status records implementation progress without claiming verification completion; Docker E2E and release workflows remain untouched.

- [x] 1.1 Make the main quality job structurally run the existing shared sequence on Ubuntu and macOS with one exact workflow-level Bun pin.
  - files: `.github/workflows/ci.yml`
  - before/after: replace the single `ubuntu-latest` runner and floating `bun-version: latest` with a `strategy.matrix.os` containing `ubuntu-latest` and `macos-latest`, plus one `BUN_VERSION: "1.3.0"` declaration consumed by the existing shared Bun setup step; preserve triggers, checkout, command order, commands, and working directories exactly.
  - dependencies: none
  - acceptance: the matrix has exactly the two specified runners; each entry uses the same setup/install/bundle/test/typecheck steps; `bun install --frozen-lockfile` remains in `installer`; the bundle stays before root `bun test`; no OS conditional weakens a check.
  - skills: `github-workflow`, `bun`, `work-unit-commits`
  - why: makes platform parity structural while eliminating unreviewed Bun runtime drift in the scoped quality gate.
  - learn: a single matrix and a single version source prevent the two platforms from silently diverging.
  - architecture: CI orchestration owns runner selection and runtime pinning; installer code and lockfiles remain unchanged reference inputs.
  - avoid: duplicating jobs or adding macOS-only exceptions before an observed failure, which would obscure parity and broaden scope.
  - verify: `git diff --check -- .github/workflows/ci.yml && sed -n '/^jobs:/,$p' .github/workflows/ci.yml`

- [x] 1.2 Document the main-quality-gate-only Bun pin and advance the roadmap to an unverified implementation state.
  - files: `README.md`, `docs/quality-roadmap/01-macos-ci-parity.md`
  - before/after: extend the existing CI description in `README.md` to name `.github/workflows/ci.yml` as the source of the quality-gate `1.3.0` pin and require a deliberate one-value update followed by both matrix checks; change the roadmap slice from `planned` to an in-progress/implemented-pending-verification status and retain unchecked completion evidence.
  - dependencies: 1.1
  - acceptance: documentation limits the policy to the main quality gate, explains the single update location and Ubuntu/macOS validation expectation, makes no Windows, repository-wide, release, or publication claim, and does not mark CI evidence or the roadmap slice complete before `sdd-verify`.
  - skills: `github-workflow`, `work-unit-commits`
  - why: maintainers need an explicit, reviewable update path without overstating coverage that this slice does not provide.
  - learn: a pinned tool version is only reproducible in practice when its owner, scope, and update check are documented.
  - architecture: the workflow is the machine-readable source of truth; README explains policy; the roadmap tracks progress separately from verification evidence.
  - avoid: changing `.github/workflows/e2e.yml` or release workflow selectors merely to make the policy sound repository-wide.
  - verify: `git diff --check -- README.md docs/quality-roadmap/01-macos-ci-parity.md && grep -nE 'BUN_VERSION|1\.3\.0|macOS|Ubuntu|verif|pend' README.md docs/quality-roadmap/01-macos-ci-parity.md .github/workflows/ci.yml`
