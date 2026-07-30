# Design — macOS CI parity

## A. Proposal

### Intent

Extend the main quality gate to run the same installer packaging smoke, Bun test suite, and installer typecheck on Ubuntu and macOS. Pin that gate to Bun `1.3.0` through one workflow-level version declaration shared by both matrix entries.

### Scope

In scope:

- Convert the main quality job into an `ubuntu-latest` / `macos-latest` matrix.
- Preserve the current install, bundle, test, and typecheck sequence on both runners.
- Replace `bun-version: latest` in the main quality gate with one exact Bun `1.3.0` declaration.
- Document where the quality-gate pin lives and how maintainers update it deliberately.
- Confirm that manual Docker E2E remains Ubuntu-only.

Non-goals:

- Native Windows support or a native Windows support claim.
- Docker E2E on macOS or changes to its purpose.
- Release publication or changes to the installer release workflow.
- Installer behavior, dependencies, lockfile format, or package-manager changes.
- Unrelated workflow cleanup or portability refactoring.

### Affected areas

- `.github/workflows/ci.yml` — add the OS matrix, define the single Bun version source, and consume it in the shared setup step.
- `README.md` — extend the existing CI-facing documentation with the pin location, scope, and deliberate update procedure.
- `.github/workflows/e2e.yml` — verification reference only; no change is planned.

### Risks

- macOS may expose incompatible `tar` options, filesystem case behavior, archive permissions, or shell assumptions in the existing bundle smoke.
- Moving the job to a matrix can accidentally change the established Ubuntu command order, working directories, or frozen-lockfile behavior.
- Pinning the minimum supported Bun release (`1.3.0`) can expose code or lockfile assumptions that happened to work only on newer floating releases.
- The additional macOS job increases GitHub Actions duration and macOS runner consumption.
- Documentation could overstate the pin as repository-wide even though manual E2E and release workflows remain outside this change.

### Rollback

Revert only the matrix, shared Bun pin, and CI-policy documentation. This restores the Ubuntu-only quality gate without changing installer code, dependencies, the lockfile, Docker E2E, or release behavior.

### Success criteria

A successful GitHub Actions run shows independent Ubuntu and macOS matrix entries using Bun `1.3.0` and completing the same frozen install, bundle smoke, Bun tests, and installer typecheck in the existing order. The E2E workflow remains manual and Ubuntu-only, and the documentation explains the single update point without claiming native Windows support.

## B. Spec

### Requirement 1 — Cross-platform quality matrix

The main quality workflow **MUST** schedule the quality job on both `ubuntu-latest` and `macos-latest` for every event already handled by that workflow.

**Scenario**

- **Given** a push, pull request, or manual dispatch accepted by the main quality workflow
- **When** GitHub Actions expands the quality job
- **Then** it schedules one Ubuntu entry and one macOS entry

### Requirement 2 — Equivalent quality sequence

Each OS entry **MUST** run the following sequence in this order: checkout, Bun setup, `bun install --frozen-lockfile` in `installer`, `bun run bundle-template` in `installer`, root-level `bun test`, and `bun run typecheck` in `installer`. Platform-specific conditions **MUST NOT** weaken or skip these checks; a condition **MAY** be introduced only for a demonstrated platform necessity and must remain narrowly scoped.

**Scenario**

- **Given** either matrix runner starts the quality job
- **When** its steps execute successfully
- **Then** the frozen install, packaging smoke, test suite, and typecheck run with the same commands, order, and working directories as on the other runner

### Requirement 3 — Reproducible Bun policy

The main quality workflow **MUST** resolve Bun to exact version `1.3.0` from one workflow-level declaration consumed by the shared matrix setup step. Ubuntu and macOS **MUST NOT** carry separate Bun selectors. Maintainer documentation **MUST** identify that declaration as the source of truth and **MUST** require a deliberate one-value update followed by both matrix checks.

**Scenario**

- **Given** the quality workflow and its version-policy documentation
- **When** a maintainer inspects or updates the Bun runtime
- **Then** one declared value resolves both OS entries to `1.3.0`, and the documented update path changes that single value before validating both entries

### Requirement 4 — Ubuntu-only Docker boundary

Docker E2E **MUST** remain a separate, manually dispatched workflow on `ubuntu-latest` and **MUST NOT** be added to the macOS quality matrix.

**Scenario**

- **Given** the quality and E2E workflow definitions
- **When** their jobs and triggers are inspected
- **Then** Docker E2E is available only by manual dispatch on Ubuntu while the macOS matrix contains no Docker E2E step

