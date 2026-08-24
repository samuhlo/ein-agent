status: complete

## Completed
Group 1.1 is complete. The workflow now classifies canonical final/alpha tags once for push and dispatch, rejects malformed/unsupported prereleases, gates tag/version/changelog coherence before build, and passes `--prerelease` only for alpha publication. The six published assets, title/notes, main-tip gate, and `allow_non_main_tag=true` escape hatch remain intact. Later groups remain untouched.

## Files changed
`.github/workflows/installer-release.yml`
`tests/release-asset-contract.test.ts`
`installer/install.sh`
`tests/install-sh-checksum.test.ts`
`installer/src/main.ts`
`installer/src/core/release-types.ts`
`installer/src/core/release-resolver.ts`
`tests/installer-runtime-menu.test.ts`
`installer/src/cli/install.ts`
`installer/src/core/release-channel-preference.ts`
`tests/release-update-contract.test.ts`
`tests/release-update-cli.test.ts`
`installer/package.json`
`installer/src/core/version.ts`
`CHANGELOG.md`
`tests/readme-release-ia.test.ts`
`tests/install-plan.test.ts`
`tests/updater-cli-entrypoints.test.ts`
`tests/installer-backup.test.ts`
`openspec/changes/publish-installer-alpha/tasks.md`
`openspec/changes/publish-installer-alpha/apply-progress.md`

## TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Shared push/dispatch canonical tag classification | New resolver contract failed: alpha was rejected and invalid push tags were accepted. | Native Bash classifier passed final/alpha and rejected malformed, leading-zero, beta, and rc vectors. | Added build-metadata vectors and exercised both event paths. | Simplified prerelease branching to one `case` classifier without changing outcomes. | `bun test tests/release-asset-contract.test.ts` — 13 pass |
| Pre-build release metadata coherence | New gate contract failed because no coherence step existed. | Gate passed matching package/runtime/changelog fixtures and runs before build. | Fixture runs rejected each individual pointer/changelog disagreement. | Kept the gate at the Actions boundary with no cross-runtime parser. | `bun test tests/release-asset-contract.test.ts` — 13 pass |
| Alpha-only GitHub prerelease metadata with stable publication preserved | New publication contract failed because no channel output or prerelease flag existed. | Fake `gh` runs proved stable omits and alpha includes `--prerelease`. | Asset parser and execution fixtures preserved exactly six assets; guard ordering/escape hatch assertions passed. | Replaced nounset-sensitive empty-array expansion with a bounded scalar flag. | `bun test tests/release-asset-contract.test.ts` — 13 pass |

## Verification
Focused gate: `bun test tests/release-asset-contract.test.ts` — 13 tests passed, 0 failed, 136 assertions. No production build, tag, GitHub publication, or `gh` network call was run.

## Deviations and residual risk
No design deviation. The workflow still relies on runner-native Bash, `jq`, `sed`, and `awk`; the contract tests execute extracted shell steps with local fixtures. Pointer synchronization to `0.82.0-alpha.1` belongs to group 5.1 and was not started.

## Group 2.1 — Exact bootstrap asset and checksum acquisition

Group status: complete. `install.sh` now validates `--release-channel`/`--release-tag` as one contract, accepts canonical finals and alpha tags, rejects partial/unsupported/malformed selectors before curl, binds binary and manifest to one exact release URL, and preserves latest stable defaults. Verified assets hand off exact Pi argv; platform, WSL, TTY, cleanup, and checksum guards remain unchanged.

### TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Inseparable release selector validation | New process fixtures failed: arguments were ignored, so exact selection succeeded unexpectedly. | Both-or-neither, final/alpha acceptance, malformed/`beta`/`rc` rejection passed before curl. | Covered stable no-input, exact alpha/final selectors, and checksum failure vectors. | Centralized native Bash selector parsing and scoped loop variables. | `bun test tests/install-sh-checksum.test.ts` — 22 pass |
| Exact asset/manifest acquisition and checksum ordering | Exact-base fixture failed because bootstrap used `/releases/latest/download`. | Binary and manifest used `/releases/download/<tag>/`; checksum completed before chmod/move. | Wrong entry, duplicate entry, digest mismatch, utility failure/fallback, and no-input latest path passed. | Kept one computed base URL and existing manifest/checksum guards. | `bun test tests/install-sh-checksum.test.ts` — 22 pass |
| Explicit Pi-only handoff with stable behavior preserved | Exact argv assertion failed because non-TTY output remained generic. | Verified explicit runs emit `install --runtime pi --release-channel <channel> --release-tag <tag>`; no-input remains generic. | Alpha and stable exact handoffs plus existing cleanup/WSL-compatible branches passed. | Reused one handoff argv array for TTY, `/dev/tty`, and manual branches. | `bun test tests/install-sh-checksum.test.ts` — 22 pass |

