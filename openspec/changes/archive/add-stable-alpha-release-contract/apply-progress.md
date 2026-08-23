status: complete

## Cleaner remediation — pending groups 008–015
Fresh audit found four behavioral gaps: the persisted alpha channel was not wired into the real update transaction; a proven successful recovery could leave a journal that blocks later updates; the fetch path bypassed highest-eligible SemVer selection; and tag validation diverged between selection and artifact identity. Groups 008–015 in `tasks.md` own these corrections. The complexity-only refactor remains out of scope.

## Group 001 — foundational release-channel and artifact-identity contract
Completed tasks 1.1–1.2. The closed `stable`/`alpha` vocabulary, explicit defaulted/unavailable resolution states, pending/verified identity, freshness evidence, and pure canonical identity helpers are in place. No consumer migration or producer/signature work was started.

TDD evidence: RED focused contract imports failed before the exports existed; GREEN added the shared contract; TRIANGULATE covered malformed tags/digests, uppercase digests, missing evidence, and identity disagreement; REFACTOR kept identity pending until verification. Final focused command: `bun test tests/release-update-contract.test.ts` — 11 pass. Relevant typecheck: `cd installer && bun run typecheck` — passed.

## Group 002 — installation-scoped channel preference persistence
Completed tasks 2.1–2.2 only. Added a dedicated installation-path-owned preference module with strict channel serialization, atomic temporary-file replacement, file/directory sync, byte-for-byte read-back, deterministic resolution, and no settings-module dependency. Tests use isolated installation/client trees; client settings remain byte-identical across writes and a fresh Bun process reproduces `alpha`.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|---|
| Absent/defaulted, explicit stable/alpha, and restart reproducibility stay installation-scoped | Missing module import: focused run failed (0 pass, 1 fail). | Added explicit-path read/write boundary and atomic persistence. | Replaced stable with alpha, restarted in a child process, and asserted client settings bytes unchanged; serialization remains separate from resolution/I/O. | `bun test tests/release-update-contract.test.ts` — 14 pass |
| Unsupported, malformed/truncated, and unreadable bytes fail closed without stable fallback | Covered by the same RED import failure. | Read distinguishes absent (`defaulted/stable`) from unreadable and validates persisted JSON/channel vocabulary. | Added unsupported, trailing/truncated, and directory-read cases; invalid state returns `unavailable`. | `bun test tests/release-update-contract.test.ts` — 14 pass |
| Atomic replacement/read-back mismatch is unavailable | Covered by the same RED import failure. | Writes a unique sibling temp file, syncs, renames, syncs the directory, then compares exact bytes. | Injected replacement/read-back disagreement and asserted unavailable; client bytes remained unchanged. | `bun test tests/release-update-contract.test.ts` — 14 pass |

Verification: `bun test tests/release-update-contract.test.ts` — 14 passing tests, 65 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. The first attempted `timeout 120 ...` wrapper was unavailable in this environment; the bounded Bun command then ran directly and passed.

Deviations: none. Group 003 and all later groups remain untouched.

## Group 003 — channel-aware record adaptation and release resolution
Completed tasks 3.1–3.2 only. Provider adaptation now normalizes valid SemVer release tags and carries identity as pending without applying channel policy. Pure resolver policy accepts stable finals, alpha finals, and exact `alpha` prereleases; it rejects drafts, malformed versions, beta/rc/unknown prereleases, and unsupported channels, then selects the highest SemVer. Missing or conflicting candidate identity does not block selection.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN / TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|
| Provider records normalize independently and retain pending identity | Import of missing `adaptReleaseRecord` failed (0 pass, 1 fail). | Added pure provider adaptation; malformed payload/tag and pending identity covered. | `bun test tests/release-update-contract.test.ts` — 18 pass |
| Stable/alpha eligibility rejects unsupported records and selects highest SemVer | Missing `resolveReleases` export failed the same RED run. | Added SemVer normalization/comparison; covered finals, alpha/alpha.N, draft, malformed, beta, rc, unknown, build metadata, and final-over-prerelease precedence. | `bun test tests/release-update-contract.test.ts` — 18 pass |
| Candidate selection remains independent of verified identity | RED import failure preceded the behavior seam. | Pending, absent, and conflicting identity fixtures resolve successfully; policy was centralized in resolver helpers. | `bun test tests/release-update-contract.test.ts` — 18 pass |

