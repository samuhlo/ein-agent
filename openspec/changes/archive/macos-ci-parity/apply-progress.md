status: complete

# Apply progress — macOS CI parity

## // 001. Main quality-gate parity and scoped policy documentation

Completed tasks:
- [x] 1.1 Shared `test` matrix now schedules `ubuntu-latest` and `macos-latest` from one job, with workflow-level `BUN_VERSION: "1.3.0"` consumed by the existing Bun setup step.
- [x] 1.2 README documents the main-quality-gate-only pin and one-value update procedure; roadmap records implementation pending verification while keeping evidence unchecked.

Files changed:
- `.github/workflows/ci.yml`
- `README.md`
- `docs/quality-roadmap/01-macos-ci-parity.md`
- `openspec/changes/macos-ci-parity/tasks.md`
- `openspec/changes/macos-ci-parity/apply-progress.md`

Verification:
- Passed: `git diff --check -- .github/workflows/ci.yml && sed -n '/^jobs:/,$p' .github/workflows/ci.yml`
- Passed: `git diff --check -- README.md docs/quality-roadmap/01-macos-ci-parity.md && grep -nE 'BUN_VERSION|1\.3\.0|macOS|Ubuntu|verif|pend' README.md docs/quality-roadmap/01-macos-ci-parity.md .github/workflows/ci.yml`
- Not run by design: suite, installer typecheck, template packaging, and GitHub Actions matrix execution; reserved for `sdd-verify`.

TDD: off.
Deviations: none.
Residual risk: macOS execution has not yet been observed in GitHub Actions.
Remaining tasks: none in group `// 001`; proceed to `sdd-verify`.