## Verification
Group 2.1 focused gate: `bun test tests/install-sh-checksum.test.ts` — 22 tests passed, 0 failed, 310 assertions. `bash -n installer/install.sh` passed. No production build, tag, publication, network call, or real installation was run.

## Deviations and residual risk
No design deviation. Later groups 4.1–6.1 remain pending. Pi preference persistence belongs to group 4.1.

## Skill fit
Release, Bun, Ein discipline, and architecture rules applied. Next.js and Vitest skills were read but are not applicable to this shell/Bun test slice.

## Group 3.1 — Installer binary admission of the release contract

Group status: complete. The installer now admits a complete canonical channel/tag contract before `runInstall` can build a plan, defaults absent input to stable, restricts alpha to Pi, and requires the selected SemVer to equal the running binary version. Existing resolver classification remains the vocabulary authority; no mutable work runs for rejected input.

### TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Complete channel/tag admission before planning or mutation | Focused test failed at import because `resolveReleaseContract` was absent. | Invalid partial/malformed/unsupported/mismatched/stale/targeted vectors and pre-banner child rejection passed. | Exact final dry-run reached the existing terminal branch; temp HOME remained untouched on rejection. | Kept parsing at the CLI edge and classification in the existing resolver/types surface. | `bun test tests/installer-runtime-menu.test.ts` — 39 pass |
| Closed SemVer/channel vocabulary and running-version agreement | Focused RED failed before the resolver contract existed. | Leading-zero, beta, rc, channel mismatch, and compiled-version mismatch vectors rejected; exact final and alpha/Pi fixtures admitted. | No-input stable, exact final, alpha Pi, Claude/both alpha, and malformed vectors exercised together. | Reused `normalizeReleaseTag`/`parseSemVer`; no process-global channel state or new parser/store abstraction. | `bun test tests/installer-runtime-menu.test.ts` — 39 pass |

## Verification
Group 3.1 focused gate: `bun test tests/installer-runtime-menu.test.ts` — 39 tests passed, 0 failed, 172 assertions. `bun run typecheck` and `cd installer && bun run typecheck` passed. No production build, tag, publication, network call, or real installation was run.

## Deviations and residual risk
No design deviation. The runtime version is compared to the complete normalized SemVer in the tag; the later pointer synchronization group must make the released alpha binary carry that same prerelease version. Groups 4.1–6.1 remain pending.

## Group 4.1 — Pi installation preference commit and read-back

Group status: complete. `pi.write-install-marker` now persists the parsed channel under the resolved managed Pi `agentDir`, requires an explicit matching post-write read-back, and passes that read-back to the marker. Write/read/mismatch failures return before marker, doctor, launcher, or promotion; existing journal execution remains the recovery evidence boundary. Legacy managed Pi targeting and non-target byte isolation are preserved.

### TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Resolved channel reaches the Pi installation commit | Focused runtime tests observed stable/defaulted persistence and a hard-coded stable marker for alpha. | Parsed `--release-channel`, committed through the existing preference primitive, and wrote alpha from matching read-back. | Covered default stable, explicit alpha, managed legacy context, marker value, and vanilla/Claude/client byte preservation. | Kept destination resolution in `paths.ts`, preference I/O in the existing primitive, and the commit at `pi.write-install-marker`. | `bun test tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts` — 88 pass |
| Persistence must be explicit and readable before downstream steps | RED was covered by the same focused failure: no preference write/read gate existed and marker still ran. | Unavailable write, unavailable/mismatched read-back, and channel mismatch all fail closed before marker. | Atomic mismatch and pre-rename prior-byte preservation remain covered by preference contract fixtures; later update/advisor reads resolve alpha. | Added injectable preference effects without changing `release-channel-preference.ts` or journal semantics. | `bun test tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts` — 88 pass |