Verification: focused contract test — 18 passing tests, 87 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. No build, publication workflow, or group 004 work was started.

Deviations: release fetch boundaries retain their prior stable default while accepting an explicit channel; provider adaptation itself remains policy-free. Identity remains an optional runtime field until group 004 formalizes the pre-commit gate.

Remaining tasks: groups 004–007.

## Group 004 — verified identity propagation and installed marker read-back
Completed tasks 4.1–4.2 only. Acquisition now keeps provider identity pending through selection, derives a verified canonical artifactId from the checked SHA-256, and exposes it on the acquired release. Marker commits derive and optionally agree identity before any marker write, persist stable/alpha channel plus artifactId, and reject missing/conflicting/malformed v2 evidence on read-back; legacy v1 remains identity-less rather than being upgraded implicitly.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|---|
| Pending acquisition upgrades identity only after digest verification | Added acquisition fixture with release metadata lacking identity; focused run failed on missing propagated identity. | Added pending release state and verified digest-derived identity to acquisition result. | Confirmed acquisition succeeds without producer artifact metadata and canonicalizes verified bytes; simplified verified identity type. | `bun test tests/release-update-state-primitives.test.ts` — 6 pass |
| Identity conflicts or missing/malformed tag/digest stop before marker mutation | Added disagreement, malformed tag, missing digest, and untouched-marker assertions; focused run failed before gate. | Added pre-write derivation/agreement gate. | Confirmed marker bytes remain unchanged for blocked commits; stable and alpha both commit with canonical identity. | `bun test tests/release-update-state-primitives.test.ts` — 6 pass |
| Marker read-back preserves verified identity and keeps legacy evidence honest | Added missing/conflicting/malformed/uppercase v2 read-back cases and legacy v1 no-artifact assertion; focused run failed before validation. | Added canonical artifactId persistence and strict v2 semantic validation while retaining v1 read-back. | Confirmed atomic read-back failure remains unavailable; malformed v2 is not downgraded to legacy. | `bun test tests/release-update-state-primitives.test.ts` — 6 pass |

Verification: `bun test tests/release-update-state-primitives.test.ts` — 6 passing tests, 35 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. No build, publication asset, workflow, or group 005 work was started.

Deviations: MarkerV2 identity is represented by the exported `InstalledMarkerV2` refinement in `marker-v2.ts`; the shared legacy type remains source-compatible for existing readers while malformed v2 evidence is rejected at the marker boundary.

Remaining tasks: groups 005–007.

## Group 005 — local alpha transaction and rollback evidence boundary
Completed tasks 5.1–5.2 only. The active transaction journal now records local authority, previous/attempted artifact endpoints, exact managed tree, backup reference, transaction state, and durable rollback outcomes. Successful rollback keeps evidence; failed or malformed recovery stays fail-closed. `runUpdateTransaction` supplies the local evidence without touching remote or secondary journal systems.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Local journal preserves previous-none versus missing, attempted artifact, tree, backup, and state | Added evidence fixtures; focused run: 6 pass, 3 fail. | Added discriminated endpoints and local journal fields. | Covered missing/malformed endpoints and exact path read-back. | Centralized canonical identity and journal validation. | `bun test tests/release-update-state-primitives.test.ts` — 10 pass |
| Rollback attempted, succeeded, and failed outcomes remain distinct and durable | Added success/failure rollback fixtures; RED exposed absent outcomes. | Persisted attempted before restore, then succeeded/failed. | Covered failed restore and retained evidence journals. | Kept legacy cleanup behavior separate from evidence-bearing transactions. | `bun test tests/release-update-state-primitives.test.ts` — 10 pass |
| Interrupted recovery reports local-only evidence without remote claims | Added recovery and failed-proof fixtures; RED exposed cleanup/identity gap. | Recovery persists attempted and explicit result. | Covered malformed journals and unproven restoration. | Shared local outcome persistence without merging journal systems. | `bun test tests/release-update-state-primitives.test.ts` — 10 pass |

