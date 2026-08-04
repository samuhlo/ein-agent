status: complete

## // 001. Deterministic shell harness contract
status: complete

- Completed task 1.1: added a real-process Bun fixture for `installer/install.sh` with isolated `PATH`, `HOME`, `TMPDIR`, guarded fake `curl`/`uname`/`chmod`/`mv`, safe publication remapping, URL/path rejection, and temporary-download cleanup assertions.
- Changed files: `tests/install-sh-checksum.test.ts`, `openspec/changes/installer-mandatory-checksum/tasks.md`, this progress record. `installer/install.sh` and `EIN.md` remain unchanged.
- Verification: `bun test tests/install-sh-checksum.test.ts --test-name-pattern='sandbox|fixture'` — 1 pass, 0 fail; unfiltered focused file run also passed.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Initial harness contract run failed with the explicit unimplemented-fixture error before implementation. |
| GREEN | Focused sandbox/fixture run passed after adding the command fixture and real-shell execution. |
| TRIANGULATE | Unfiltered `bun test tests/install-sh-checksum.test.ts` passed; assertions cover both download paths, command order, safe publication, guards, and cleanup. |
| REFACTOR | Removed temporary debug output and retained real `mktemp` plus fixture `TMPDIR`; final focused run passed. |

- Deviations: none; no production code, banner/version work, or unrelated tests were changed.
- Remaining tasks: groups 002–006 require the parent to continue the checksum RED/GREEN behavior work.
- Residual risk: the current production checksum behavior remains optional until later groups modify `installer/install.sh`; this harness intentionally does not assert those scenarios yet.

## // 002. RED checksum-gating scenarios
status: complete

- Completed task 2.1: added independent real-shell cases for checksum download failure, empty/missing selected asset, malformed manifest, duplicate selected asset, digest mismatch, and checksum utility failure; each checks nonzero exit and no `chmod`/`mv`/publication.
- Changed files: `tests/install-sh-checksum.test.ts`, `openspec/changes/installer-mandatory-checksum/tasks.md`, this progress record. No production or banner/version files changed.
- Verification: focused RED command (`bun test tests/install-sh-checksum.test.ts --test-name-pattern='download failure|missing|malformed|duplicate|mismatch|utility'`) — 4 expected failures (download failure, empty, missing, malformed) and 3 baseline passes (duplicate, mismatch, utility); unfiltered file run — 4 failures, 4 passes. The failures are intentionally retained pending groups 003/004.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | New assertions fail against the current optional checksum block; failures occur at the required nonzero-exit assertion while publication is observed. |
| GREEN | Deferred to groups 003/004; no production code was edited in this group. |
| TRIANGULATE | Unfiltered focused file run confirms the existing success harness plus all seven independent scenarios execute through the real shell. |
| REFACTOR | Only fixture input/configuration helpers were extended; no behavior assertions were weakened. |

- Deviations: duplicate, digest-mismatch, and utility-failure cases already fail closed incidentally in the baseline, so they pass before the production gate; they remain explicit regression coverage.
- Remaining tasks: groups 003–006, including production mandatory gate, success/fallback coverage, and later triangulation/refactor.
- Residual risk: production still permits publication when checksum retrieval or selected-asset metadata is unusable until groups 003/004 are applied.

## // 003. Mandatory strict manifest gate
status: complete

- Completed task 3.1: made checksum retrieval mandatory, rejected empty manifests, validated every non-empty line against the complete GNU SHA-256 shape, and required exactly one selected-asset entry before digest verification.
- Changed files: `installer/install.sh`, `openspec/changes/installer-mandatory-checksum/tasks.md`, this progress record. No tests, banner/version files, `EIN.md`, or unrelated code changed.
- Verification: RED manifest command produced 4 expected failures before the production edit; GREEN focused command (`bun test tests/install-sh-checksum.test.ts --test-name-pattern='download failure|missing|malformed|duplicate'`) passed 5/5. Final sandbox + manifest command passed 6/6; `bash -n installer/install.sh` and `cd installer && bun run typecheck` passed.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Existing download-failure, empty, missing-asset, and malformed-manifest cases failed against the optional baseline; duplicate remained a baseline incidental pass. |
| GREEN | The checksum block now fails closed on retrieval, empty/unusable content, malformed non-empty lines, and selected-asset cardinality; all five focused manifest cases pass. |
| TRIANGULATE | The existing valid sandbox case also passes, confirming the unchanged successful publication path remains reachable after strict parsing. |
| REFACTOR | No behavior or test refactor performed; digest utility selection, mismatch handling, and ordering work remain for group 004. |

- Deviations: none; only the checksum block was edited as assigned.
- Remaining tasks: groups 004–006 (digest portability/order, success/fallback coverage, triangulation/refactor).
- Residual risk: mismatch and checksum-utility behavior are intentionally deferred to group 004; no fallback or broader installer changes were introduced.