## Verification
Focused gate: `bun test tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts` — 88 tests passed, 0 failed, 484 assertions. Typechecks: `bun run typecheck` and `(cd installer && bun run typecheck)` passed. `git diff --check` passed for the scoped files. No production build, tag, publication, network call, or real installation was run.

## Deviations and residual risk
No design deviation. `release-channel-preference.ts` and `paths.ts` were reused unchanged. Groups 5.1 and 6.1 remain pending; the released alpha pointers and full verification ladder are not yet done.

## Group 5.1 — Synchronized `0.82.0-alpha.1` release pointers

Group status: complete. Synchronized `installer/package.json`, `INSTALLER_VERSION`, and the leading changelog heading to `0.82.0-alpha.1`; no prior release history was removed. The agreement assertion remains value-independent and now accepts canonical prerelease SemVer required by this release.

### TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Three authorized release pointers agree on the alpha SemVer and changelog entry leads | After changing only `version.ts`, focused agreement test failed (12 pass, 1 fail) on intentional pointer drift. | Synchronized package metadata, runtime version, and leading changelog heading; focused contract passed (13 pass). | Re-ran pointer agreement plus metadata-coherence vectors: alpha shape accepted and each pointer mismatch rejected. | Kept the generic equality contract; expanded only its shape matcher from final-only SemVer to canonical prerelease SemVer. | `bun test tests/release-asset-contract.test.ts` — 13 pass, 0 fail, 136 assertions |

## Verification
Focused gate: `bun test tests/release-asset-contract.test.ts` — 13 tests passed, 0 failed, 136 assertions. Installer typecheck: `cd installer && bun run typecheck` passed. `git diff --check` passed for the scoped release files. No production build, tag, publication, network call, or real installation was run.

## Deviations and residual risk
The existing pointer-shape assertion was final-only and rejected the required alpha; its matcher was extended to canonical SemVer prerelease shape without adding a literal version pin or weakening pointer equality. Group 6.1 remains pending.

## Group 6.1 — Focused, offline, and full verification preparation

Group status: blocked. Ran the exact verification ladder from tasks. The focused stage stopped with two failures in `tests/installer-runtime-menu.test.ts`; the short-circuit therefore did not run either typecheck or the full repository suite.

### Consolidated verification evidence
- Prior RED/GREEN/TRIANGULATE/REFACTOR evidence for groups 1.1–5.1 is preserved above.
- Focused command: `bun test tests/release-asset-contract.test.ts tests/install-sh-checksum.test.ts tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts` — 121 passed, 2 failed.
- Both failures use `INSTALLER_VERSION` (`0.82.0-alpha.1`) to construct a stable exact tag; the resolver correctly rejects that alpha tag for `stable` with `channel-tag-mismatch`.
- The same stale stable-tag fixture causes the real-main dry-run assertion to exit 1. The owning release-contract test fixture must be corrected before rerunning this ladder.
- No production build, tag, publication, network call, or real installation was run.

### Remaining work
Resolve the two pre-existing/group-overlap test expectations for a stable final tag, then rerun the exact ladder. Group 6.1 remains incomplete; no checkbox was ticked.

### Retry — group 6.1
Retry status: blocked. Corrected only the two stale runtime-menu fixtures: the pure resolver case now uses explicit stable `0.82.0` values, while the real binary case now uses the current alpha channel/tag. Production validation was unchanged.

#### TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Stable and alpha handoffs use matching channel/tag versions | Preserved prior exact-ladder RED: two stale stable fixtures failed with `channel-tag-mismatch`. | Explicit stable fixture and alpha main handoff passed. | Full focused release/runtime contract set passed together: 123 tests, 0 failures. | Test-only fixture correction; no production code or validation weakening. | `bun test tests/release-asset-contract.test.ts tests/install-sh-checksum.test.ts tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts` — 123 pass |

#### Verification
- Exact focused stage: 123 passed, 0 failed.
- `bun run typecheck`: passed.
- `(cd installer && bun run typecheck)`: passed.
- Final `bun test`: 2410 passed, 4 failed; the ladder stopped at the full-suite gate.