Verification: `bun test tests/release-update-state-primitives.test.ts` — 10 passing tests, 54 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. No build, remote mutation, install-journal merge, or group 006 work.

Deviations: none. Remaining tasks: groups 006–007.

## Group 006 — core effective-channel read-model visibility seam
Completed tasks 6.1–6.2 only. Extended the existing advisor read evidence with installation-owned preference, effective channel, installed version/identity, candidate pending or unavailable identity, and fail-closed freshness evidence. Alpha freshness remains unknown without immutable publication/policy evidence; invalid preference and conflicting marker identity remain unavailable. No CLI rendering, launcher, client settings, or second status model was added.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Persisted/defaulted preference remains distinct from effective channel and installed evidence | New advisor assertions failed (preference/effective fields absent). | Read preference from installation path and projected stable default/explicit alpha separately. | Covered absent default, explicit alpha, and installed version with verified marker identity. | Kept the projection on `InstallerUpdateReadEvidence`; no UI model added. | `bun test tests/release-update-cli.test.ts` — 14 pass |
| Artifact identity distinguishes verified, pending, and unavailable evidence | New identity assertions failed before artifact facets existed. | Projected verified marker identity and pending candidate identity. | Covered legacy/missing identity and conflicting marker evidence as unavailable. | Centralized artifact projection helpers; no identity fabricated. | `bun test tests/release-update-cli.test.ts` — 14 pass |
| Alpha freshness never claims current without immutable evidence or policy | Alpha freshness assertion failed before top-level evidence existed. | Added channel-aware unknown/unavailable freshness projection. | Covered malformed preference and unavailable release evidence fail closed. | Centralized freshness decision; no clock or expiration evaluator. | `bun test tests/release-update-cli.test.ts` — 14 pass |

Verification: `bun test tests/release-update-cli.test.ts` — 14 passing, 61 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. The focused suite initially exposed one stale pre-existing v2 marker fixture; adding its canonical artifactId aligned the fixture with group 004 without changing runtime behavior.

Deviations: none from group 006 design. Remaining tasks: group 007 only; apply intentionally stops here.

## Group 007 — CLI result/update rendering and final focused verification
Completed tasks 7.1–7.3. The final drift was fixture-only: v2 marker evidence now includes its canonical verified `artifactId`, malformed legacy fixtures remain explicitly typed as legacy evidence, and advisor test evidence carries the required artifact/preference/freshness fields. No production behavior changed.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Combined release contract/state/CLI fixtures honor the approved v2 identity contract | Combined suite failed at the stale marker fixture; v2 read returned invalid. | Added canonical marker `artifactId` and branded canonical identity fixtures. | Combined suite covered pending identity, verified commit, malformed v2, and legacy unavailable evidence; runtime-menu fixture also passed. | Audited fixture-only diff; no production scope widened and no legacy identity fabricated. | `bun test tests/release-update-contract.test.ts tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts` — 45 pass |
| Root and installer type surfaces match the read-evidence contract | Root typecheck reported missing preference/freshness, unbranded identity, widened legacy channels, and malformed-tag cast errors. | Typed legacy markers and canonical `ArtifactId` fixtures; completed advisor fixture fields and intentional malformed cast. | `bun test tests/installer-runtime-menu.test.ts` — 35 pass; both typechecks passed. | Kept all changes in test fixtures; no production edits or unrelated dirty files touched. | `bun run typecheck` — pass; `cd installer && bun run typecheck` — pass |

