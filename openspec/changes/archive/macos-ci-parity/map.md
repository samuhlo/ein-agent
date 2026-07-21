# Map — macOS CI parity

status: partial
scope_status: bounded
change: macos-ci-parity
phase: map
skill_resolution: paths-injected
budget_exceeded: true

## Scope and implementation surface

The slice is bounded to CI parity, Bun policy documentation, and preservation of the Docker boundary. No application, installer dependency, lockfile, Windows, release, or Docker-E2E behavior change belongs here.

### Primary files

- `.github/workflows/ci.yml` — the sole main quality gate. Its `test` job currently runs only on `ubuntu-latest`; convert its runner selection into a two-value Ubuntu/macOS matrix while preserving the existing step order and working directories.
- CI/version-policy documentation — no dedicated CI-policy document was found in the bounded docs read. Add a narrowly scoped policy document or an appropriate concise section in an existing CI-facing document; it must state the exact controlled Bun version/version-family, why it is controlled, and the deliberate update procedure.
- `.github/workflows/e2e.yml` — retain `workflow_dispatch`, the separate `ubuntu-install` job, `runs-on: ubuntu-latest`, and `./e2e/docker-test.sh`. Touch only if policy alignment requires replacing its floating Bun selector or clarifying the Ubuntu-only boundary.

### Exact quality sequence to preserve on *each* matrix runner

From `.github/workflows/ci.yml`:

1. `actions/checkout@v5`.
2. `oven-sh/setup-bun@v2` with a controlled `bun-version` (currently `latest`).
3. In `installer`: `bun install --frozen-lockfile`.
4. In `installer`: `bun run bundle-template`.
5. Repository root: `bun test`.
6. In `installer`: `bun run typecheck`.

The installer package defines `bundle-template` as `bun run scripts/bundle-template.ts` and `typecheck` as `tsc --noEmit`. The frozen `installer/bun.lock` resolves the installer dependencies and must remain an input, not a change target.

## Bun-version sources and policy decision point

All three checked-in GitHub workflows currently use `oven-sh/setup-bun@v2` with `bun-version: latest`:

- `.github/workflows/ci.yml` — in scope; must stop floating.
- `.github/workflows/e2e.yml` — Ubuntu-only/manual; align only if the selected documented policy is meant to govern all CI workflows.
- `.github/workflows/installer-release.yml` — release workflow and outside this slice. Do not alter it without an explicit scope expansion; document any intentional divergence if the new policy wording could otherwise imply global coverage.

The repository README states Bun `≥ 1.3` as an installer requirement, while `installer/package.json` uses `@types/bun: ^1.3.0`; neither pins the CI runtime. Design must choose one explicit policy (preferably an exact Bun release for reproducibility, or a narrowly bounded family only if its update mechanism is documented) and make its update location/procedure unambiguous. The version policy must not imply native Windows support.

## Platform-sensitive behavior and risks

- `installer/scripts/bundle-template.ts` uses Node-compatible filesystem/path APIs plus `Bun.spawn(["tar", "-czf", OUT, "."])` from a temporary staging directory. `tar` availability and option compatibility are the direct macOS-sensitive dependency; do not pre-emptively rewrite it. The matrix should expose any actual failure.
- The bundle creates `installer/src/assets/` because the tarball is gitignored, then emits a generated archive consumed by tests. Therefore the bundle step must remain before `bun test` on both platforms.
- The test suite is discovered by root-level `bun test`; bounded inspection shows many `tests/*.test.ts` files importing `bun:test`. No test source change is expected; the entire existing suite is the parity evidence.
- The E2E script uses Bash, `uname -m`, Docker, Linux target naming, and an Ubuntu container. It is deliberately platform-specific and must remain outside the matrix.
- Matrix restructuring can accidentally change Ubuntu semantics through a changed command, working directory, or step order. Keep conditionals absent unless a concrete macOS-only failure proves one necessary; any conditional must be visible and narrowly scoped.

## Blast radius

- **Direct:** the quality workflow runs twice per qualifying push/PR, increasing CI time and macOS runner usage while adding macOS failure signal.
- **Indirect:** changes to the selected Bun runtime may reveal runtime/API, lockfile-install, archive, permissions, or shell assumptions in the bundle and existing Bun tests.
- **Excluded:** Docker E2E scheduling/purpose, installer dependencies and lockfile, release publishing, native Windows support, and installer behavior.

## Verification handoff

Verify should inspect workflow syntax and CI run evidence that both matrix entries execute all four quality commands in the listed order; confirm Ubuntu continues to use the frozen lockfile; confirm E2E remains manual and `ubuntu-latest`; and compare the workflow selector with the documented Bun policy. Do not claim suite or CI success from this map phase.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/bun/SKILL.md", lines: 172, estimated_tokens: 1850 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/github-workflow/SKILL.md", lines: 250, estimated_tokens: 2700 }
    - { path: "openspec/changes/macos-ci-parity/scope.md", lines: 88, estimated_tokens: 1300 }
    - { path: ".github/workflows/ci.yml", lines: 38, estimated_tokens: 330 }
    - { path: ".github/workflows/e2e.yml", lines: 23, estimated_tokens: 210 }
    - { path: "installer/package.json", lines: 18, estimated_tokens: 170 }
    - { path: "docs/quality-roadmap/01-macos-ci-parity.md", lines: 47, estimated_tokens: 360 }
    - { path: "README.md", lines: 300, estimated_tokens: 6100 }
    - { path: ".github/** (Bun setup search)", lines: 6, estimated_tokens: 80 }
    - { path: "installer/scripts/bundle-template.ts", lines: 156, estimated_tokens: 2100 }
    - { path: "e2e/docker-test.sh", lines: 56, estimated_tokens: 620 }
    - { path: ".github/workflows/installer-release.yml", lines: 50, estimated_tokens: 470 }
    - { path: "tests/** (bun:test search)", lines: 62, estimated_tokens: 1150 }
    - { path: "installer/** (bun:test search)", lines: 0, estimated_tokens: 20 }
    - { path: "docs/** (CI-policy search)", lines: 100, estimated_tokens: 1850 }
    - { path: "installer/bun.lock (lines 1-40)", lines: 40, estimated_tokens: 680 }
  webfetch_used: false
  budget_consumed: { tokens: 19990, reads: 16 }

The token budget was exceeded during bounded context reads (principally the injected skills and README/docs output). This artifact is partial only in the budget-contract sense; the defined workflow/config surface and its direct dependencies were mapped. No tests, builds, or source/configuration edits were run or made.

Next phase: `sdd-design`.