#### Exact blockers
- `tests/readme-release-ia.test.ts`: release coherence expects `0.82.0-alpha.1`, README changelog still reports `0.81.0`.
- `tests/install-plan.test.ts`: Pi handler capability test reports `Pi installation failed at pi.write-install-marker`.
- `tests/updater-cli-entrypoints.test.ts` (2 tests): final-only SemVer assertions reject `0.82.0-alpha.1` for installer/template version output.

Group 6.1 remains incomplete and its checkbox stays unchecked; no production build, tag, publication, network call, or real installation was run.

## Group 6.1 — Final remediation and verification

Group status: complete. Corrected the four recorded full-suite blockers with test/fixture-only changes; production code and validation were untouched. The README keeps its intentional stable `releases/latest` pointer while the changelog coherence parser now admits the canonical alpha heading.

### TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| README release coherence accepts `0.82.0-alpha.1` | Three-file RED had 1 README failure: final-only changelog parsing read `0.81.0`. | Prerelease-aware changelog fixture parser passes the alpha pointer agreement. | README contract remained green, including its release pointer and no-version guard. | Test-only regex extension; no production validation or README pointer weakening. | `bun test tests/readme-release-ia.test.ts tests/install-plan.test.ts tests/updater-cli-entrypoints.test.ts` — 27 pass |
| Pi handler capability fixture reaches marker after explicit preference read-back | Three-file RED reported `Pi installation failed at pi.write-install-marker`. | Fixture supplies matching stable preference write/read-back effects, preserving the production fail-closed boundary. | Handler lifecycle and promotion assertions pass with no real filesystem preference mutation. | Fixture-only capability correction; no installer code changed. | `bun test tests/readme-release-ia.test.ts tests/install-plan.test.ts tests/updater-cli-entrypoints.test.ts` — 27 pass |
| Updater identity assertions accept prerelease SemVer | Three-file RED had two final-only SemVer assertion failures for installer/template output. | Test matcher admits canonical prerelease/build metadata while retaining labelled-line assertions. | Real `main.ts` `--version`, Linux/Darwin identity, and build entrypoint checks pass. | Matcher-only fixture update; production version output remains unchanged. | `bun test tests/readme-release-ia.test.ts tests/install-plan.test.ts tests/updater-cli-entrypoints.test.ts` — 27 pass |

### Verification
- GREEN focused command: 27 passed, 0 failed, 473 assertions.
- `git diff --check` passed for the scoped fixture/test edits.
- Exact ladder passed: focused release contracts 123 passed; `bun run typecheck` passed; `(cd installer && bun run typecheck)` passed; full suite 2414 passed, 0 failed, 10091 assertions.
- No production build, tag, publication, network call, or real installation was run.

### Deviations and residual risks
No design deviation. The four blockers were stale documentation/test fixtures only; no production implementation defect was found. Group 6.1 and the full apply are complete.

## Verification remediation — manifest-backup fixture isolation

Remediation status: complete. The 35 failures were stale fixture state, not shared test ordering or a production backup defect. A prior interrupted run left the test-owned `omarchy-target` directory at mode `000`; every later `beforeEach` then failed while removing the persistent temp root. Cleanup now restores owner access on that test-owned protected tree before removing the root, and `afterAll` reuses the same cleanup path. Assertions and manifest-backup production code are unchanged.

### TDD Cycle Evidence
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Manifest-backup fixtures recover from a stale protected temp tree | Focused run reproduced 35/35 failures at `seedAgentDir`: `EACCES` removing the persisted mode-`000` `omarchy-target`. | The fixture cleanup restored owner access before recursive removal; all 34 named backup behaviors passed. | The full 173-file suite passed, ruling out order pollution and exercising the repaired fixture with repository concurrency. | Extracted one cleanup helper and reused it from setup and teardown; no assertion or production behavior changed. | `bun test tests/installer-backup.test.ts` — 34 pass, 0 fail, 287 assertions |

### Verification
- Focused GREEN: `bun test tests/installer-backup.test.ts` — 34 passed, 0 failed.
- Full suite: `bun test` — 2414 passed, 0 failed, 10091 assertions.
- Root `bun run typecheck` passed (invoked twice); `(cd installer && bun run typecheck)` passed.
- No build, publish, tag, install, commit, or delivery action was run.

### Deviations and residual risks
No design deviation and no production backup defect found. This test-source mutation invalidates the prior failing `verify-report.md`; verify and close remain pending fresh verification.