Verification: all required gates pass — combined focused suite 45 tests/222 assertions, root typecheck, and installer typecheck. Additional affected runtime-menu fixture test passed 35 tests/150 assertions. No build or publication command ran.

Deviations: none. Task 7.3 is complete; all tasks 1.1–7.3 are checked.
Remaining tasks: none.

## Group 008 — shared normalized release-tag validation contract
Completed tasks 8.1–8.2 only. Added a cross-stage matrix for canonical, shorthand, final, alpha, build metadata, numeric-leading prerelease, leading-zero, empty, and malformed prerelease tags. Exported `normalizeReleaseTag` from `release-types.ts`, aligned its SemVer identifier syntax with selection, and made canonical identity derivation consume it. Pending identity remains representable; no resolver consumer migration, verification gate, signatures, or publication work was started.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Selection and artifact identity accept the same normalized release-tag syntax while malformed evidence fails closed | Importing the new validator failed before its export existed (0 pass, 1 fail). | Exported the pure validator, expanded valid nonnumeric prerelease handling, and routed `deriveArtifactId` through it; focused suite passed after distinguishing empty/missing from malformed. | Covered canonical/shorthand/final/alpha/build tags, the prior `0alpha` disagreement, leading-zero and malformed prerelease forms, empty input, and pending identity remains covered by the existing contract. | Replaced the private identity-only parser with the shared exported validator; SemVer ordering and channel eligibility remain in the resolver. | `bun test tests/release-update-contract.test.ts` — 19 pass |

Verification: `bun test tests/release-update-contract.test.ts` — 19 passing tests, 120 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. No build, signatures, publication, or group 009 work ran.

Deviations: none. Remaining tasks: groups 009–015; group 009 intentionally not started.

## Group 009 — resolver and record adaptation consume the shared normalized-tag contract
Completed tasks 9.1–9.2 only. Resolver normalization and SemVer extraction now consume `normalizeReleaseTag`; record adaptation calls the same validator directly and preserves pending identity. Stable/alpha eligibility, SemVer ordering, provider-policy separation, shorthand selectors, build metadata, and malformed-tag rejection remain intact. Group 010 was not started.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Explicit selectors and release eligibility use shared syntax without changing channel policy or SemVer ordering | Cross-stage matrix failed: 19 pass / 1 fail on resolver’s divergent error path. | Resolver delegates normalization to `normalizeReleaseTag`; focused run passed 20 tests / 144 assertions. | Final matrix covered final/alpha, beta/rc rejection, shorthand, build metadata, malformed, and pending identity: 20 tests / 160 assertions. | Removed resolver tag regex; SemVer extraction remains pure and channel policy stays in resolver. | `bun test tests/release-update-contract.test.ts` — 20 pass, 160 assertions |
| Provider adaptation emits the same normalized tag and pending identity without taking over channel policy | Same RED matrix exposed adapter’s divergent malformed-tag message. | Adapter calls `normalizeReleaseTag` directly and retains pending identity. | Accepted tags normalize identically; malformed tags fail with shared evidence while beta/rc remain adapter-accepted but alpha-ineligible. | Kept provider adaptation separate from eligibility and artifact verification. | `bun test tests/release-update-contract.test.ts` — 20 pass, 160 assertions |

Verification: focused contract test passed. Relevant typecheck: `cd installer && bun run typecheck` passed. No build, acquisition, marker mutation, candidate-list fetch, or group 010 work ran.

Deviations: none. Remaining tasks: groups 010–015.

