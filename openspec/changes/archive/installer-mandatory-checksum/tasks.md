# Tasks — installer-mandatory-checksum

status: ready
blocked_by: none

Scope exclusions preserved: no banner/version fix, checksum bypass, compiled updater or `installer/src/core/checksum.ts`, release workflow or URL redesign, symlink/tar/archive/CI/E2E/documentation/versioning changes, broad shell-runner refactors, or unrelated audit findings. Existing WSL and release-asset contract tests remain unchanged.

## // 001. Deterministic shell harness contract

status: pending
files: `tests/install-sh-checksum.test.ts`
production-files: none (test-only)

- [x] 1.1 Add fixtures to `tests/install-sh-checksum.test.ts` that execute the real `installer/install.sh` with temporary `PATH`, fake `curl`/`uname`/`chmod`/`mv`, temporary `HOME` and `TMPDIR`, and URL/path guards rejecting network or real installation access.
  - skills: `ein-discipline`, `best-practices`
  - why: Before: shell behavior is not isolated; after: the real bootstrap runs entirely inside a disposable command fixture.
  - learn: A command-fixture seam proves shell behavior without GitHub or host installation permissions.
  - architecture: The Bun test owns sandbox setup, fake command behavior, event logging, and cleanup; the bootstrap remains the system under test.
  - avoid: Static source assertions or mocks that never exercise retrieval, parsing, hashing, and publication ordering.
  - verify: `bun test tests/install-sh-checksum.test.ts --test-name-pattern='sandbox|fixture'`

## // 002. RED checksum-gating scenarios

status: complete
files: `tests/install-sh-checksum.test.ts`
production-files: none (test-only)

- [x] 2.1 Add independent failing regression cases in `tests/install-sh-checksum.test.ts` for checksum download failure, empty/missing selected asset, malformed non-empty manifest, duplicate selected asset, digest mismatch, and unavailable/failing checksum utility; assert nonzero exit and no `chmod`/`mv` or destination publication.
  - skills: `ein-discipline`, `best-practices`
  - why: Before: optional verification allows unsafe paths; after: each fail-closed requirement has independent RED evidence.
  - learn: Security tests should assert failure status and absence of dangerous side effects.
  - architecture: Each scenario supplies fixture inputs to the shell boundary and observes process status plus the isolated event log.
  - avoid: One broad parameterized assertion that hides which failure mode regressed.
  - verify: `bun test tests/install-sh-checksum.test.ts --test-name-pattern='download failure|missing|malformed|duplicate|mismatch|utility'` (must fail before production edits)

## // 003. Mandatory strict manifest gate

status: pending
files: `installer/install.sh`
production-files: `installer/install.sh`

- [x] 3.1 Replace only the checksum section of `installer/install.sh` so checksum retrieval is mandatory, empty/unusable downloads fail, every non-empty line matches the complete GNU format, and the selected asset occurs exactly once.
  - skills: `ein-discipline`, `architecture`, `best-practices`
  - why: Before: partial extraction can permit unsigned installation; after: complete manifest validation and exact cardinality fail closed.
  - learn: Validate the complete manifest before selecting a value; duplicate detection is part of the security contract.
  - architecture: `installer/install.sh` owns a local shell parser, independent from the TypeScript parser; platform and install logic stay untouched.
  - avoid: Shared checksum abstractions, partial matches, or checksum bypasses.
  - verify: `bun test tests/install-sh-checksum.test.ts --test-name-pattern='download failure|missing|malformed|duplicate'` (GREEN)

## // 004. Portable digest verification and ordering

status: pending
files: `installer/install.sh`
production-files: `installer/install.sh`

- [x] 4.1 Update the checksum section in `installer/install.sh` from unverified/optional digest handling to explicit `sha256sum` preference with `shasum -a 256` fallback, rejecting absent/failing/unusable tools, comparing the exact digest, and verifying before `pick_install_dir`, `chmod`, `mv`, or either handoff.
  - skills: `ein-discipline`, `architecture`, `best-practices`
  - why: Before: a valid manifest does not guarantee matching bytes or safe ordering; after: digest success gates every publication side effect.
  - learn: Tool fallback must be explicit and fail closed; `set -e` accidents are not a security policy.
  - architecture: The checksum gate ends at successful comparison; installation, cleanup, PATH, WSL, and TTY/TUI boundaries remain unchanged.
  - avoid: Continuing after a failed checksum command, creating the install directory early, or changing URLs and handoff behavior.
  - verify: `bun test tests/install-sh-checksum.test.ts --test-name-pattern='mismatch|utility|fallback|order'`

## // 005. GREEN success and portability coverage

status: pending
files: `tests/install-sh-checksum.test.ts`
production-files: none (test-only)

- [x] 5.1 Add verified-success and controlled `shasum -a 256` fallback coverage to `tests/install-sh-checksum.test.ts`, asserting zero exit, verification before `chmod`/`mv`, preserved success/non-TTY handoff output, and temporary download cleanup.
  - skills: `ein-discipline`, `best-practices`
  - why: Before: failure tests alone cannot prove compatibility; after: success and portability preserve the existing bootstrap behavior.
  - learn: A security gate needs success assertions for both result and irreversible-operation order.
  - architecture: Fake publication commands log events without real destinations; fixture files remain under the temporary root.
  - avoid: Real installation paths, GitHub URLs, host-dependent checksum implementations, or production edits in this group.
  - verify: `bun test tests/install-sh-checksum.test.ts --test-name-pattern='verified success|fallback|cleanup'`

## // 006. Triangulate and refactor the focused slice

status: pending
files: `tests/install-sh-checksum.test.ts`
production-files: none (test-only)

- [x] 6.1 Triangulate `tests/install-sh-checksum.test.ts` across invalid cases, exact GNU formatting and terminal-newline policy, duplicate detection, checksum-tool absence/failure, fallback invocation, event ordering, and sandbox guards; then refactor only duplication that keeps observations explicit.
  - skills: `ein-discipline`, `architecture`, `best-practices`
  - why: Before: one fixture path can create false confidence; after: the focused security slice is broad, green, and still reviewable.
  - learn: Refactor test infrastructure only after behavior is green, retaining assertions that explain the boundary.
  - architecture: Keep one focused test file and one checksum section; preserve existing WSL and release-contract tests as complementary contracts.
  - avoid: Broad shell-runner refactors, unrelated audit changes, or weakening fixtures to make tests pass.
  - verify: `bun test tests/install-sh-checksum.test.ts tests/install-sh-wsl.test.ts tests/release-asset-contract.test.ts && cd installer && bun run typecheck`
