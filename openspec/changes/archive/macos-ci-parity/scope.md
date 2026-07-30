# macOS CI parity — scope

Implement roadmap slice 01 as one bounded SDD and one PR: extend the main quality gate from Ubuntu-only execution to equivalent Ubuntu and macOS coverage, while keeping Docker E2E isolated to Ubuntu and replacing the indefinitely floating Bun version with a controlled, documented policy.

## Scope packet

```yaml
scope: Implement slice 01 from docs/quality-roadmap/01-macos-ci-parity.md by running the main template-bundle, Bun test, and installer typecheck quality checks equivalently on Ubuntu and macOS. Keep Docker E2E Ubuntu-only and define a controlled, reproducible Bun-version policy instead of an indefinitely floating version.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Current baseline

- `.github/workflows/ci.yml` has one `ubuntu-latest` quality job.
- That job installs installer dependencies with the frozen `installer/bun.lock`, bundles the embedded template, runs the repository Bun tests, and typechecks the installer.
- The quality workflow currently requests `bun-version: latest`.
- `.github/workflows/e2e.yml` is a manual Docker-based installer check on `ubuntu-latest`; it is not part of the cross-platform quality matrix.
- `installer/package.json` preserves Bun as the package manager and script runner, with TypeScript used separately for typechecking.

## In scope

1. Make the main CI quality job execute on both `ubuntu-latest` and `macos-latest`.
2. Run the same quality sequence on each OS:
   - frozen installer dependency installation;
   - template bundle/package smoke;
   - Bun test suite;
   - installer typecheck.
3. Preserve existing Ubuntu quality behavior while adding macOS coverage.
4. Make any unavoidable platform-specific workflow differences explicit and narrowly scoped.
5. Replace the floating `latest` Bun selection used by the quality gate with a controlled version or version-family policy that updates deliberately.
6. Document the Bun-version policy and how maintainers update it.
7. Confirm that Docker E2E remains manual and Ubuntu-only without broadening or refactoring it.

## Out of scope

- Native Windows support or any Windows support claim.
- Running Docker E2E on macOS.
- Changing Docker E2E behavior beyond preserving its current Ubuntu-only boundary.
- Application or installer behavior changes unrelated to CI parity.
- Package-manager migration, dependency modernization, or lockfile-format migration.
- Unrelated GitHub Actions cleanup or workflow refactoring.
- Release publication.
- Review implementation, Git receipts, or delivery actions.
- OpenSpec canonical synchronization outside this change artifact.
- Modifying user changes outside this slice.

## Expected change surface

Primary implementation and review should remain limited to:

- `.github/workflows/ci.yml` for the cross-platform quality matrix and controlled Bun setup;
- CI/version-policy documentation, preferably an existing CI-related document if one is suitable;
- `.github/workflows/e2e.yml` only if a minimal explicit Bun-policy alignment or Ubuntu-only clarification is required by the selected policy.

`installer/package.json` and `installer/bun.lock` are reference inputs, not expected dependency-change targets. Any expansion beyond this surface requires justification against the slice constraints.

## Acceptance criteria

- [ ] The main quality workflow schedules both `ubuntu-latest` and `macos-latest` jobs.
- [ ] Both OS jobs install from the existing frozen installer lockfile.
- [ ] Both OS jobs run the template bundle/package smoke.
- [ ] Both OS jobs run the same Bun test command.
- [ ] Both OS jobs run the installer typecheck.
- [ ] Platform-specific differences, if required, are explicit and do not weaken either platform's checks.
- [ ] Existing Ubuntu quality behavior is preserved.
- [ ] Docker E2E remains manual, unchanged in purpose, and scheduled only on Ubuntu.
- [ ] CI no longer depends on an indefinitely floating Bun version for the scoped quality gate.
- [ ] The Bun version or version-family policy is reproducible, documented, and updated deliberately.
- [ ] Documentation makes no native Windows support claim.

## Verification boundary

Strict TDD is off because this is a CI/configuration slice. The apply phase may inspect workflow syntax and supporting tests, but execution evidence belongs to verify. Verify should establish:

| Check | Expected evidence |
| --- | --- |
| Quality matrix | Ubuntu and macOS each execute bundle, Bun tests, and installer typecheck. |
| Ubuntu regression | Existing Ubuntu commands and frozen-lockfile behavior remain represented. |
| Platform differences | Any conditional step is visible, justified, and minimal. |
| Docker boundary | E2E remains `ubuntu-latest` and is not added to the macOS matrix. |
| Bun policy | Workflow resolution matches the documented controlled policy. |
| Existing suite | Relevant current tests complete in the verify phase. |

## Risks and guardrails

- macOS runners may expose shell, filesystem, archive, or executable-permission assumptions hidden by Ubuntu. Fix only what is necessary for equivalent checks; do not turn this slice into a general portability refactor.
- A version family can still drift if its resolution is not sufficiently constrained. The map/design phase must choose a policy that is both reproducible enough for CI and practical to update deliberately.
- Matrix restructuring can accidentally alter the established Ubuntu sequence. Keep command order and working directories equivalent unless evidence requires a targeted difference.
- Do not infer native Windows support from macOS parity.

## Delivery shape

One future SDD and one PR. If implementation requires unrelated workflow redesign, dependency changes, Windows work, release work, or broader installer portability changes, split those into separate future changes rather than expanding this scope.