## Group 010 — candidate-list fetch and highest-eligible adaptation path
Completed tasks 10.1–10.2 only. Latest discovery now performs one bounded GitHub release-list request (`per_page=30`), adapts each provider record through `adaptReleaseRecord`, skips malformed candidates, and delegates channel eligibility/order to `selectHighestRelease`. Empty/all-ineligible or unusable payloads fail closed; exact-tag fetches retain their dedicated endpoint and behavior. No pagination, publication, promotion, signatures, expiration, or 1B producer work was added.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Latest resolution examines a bounded candidate list and selects the highest eligible stable/alpha SemVer | Finals, alpha, draft, malformed, beta, and rc fixtures failed against the old `/latest` path (20 pass, 2 fail). | Added one bounded list fetch, per-record adaptation, and delegation to `selectHighestRelease`; stable/alpha chose the expected highest candidates. | Asserted no `/latest` request and correct final-versus-alpha SemVer precedence. | Shared HTTP response handling between latest and explicit fetches. | `bun test tests/release-update-contract.test.ts` — 22 pass, 171 assertions |
| Unusable candidate responses fail closed while explicit tags remain exact | Candidate-list fixtures failed before list adaptation existed. | Empty/all-ineligible and malformed payloads return errors; exact tags keep their dedicated endpoint. | Covered malformed JSON/top-level/list entries and draft/unsupported prereleases without selection. | Kept malformed entries out of adapted candidates; no pagination or producer behavior. | `bun test tests/release-update-contract.test.ts` — 22 pass; `cd installer && bun run typecheck` — passed |

Verification: focused contract test passed (22 tests, 171 assertions); installer typecheck passed. Group 011 was not started. Remaining tasks: groups 011–015.

Deviations: bounded list size is fixed at 30 and pagination remains intentionally out of scope; malformed list entries are rejected from adaptation while valid candidates continue to policy selection.

## Group 011 — channel-aware acquisition uses the selected candidate
Completed tasks 11.1–11.2 only. Acquisition now validates the effective closed channel before I/O, passes it to latest list or exact-tag metadata fetch and record resolution, then selects assets from that same resolved record. Provider identity remains pending until checksum verification derives the canonical artifactId; no marker, transaction, CLI, publication, or group 012 work started.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN / TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|
| Latest stable/alpha acquisition follows highest eligible candidate and selected-record assets | New candidate-list fixtures failed: 10 pass / 3 fail, covering alpha latest, explicit alpha, and invalid channel before implementation. | Passed 13 tests / 80 assertions; covered final over same-version alpha, newer alpha over older final, beta/rc/nightly/draft exclusion, unique selected asset URLs, and pending-to-verified identity. | `bun test tests/release-update-state-primitives.test.ts` — 13 pass |
| Explicit tags remain exact and invalid channels fail before HTTP | RED explicit alpha used stable default and invalid channel attempted the list request. | Threaded channel through exact fetch and `resolveRecord`; invalid runtime vocabulary returns `invalid-channel` with zero requests. | `bun test tests/release-update-state-primitives.test.ts` — 13 pass |

Verification: focused state-primitives suite passed (13 tests, 80 assertions). Relevant typecheck `cd installer && bun run typecheck` passed. Refactor stayed within `acquisition.ts`: one effective channel guard, no independent stable/latest default after selection, and verified identity remains post-digest. Remaining tasks: groups 012–015; group 012 intentionally not started.