### Requirement 5 — Claims and change boundary

Documentation **MUST** describe the exact Bun pin as applying to the main quality gate and **MUST NOT** claim native Windows support, release publication, or a repository-wide Bun pin. The change **SHOULD** leave installer dependencies, `installer/bun.lock`, E2E behavior, and release workflow behavior untouched.

**Scenario**

- **Given** the completed workflow and documentation diff
- **When** its claims and changed files are reviewed
- **Then** it describes Ubuntu/macOS quality parity only and contains no native Windows, publication, dependency, lockfile, E2E-behavior, or release-workflow expansion

## C. Decisions

### 1. Use one exact workflow-level Bun pin

`.github/workflows/ci.yml` will define `BUN_VERSION: "1.3.0"` once and pass it to the single `oven-sh/setup-bun@v2` step used by the OS matrix. Version `1.3.0` is the smallest explicit reproducible choice supported by the repository's stated Bun `>= 1.3` requirement and its `@types/bun` 1.3 baseline.

Trade-off: an exact pin avoids unreviewed runtime drift but requires explicit maintenance. Updating it means changing the one workflow value in a dedicated reviewable change and requiring successful Ubuntu and macOS quality entries.

### 2. Use one matrix job rather than duplicated OS jobs

Runner selection belongs to `strategy.matrix.os`; the existing steps remain a single shared sequence. This makes parity structural: command or order changes apply to both platforms unless an explicit, justified condition is added.

### 3. Preserve the packaging-before-tests dependency

The bundle step remains before `bun test` because it creates the gitignored embedded archive consumed by the test path. CI owns orchestration; `installer/scripts/bundle-template.ts` and tests own packaging and behavioral validation respectively and are not changed in this slice.

### 4. Keep policy documentation near the existing CI description

`README.md` already states that pushes pass tests, typecheck, and packaging smoke, so it owns the concise maintainer-facing policy. The workflow remains the machine-readable source of truth; the README explains its scope and update procedure.

### 5. Keep Docker and release workflows outside the policy boundary

`.github/workflows/e2e.yml` continues to own manual Ubuntu Docker validation. `.github/workflows/installer-release.yml` continues to own publication. Their current Bun selectors are not aligned here because doing so would broaden the change beyond the main cross-platform quality gate.

### Alternatives rejected

- **`bun-version: latest`:** rejected because runs are not reproducible and runtime changes arrive without review.
- **A major/minor family such as `1.3.x`:** rejected because patch releases still drift between otherwise identical runs.
- **Separate Ubuntu and macOS version values or jobs:** rejected because duplicated declarations can diverge and obscure parity.
- **A new repository-wide version file:** rejected as unnecessary for a policy intentionally limited to one workflow; the workflow-level declaration is the smaller source of truth.
- **Using installer package metadata as the pin:** rejected because `installer/package.json` is not currently the CI runtime authority and is outside the expected dependency-neutral surface.
- **Adding macOS Docker E2E or refactoring platform-sensitive packaging pre-emptively:** rejected because the slice is meant to expose real parity failures, not speculate or broaden E2E support.

## D. Success Criteria

Acceptance requires all of the following observable evidence:

- Workflow inspection shows `ubuntu-latest` and `macos-latest` in one quality matrix and no change to existing triggers.
- Both matrix entries resolve the shared workflow declaration to Bun `1.3.0`.
- A successful CI run shows, on each OS and in order:
  1. `bun install --frozen-lockfile` from `installer`;
  2. `bun run bundle-template` from `installer`;
  3. `bun test` from the repository root;
  4. `bun run typecheck` from `installer`.
- Existing local verification commands remain the package smoke, suite, and typecheck:
  - `cd installer && bun install --frozen-lockfile`
  - `cd installer && bun run bundle-template`
  - `bun test`
  - `cd installer && bun run typecheck`
- `.github/workflows/e2e.yml` still exposes only `workflow_dispatch`, runs on `ubuntu-latest`, and invokes `./e2e/docker-test.sh`; it is absent from the macOS matrix.
- The documentation identifies the single quality-gate pin and deliberate update procedure, scopes it to that gate, and makes no native Windows or release-publication claim.
- The implementation diff contains no installer source, dependency, lockfile, E2E behavior, release workflow, or unrelated workflow refactor.

Strict TDD remains off for this CI/configuration-only change. Command and CI-run evidence belongs to later apply/verify phases; no test or build execution is part of this design phase.