## // 004. Portable digest verification and ordering
status: complete

- Completed task 4.1: selected `sha256sum` explicitly, used `shasum -a 256` only when unavailable, rejected missing/failing/unusable utility output, compared the captured digest exactly, and kept verification before installation or handoff.
- Changed files: `installer/install.sh`, `tests/install-sh-checksum.test.ts`, `openspec/changes/installer-mandatory-checksum/tasks.md`, this progress record. `EIN.md`, banner/version files, and unrelated installer code remain untouched.
- Verification: focused mismatch/utility/fallback/order command — 5 pass; full `bun test tests/install-sh-checksum.test.ts` — 10 pass; `bash -n installer/install.sh` — pass; `cd installer && bun run typecheck` — pass.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Added an unusable-output fixture; baseline returned zero and published despite digest-only utility output. |
| GREEN | The checksum block now checks utility availability/status, validates one complete output line, and rejects unusable output; mismatch, utility failure, fallback, and ordering cases pass. |
| TRIANGULATE | Controlled fallback removes host `sha256sum`, asserts `shasum -a 256`, and confirms `shasum` precedes `chmod`/`mv`; the complete checksum fixture file passes. |
| REFACTOR | Kept the production edit limited to the checksum block and test additions limited to explicit utility/fallback observations; no broad shell refactor. |

- Deviations: added focused unusable-output and fallback fixture coverage because group 004 requires those paths; group 005/006 remain unticked and pending.
- Remaining tasks: groups 005–006 (verified-success/cleanup coverage as separately tracked, then triangulation/refactor).
- Residual risk: absence of both checksum utilities is fail-closed in production but does not yet have a dedicated committed fixture; later triangulation should add it without changing install behavior.

## // 005. GREEN success and portability coverage
status: complete

- Completed task 5.1: added a controlled `sha256sum` success fixture and strengthened success/fallback assertions for zero exit, verification before `chmod`/`mv`, preserved non-TTY handoff output, publication, and temporary download cleanup.
- Changed files: `tests/install-sh-checksum.test.ts`, `openspec/changes/installer-mandatory-checksum/tasks.md`, this progress record. No production, banner/version, `EIN.md`, or unrelated files changed.
- Verification: `bun test tests/install-sh-checksum.test.ts --test-name-pattern='verified success|fallback|cleanup'` — RED: 1 expected failure before success fixture support; GREEN: 2 pass, 0 fail after fixture support.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Verified-success assertions failed because the controlled `sha256sum` event was not yet emitted. |
| GREEN | Added the minimal fake `sha256sum` success command; verified-success and fallback tests pass. |
| TRIANGULATE | Deferred to group 006; this group retained the focused success and fallback boundary only. |
| REFACTOR | No broad refactor; existing fixture structure and explicit observations remain unchanged. |

- Deviations: none; `installer/install.sh` was not edited.
- Remaining tasks: group 006 triangulation/refactor.
- Residual risk: the focused test file still lacks dedicated both-utilities-absent coverage, tracked for group 006.

## // 006. Triangulate and refactor the focused slice
status: complete

- Completed task 6.1: triangulated exact GNU separators/64-character lowercase digest/asset whitespace, terminal-newline acceptance, duplicate and invalid cases, utility failure/unusable output, fallback invocation, both-utilities absence, ordering, cleanup, and sandbox guards.
- Added the explicitly missing both-utilities-absent fixture by sanitizing each host PATH directory for both checksum commands; no production code changed.
- Refactored only local test duplication into explicit sandbox-download and successful temporary-directory cleanup helpers; failure cleanup expectations remain distinct.
- Changed files: `tests/install-sh-checksum.test.ts`, `openspec/changes/installer-mandatory-checksum/tasks.md`, this progress record. `installer/install.sh`, `EIN.md`, banner/version files, and unrelated tests remain untouched by this group.
- Verification: `bun test tests/install-sh-checksum.test.ts tests/install-sh-wsl.test.ts tests/release-asset-contract.test.ts && cd installer && bun run typecheck` — 27 pass, 0 fail; typecheck passed.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Added the both-utilities-absent regression first; it failed because the unsanitized host PATH still found `sha256sum` and published. |
| GREEN | Added controlled PATH removal for both checksum utilities plus exact-format and terminal-newline fixtures; focused slice passed 16/16. |
| TRIANGULATE | Final command passed checksum, WSL, and release-contract tests: 27/27; assertions cover ordering, cleanup, guards, fallback args, and failure publication absence. |
| REFACTOR | Extracted only local sandbox-download and successful temp-directory cleanup observations; no broad shell-runner refactor or weakened assertions. |

- Deviations: none; no production build or unrelated code was touched.
- Remaining tasks: none; all task checkboxes are complete.
- Residual risks: none identified within this focused slice; independent verify remains the final freshness gate.