## Group 012 — transaction propagates effective channel through dry-run, acquisition, and marker commit
Completed tasks 12.1–12.2 only. Added an explicit optional effective `ReleaseChannel` input to `runUpdateTransaction`, defaulting to stable only when omitted, rejecting invalid runtime values before acquisition or mutation, and passing the single validated value through dry-run resolution, acquisition, transaction journal evidence, and marker commit. Existing journals without a channel remain readable; new local transaction journals retain the effective channel. No preference persistence read or CLI change was started.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Explicit alpha reaches dry-run candidate resolution while omitted channel stays stable | Added alpha/stable latest fixtures; focused run failed with stable selection (13 pass, 2 fail). | Threaded one validated channel through dry-run resolver and caller-level stable default. | Alpha selected an alpha prerelease while stable selected the final; dry-run recorded no journal or local mutation. | Kept channel validation/defaulting at transaction entry; no persistence read. | `bun test tests/release-update-state-primitives.test.ts` — 16 pass |
| Alpha/stable acquisition, journal, and marker commit preserve one effective channel | Full transaction fixtures failed before propagation; current code acquired stable and omitted journal/marker channel. | Passed channel to acquisition, journal creation, and `commitMarkerV2`; alpha/stable updates now read back their channels. | Alpha and stable successful installs, journal capture, selected-record assets, and marker read-back pass. | Journal channel is optional for legacy recovery compatibility and validated when present. | `bun test tests/release-update-state-primitives.test.ts` — 16 pass |
| Invalid/unavailable channel or no eligible candidate cannot mutate | Invalid runtime channel reached stable acquisition in RED. | Entry guard returns resolving failure before HTTP; candidate failure remains before local transaction setup. | Covered unavailable value, empty candidate list, unchanged marker/binary bytes, zero journal writes. | No fallback for explicit invalid values; only `undefined` defaults stable. | `bun test tests/release-update-state-primitives.test.ts` — 16 pass |

Verification: focused state-primitives suite — 16 passing tests / 103 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. No build, CLI, persistence read, publication, or group 013 work ran.

Deviations: none. Remaining tasks: groups 013–015; apply remains partial by instruction.

## Group 013 — CLI resolves installation preference before recovery or update mutation
Completed tasks 13.1–13.2 only. `runUpdate` now reads the installation-owned preference before recovery, resolves absent to stable, passes the effective channel into `runUpdateTransaction`, and fails closed on unavailable preference evidence without recovery, acquisition, or mutation. Explicit installation paths and agent-directory fallback are covered; alpha reaches a real transaction and marker/evidence, while a client settings file remains byte-identical. Group 014 was not started.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|---|
| Installation-owned stable/alpha preference reaches transaction and marker/evidence | Added explicit alpha transaction, fallback dry-run, default stable, and client-isolation fixtures; RED failed because CLI omitted preference handoff. | Read preference before recovery and pass its effective channel into the transaction. | Covered explicit path, agent fallback, alpha marker/read-model evidence, candidate-list acquisition, and client bytes; installer typecheck passed. | `bun test tests/release-update-cli.test.ts` — 21 pass |
| Malformed or unreadable preference stops before recovery/acquisition/mutation | Added malformed preference with invalid journal and unreadable-path fixtures; RED entered recovery/preparation or attempted the old path. | Unavailable preference returns resolving failure before recovery; no HTTP calls or file changes. | Preserved exit code/rendering semantics and advisor evidence; no fallback for invalid state. | `bun test tests/release-update-cli.test.ts` — 21 pass |

Verification: focused CLI suite — 21 passing tests / 104 assertions. Relevant typecheck: `cd installer && bun run typecheck` — passed. No build or root-wide suite ran.
Deviations: test HTTP fixtures were aligned with the existing bounded candidate-list resolver so the focused CLI suite exercises current group 010 behavior; no group 014 or unrelated production work started.
Remaining tasks: groups 014–015; apply remains partial by instruction.

## Group 014 — terminal journal finalization after proven successful local recovery
Completed tasks 14.1–14.2 only. Local rollback success is now read back, persisted as the distinct `recovery-succeeded` terminal journal state, and retained until a later normal recovery pass cleans it. Legacy journals with durable prior success are finalized safely; attempted, failed, pending, malformed, and cleanup-failed evidence remains durable and fail-closed. No remote rollback claim or `install-journal.ts` change was made.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|---|
| Proven local recovery reaches a terminal state and next normal update is unblocked | Added direct rollback/recovery and CLI next-run fixtures; focused run failed 3 tests (36 pass) on missing terminal state/cleanup path. | Added `recovery-succeeded`, durable outcome/state read-back, terminal cleanup, and legacy-success finalization. | Covered immediate and next-run success, cleanup failure, attempted/failed/pending/malformed evidence, complete journals, and preserved legacy cleanup; centralized finalization helpers. | `bun test tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts` — 40 pass / 237 assertions |

Verification: focused state/CLI suites passed (40 tests, 237 assertions). Relevant typecheck `cd installer && bun run typecheck` passed. No build, publication, remote rollback, or group 015 work started.

Deviations: none. Remaining tasks: group 015 only; apply remains partial by instruction.

## Group 015 — post-remediation focused verification
Status: complete; task 15.1 is checked. Fixed the four branded `ArtifactId` fixture type errors through the production `deriveArtifactId` helper; no production behavior changed.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Evidenced fixture identities retain the canonical `ArtifactId` brand without unsafe casts | `bun run typecheck` failed with TS2769 at the four assigned fixture sites. | Both focused fixture files now construct identities through `deriveArtifactId`; target fixtures typecheck and tests pass. | Combined contract/state/CLI suites: 62 tests and 408 assertions passed, covering identity propagation alongside the full remediation matrix. | Removed remaining `as ArtifactId` fixture casts in the two scoped files; production types and behavior are unchanged. | `bun test tests/release-update-contract.test.ts tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts && bun run typecheck && (cd installer && bun run typecheck)` — all pass |

Completed: task 15.1. Deviations: none. Remaining tasks: none.

## Files changed
`installer/src/cli/result.ts`
`installer/src/cli/update.ts`
`installer/src/core/update-advisor-read.ts`
`tests/release-update-cli.test.ts`
`tests/installer-runtime-menu.test.ts`
`installer/src/core/release-types.ts`
`installer/src/core/release-channel-preference.ts`
`installer/src/core/release-record.ts`
`installer/src/core/release-resolver.ts`
`installer/src/core/acquisition.ts`
`installer/src/core/marker-v2.ts`
`installer/src/core/transaction.ts`
`tests/release-update-contract.test.ts`
`tests/release-update-state-primitives.test.ts`
`tests/release-update-acquisition.test.ts`
`tests/release-update-integration.test.ts`
`docs/valoracion-estado-y-rumbo-2026-08.md`
`openspec/changes/add-stable-alpha-release-contract/tasks.md`
`openspec/changes/add-stable-alpha-release-contract/apply-progress.md`

## Remediation — current sdd-verify blockers
status: complete

Only fixture/documentation drift was remediated; no production code or tasks were changed. Candidate-list fixtures now use the bounded `releases?per_page=30` endpoint, exact-tag fixtures remain object-shaped, and cleanup/error assertions retain the current ordering. Valid integration v2 markers carry canonical `artifactId`; malformed identity input still omits it and remains fail-closed. The unrelated document uses permitted equivalent wording only.

TDD Cycle Evidence:
| Behavior seam | RED | GREEN / TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|
| Acquisition discovers bounded candidates, preserves exact tags, and keeps cleanup ordering | Legacy `/latest` fixtures failed (2 pass, 4 fail). | List payloads and bounded URL fixed fixture drift; exact-tag, digest, redirect, draft, missing-integrity, mismatch, and network cases pass; fixture-only audit completed. | `bun test tests/release-update-acquisition.test.ts` — 6 pass |
| Integration preserves canonical v2 identity while honoring list discovery and approved failure/dry-run stages | Legacy fixtures failed (3 pass, 9 fail), primarily malformed/missing v2 identity and list endpoint. | Valid markers gained canonical identity; malformed identity remains absent; latest uses list, exact tag remains exact, and preparing/verifying/dry-run outcomes pass. | `bun test tests/release-update-integration.test.ts` — 12 pass |
| Vocabulary scan permits the unrelated valuation document | Vocabulary test failed with the document as offender. | Replaced only the blocked term with equivalent wording; no other document rewrite. | `bun test tests/sdd-vocabulary.test.ts` — 1 pass |

Final checks: `bun run typecheck` — pass; `cd installer && bun run typecheck` — pass. No build, full suite, production edit, or task checkbox changes. Deviations: none. Remaining tasks: none.
