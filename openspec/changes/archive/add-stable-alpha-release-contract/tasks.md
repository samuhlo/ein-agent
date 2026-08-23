# Tasks — add-stable-alpha-release-contract

status: ready
blocked_by: none

Scope guard: this plan covers milestone 1A only. Stable accepts finals only; alpha accepts finals plus supported `alpha` prereleases, and each selects the highest eligible SemVer. Candidate selection/acquisition may carry pending identity, but verified canonical `artifactId` is mandatory after digest verification and before local commit or marker mutation. Alpha-expiration evaluation is deferred; without immutable publication evidence or applicable policy, 1A reports freshness/expiration as `unknown` or `unavailable`. Artifact production, signatures/trust roots, publication workflows, promotion, remote rollback, and every other 1B producer concern remain out of scope.

## // 001. Foundational release-channel and artifact-identity contract

Production files: `installer/src/core/release-types.ts`.

Strict-TDD evidence: RED — add failing contract examples for the closed channel vocabulary, resolution states, pending identity, canonical `artifactId`, and verified identity disagreement; GREEN — add only the shared types and pure canonicalization/agreement helpers; TRIANGULATE — add malformed tag/digest, uppercase digest, pending/missing verified evidence, and conflict examples; REFACTOR — remove free-form channel/identity representations without making verified identity a prerequisite for candidate selection.

Focused Bun command: `bun test tests/release-update-contract.test.ts`

Stop conditions: stop if the foundational contract would need signatures, trust-root semantics, producer manifests, publication timestamps, or an invented digest; represent unavailable evidence explicitly and leave producer work to 1B.

- [x] 1.1 Add RED contract fixtures for the two-value channel domain and immutable identity binding.
  - skills: `bun`, `release`, `ein-discipline`
  - why: Consumers need one tested domain vocabulary before persistence, resolution, marker, transaction, or UI work begins.
  - learn: A release tag identifies a release, while its verified SHA-256 digest identifies bytes; `artifactId` binds both without claiming authenticity.
  - architecture: Keep `ReleaseChannel`, unavailable/defaulted resolution states, pending/verified identity, `ArtifactId`, and freshness evidence in the shared installer release contract; absence/unavailability are states, not extra channels.
  - avoid: Do not start by changing resolver, marker, transaction, or status consumers, and do not encode `beta`, `rc`, or arbitrary strings as channels.
  - verify: `bun test tests/release-update-contract.test.ts`

- [x] 1.2 Implement GREEN, TRIANGULATE, and REFACTOR for the foundational contract in `release-types.ts`.
  - skills: `architecture`, `bun`, `release`
  - why: Every later group must preserve the same canonical `<normalized-release-tag>@sha256:<lowercase-verified-digest>` identity once verification completes, while representing pre-verification identity as pending.
  - learn: Branded or closed TypeScript contracts prevent accidental substitution, but runtime validation and stage-specific requirements are still needed at I/O boundaries.
  - architecture: Provide small pure helpers for canonical derivation and verified-evidence agreement; keep pending identity representable and keep filesystem/network access and signature language outside this module.
  - avoid: Do not treat a digest as a signature, invent missing evidence, require verified identity during candidate selection, or bundle any consumer migration into this foundation group.
  - verify: `bun test tests/release-update-contract.test.ts`

## // 002. Installation-scoped channel preference persistence

Production files: `installer/src/core/release-channel-preference.ts` (new).

Strict-TDD evidence: RED — prove absent, explicit `stable`, explicit `alpha`, unsupported, malformed, unreadable, atomic read-back mismatch, restart, and byte-for-byte client-setting isolation cases; GREEN — implement the smallest installation-owned read/write boundary; TRIANGULATE — corrupt/truncated bytes and replacement/read-back mismatch remain unavailable while every client settings file remains byte-identical; REFACTOR — keep serialization and pure resolution separate from filesystem operations.

Focused Bun command: `bun test tests/release-update-contract.test.ts`

Stop conditions: stop if the only proposed owner is client/project `settings.json`, if an Ein alpha write changes any client bytes, or if atomic write/read-back cannot be evidenced; never replace corruption with a silent stable fallback.

- [x] 2.1 Add RED persistence fixtures using isolated temporary installation and client-project trees.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The core dogfooding invariant is that each managed Ein installation may persist its own alpha preference without changing any client-project settings bytes.
  - learn: Defaulting is safe only for truly absent state; unreadable or malformed persisted state is materially different and must be unavailable.
  - architecture: Test the new module directly as an adapter scoped per managed installation and treat existing `installer/src/core/settings.ts` as an untouched, byte-for-byte isolated client/project boundary.
  - avoid: Do not mock away process restart, mutate project settings as setup cleanup, or use a global/home-scoped preference shared by unrelated installations.
  - verify: `bun test tests/release-update-contract.test.ts`

- [x] 2.2 Implement atomic preference write/read-back and deterministic read resolution, then triangulate failure modes.
  - skills: `architecture`, `bun`, `ein-discipline`
  - why: A valid explicit preference must reproduce across processes while invalid or unreadable bytes never select a channel.
  - learn: Installation-scoped persistence combines ownership (where bytes live) with policy (how absence and corruption are interpreted); both need tests.
  - architecture: Use a dedicated kebab-case core module with injected or explicit installation paths, atomic replacement, and post-write read-back; expose a result instead of throwing channel policy into callers.
  - avoid: Do not reuse or migrate `settings.ts`, silently normalize unsupported strings, or introduce global state/caches.
  - verify: `bun test tests/release-update-contract.test.ts`

## // 003. Channel-aware record adaptation and release resolution

Production files: `installer/src/core/release-record.ts`, `installer/src/core/release-resolver.ts`.

Strict-TDD evidence: RED — add the stable/alpha eligibility and ordering matrix: stable accepts non-draft finals only; alpha accepts non-draft finals plus prereleases whose first identifier is exactly `alpha`; both choose the highest eligible SemVer; GREEN — adapt records and resolve with an explicit effective channel while allowing selected candidates to carry pending identity; TRIANGULATE — cover drafts, final-versus-alpha ordering, `alpha`, `alpha.N`, `beta`, `rc`, unknown prereleases, malformed SemVer, normalization, and missing/conflicting identity that does not disqualify an eligible candidate; REFACTOR — centralize SemVer/channel policy without broad selector redesign.

Focused Bun command: `bun test tests/release-update-contract.test.ts`

Stop conditions: stop if eligibility requires changing GitHub publication/workflow behavior, if unsupported prerelease metadata would be guessed, or if SemVer ordering cannot be determined safely; reject the malformed/draft/unsupported candidate without turning verified identity into a resolution prerequisite.

- [x] 3.1 Drive record adaptation, eligibility, and highest-SemVer selection with RED matrix tests, one production seam at a time.
  - skills: `bun`, `release`, `ein-discipline`
  - why: Stable must select only the highest eligible final, while alpha must select the highest eligible final or supported `alpha` prerelease without becoming a generic prerelease channel.
  - learn: SemVer precedence applies across finals and prereleases; alpha eligibility additionally requires the first prerelease identifier to be exactly `alpha`, not a substring or loose prefix.
  - architecture: Let `release-record.ts` adapt provider evidence and let pure resolver policy decide channel eligibility and SemVer ordering before acquisition or local mutation.
  - avoid: Do not restrict alpha to prereleases, accept every provider `prerelease: true`, parse eligibility from display names, or let draft/malformed records reach acquisition.
  - verify: `bun test tests/release-update-contract.test.ts`

- [x] 3.2 Implement GREEN resolution with pending identity, triangulate rejected vocabularies and identity independence, then refactor duplicated policy.
  - skills: `architecture`, `bun`, `release`
  - why: Candidate examination and selection depend on channel eligibility and SemVer evidence, not on canonical identity that can only be established after digest verification.
  - learn: Fail-closed policy is stage-specific: malformed, draft, and unsupported prerelease records are ineligible now; missing or conflicting identity blocks the later commit gate, not candidate selection.
  - architecture: Pass the closed `ReleaseChannel` explicitly into eligibility/resolution, return the highest eligible candidate with identity verified when evidenced or pending otherwise, and reserve identity conflict enforcement for the post-verification pre-commit boundary.
  - avoid: Do not reject eligible candidates because identity is pending, infer alpha expiration, add mutable publication timestamps as freshness proof, or alter selector behavior beyond the stable/alpha contract.
  - verify: `bun test tests/release-update-contract.test.ts`

## // 004. Verified identity propagation and installed marker read-back

Production files: `installer/src/core/acquisition.ts`, `installer/src/core/marker-v2.ts`.

Strict-TDD evidence: RED — prove a selected candidate may enter and complete acquisition with identity pending, then prove verified digest-to-`artifactId` derivation, pre-commit enforcement, marker persistence/read-back, migration behavior, and missing/tag/digest/identity conflict failures; GREEN — derive canonical identity from verified acquisition evidence and require it only before local commit or marker mutation; TRIANGULATE — cover pending selection/acquisition, absent legacy identity, uppercase/malformed digest, conflicting verified evidence, zero marker mutation on blocked commit, read-back mismatch, and stable/alpha markers; REFACTOR — keep digest verification at acquisition, the commit gate explicit, and consistency checks at marker boundaries.

Focused Bun command: `bun test tests/release-update-state-primitives.test.ts`

Stop conditions: stop if acquisition cannot expose a verified SHA-256 digest without changing artifact production, if legacy data would need fabricated identity, or if marker compatibility requires accepting conflicts; keep candidate examination/acquisition available with pending identity, but stop local commit before marker mutation whenever post-verification canonical identity is missing or conflicting.

- [x] 4.1 Add RED state-primitive tests for pending acquisition, the post-verification pre-commit identity gate, and marker preservation.
  - skills: `bun`, `release`, `ein-discipline`
  - why: Acquisition may legitimately begin with identity pending, but a marker is trustworthy for correlation only when local commit preserves the exact identity derived after digest verification.
  - learn: Migration may preserve legacy evidence, but it cannot manufacture a stronger identity than the source data proves; missing evidence changes what may be committed, not what may be examined or acquired.
  - architecture: Treat acquisition as the verified-digest and canonical-derivation edge, then treat `marker-v2.ts` as the atomic installed-state edge after an explicit commit gate; use the shared contract rather than a second identity format.
  - avoid: Do not require verified identity before acquisition, hard-code `stable`, synthesize identity from tag alone, mutate a marker after missing/conflicting verified evidence, or mark incomplete legacy records current.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

- [x] 4.2 Implement GREEN propagation and pre-mutation enforcement, then triangulate marker read-back, malformed, conflicting, and legacy evidence.
  - skills: `architecture`, `bun`, `release`
  - why: After digest verification, local commit must stop before marker mutation when tag, digest, or canonical `artifactId` is missing or disagrees; valid evidence must survive marker write and read-back unchanged.
  - learn: Acquisition eligibility, content verification, and local commit are distinct gates; only the last requires canonical verified identity, while atomic write and semantic read-back protect installed state.
  - architecture: Allow pending identity through candidate acquisition, derive one canonical identity from the normalized tag and verified digest, require agreement at the pre-commit gate, and preserve it through marker v2 read-back.
  - avoid: Do not enforce identity agreement during candidate selection, reinterpret digest integrity as signature authenticity, silently repair conflicts, mutate the marker on a blocked commit, or modify publication assets/workflows.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

## // 005. Local alpha transaction and rollback evidence boundary

Production files: `installer/src/core/transaction.ts`.

Strict-TDD evidence: RED — prove journals retain previous/attempted `artifactId`, managed tree, backup reference, state, and explicit rollback outcome across success/failure/recovery; GREEN — extend only the active transaction journal and transitions; TRIANGULATE — cover explicit previous-none, missing/malformed evidence, interrupted recovery, failed restore, and identity mismatch; REFACTOR — centralize journal validation and authority wording without merging journal systems.

Focused Bun command: `bun test tests/release-update-state-primitives.test.ts`

Stop conditions: stop if work requires merging `install-journal.ts`, designing a lifecycle planner, mutating remote pointers, or claiming cross-authority atomicity; incomplete evidence must not count as successful rollback or safe dogfooding.

- [x] 5.1 Add RED journal and recovery fixtures for the minimum local rollback evidence set.
  - skills: `bun`, `ein-discipline`, `release`
  - why: Alpha dogfooding is safe only when the affected local transition and restoration result are diagnosable.
  - learn: “Rollback attempted” and “rollback succeeded” are different outcomes; absence of an outcome is not success.
  - architecture: Test the existing update transaction path with explicit local authority, exact managed tree/backup references, and both artifact endpoints.
  - avoid: Do not make tests assert a remote channel moved, collapse previous-none into missing evidence, or broaden into unrelated backup/install work.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

- [x] 5.2 Implement GREEN journal transitions, triangulate recovery failures, and refactor validation locally.
  - skills: `architecture`, `bun`, `release`
  - why: Every transaction state must preserve enough correlated evidence to prove what local tree was attempted and what rollback achieved.
  - learn: Authority should be encoded in data and wording: local restore evidence can correlate with a remote artifact but cannot report remote rollback.
  - architecture: Extend `transaction.ts` only; validate required evidence at persistence/read boundaries and retain explicit pending/failure outcomes.
  - avoid: Do not consolidate journal abstractions, delete evidence during cleanup before outcome is durable, or introduce a remote/local coordinator.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

## // 006. Core effective-channel read-model visibility seam

Production files: `installer/src/core/update-advisor-read.ts`.

Strict-TDD evidence: RED — add read-model examples separating persisted preference from effective channel and exposing installed version, verified `artifactId` when available, pending/unavailable identity, freshness, and defaulted/invalid/conflicting states; GREEN — build the smallest honest projection at the existing advisor-read seam; TRIANGULATE — cover absent preference, alpha, unreadable preference, pending/missing/conflicting identity, and alpha without immutable expiration evidence or applicable policy; REFACTOR — centralize projection logic without creating a second status subsystem.

Focused Bun command: `bun test tests/release-update-cli.test.ts`

Stop conditions: stop if visibility requires a banner/menu/launcher redesign, client-project settings reads, fabricated timestamps, or a parallel status model; alpha without immutable publication/policy evidence must remain unknown/unavailable and never current.

- [x] 6.1 Add RED read-model fixtures for effective-channel visibility and evidence honesty.
  - skills: `bun`, `ein-discipline`, `release`
  - why: Consumers must distinguish what was requested, what actually resolved, what is installed, and whether the supporting evidence is usable.
  - learn: An effective channel is derived state; it must not overwrite or conceal persisted preference provenance.
  - architecture: Exercise only the existing `installer/src/core/update-advisor-read.ts` boundary and define one projection for downstream consumers rather than a parallel UI model.
  - avoid: Do not read client-project settings, label unknown alpha freshness current, infer expiration from install/download time, or duplicate resolver policy.
  - verify: `bun test tests/release-update-cli.test.ts`

- [x] 6.2 Implement GREEN projection, TRIANGULATE unavailable/conflicting evidence, and REFACTOR locally.
  - skills: `architecture`, `bun`, `release`
  - why: The CLI needs one stable read model that carries preference, effective channel, installed version, artifact identity, and honest evidence state without recomputation.
  - learn: A read model should preserve domain uncertainty rather than “improve” it into a reassuring but unsupported status.
  - architecture: Keep projection ownership in `installer/src/core/update-advisor-read.ts`; expose verified `artifactId` only when evidenced, preserve pending/unavailable identity, and represent expiration intent without implementing a clock or policy evaluator.
  - avoid: Do not default invalid data to stable, add producer metadata, fabricate identity, or widen into CLI rendering in this group.
  - verify: `bun test tests/release-update-cli.test.ts`

## // 007. CLI result/update rendering and final focused verification

Production files: `installer/src/cli/result.ts`, `installer/src/cli/update.ts`.

Strict-TDD evidence: RED — add rendering examples for preference versus effective channel, version, verified `artifactId` when available, pending/unavailable identity, freshness, defaulted/invalid/conflicting states, and local-only rollback wording; GREEN — thread the existing advisor read projection through update results and rendering; TRIANGULATE — cover unknown/unavailable alpha expiration when immutable evidence or policy is missing, unavailable/conflicting identity evidence, and rollback authority language; REFACTOR — preserve existing exit codes and visual structure while removing duplicated presentation mapping.

Focused Bun command: `bun test tests/release-update-cli.test.ts`

Stop conditions: stop if rendering requires a banner/menu/launcher redesign, a second status subsystem, fabricated timestamps, producer metadata, or remote rollback claims; keep alpha expiration unknown/unavailable until 1B supplies immutable publication/policy evidence.

- [x] 7.1 Add RED CLI result/update fixtures for effective-channel rendering and authority separation.
  - skills: `bun`, `ein-discipline`, `release`
  - why: Users need visible, non-misleading output for the channel actually used, installed identity, evidence quality, and rollback scope.
  - learn: Presentation is part of the contract when wording can overstate freshness or authority.
  - architecture: Exercise the existing `installer/src/cli/update.ts` and `installer/src/cli/result.ts` seams while preserving current exit-code behavior and visual structure.
  - avoid: Do not imply local rollback moved `stable`/`alpha` remotely, collapse unavailable into current, or introduce a new UI model.
  - verify: `bun test tests/release-update-cli.test.ts`

- [x] 7.2 Implement GREEN rendering, TRIANGULATE unknown/local-only states, and REFACTOR without widening scope.
  - skills: `architecture`, `bun`, `release`
  - why: The core projection becomes useful only when current installer output carries its distinctions intact to the user.
  - learn: Deferring an expiration evaluator while rendering `unknown` is safer than inventing unsupported policy or timestamps.
  - architecture: Pass the projection through `installer/src/cli/update.ts` and render it in `installer/src/cli/result.ts`; keep domain identity/freshness policy in core.
  - avoid: Do not add expiry duration constants, wall-clock comparisons, implicit stable promotion, signatures, publication, promotion, or remote rollback.
  - verify: `bun test tests/release-update-cli.test.ts`

- [x] 7.3 Run the complete focused contract suite and both required typechecks as final verification.
  - skills: `bun`, `release`, `ein-discipline`
  - why: The final gate must jointly prove eligibility/order, pending identity through acquisition, verified identity before commit, installation/client isolation, honest expiration, and both TypeScript surfaces.
  - learn: Runtime tests and static typechecks catch different classes of contract drift; both repository and installer checks are required here.
  - architecture: Verify the bounded 1A slice without production builds or publication actions; failures return to the owning group rather than triggering broad cleanup.
  - avoid: Do not run a full production build, publish locally, edit release workflows, or fix unrelated dirty-worktree failures as part of this change.
  - verify: `bun test tests/release-update-contract.test.ts tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts && bun run typecheck && (cd installer && bun run typecheck)`

## // 008. Shared normalized release-tag validation contract

Production files: `installer/src/core/release-types.ts`.

Strict-TDD evidence: RED — add a cross-stage tag matrix proving every normalized tag accepted for selection is also accepted for canonical identity derivation, while malformed/non-SemVer tags fail at both boundaries and pending identity remains allowed; GREEN — export one pure normalized-tag validator from `release-types.ts` and make identity derivation consume it; TRIANGULATE — cover canonical, shorthand, final, `alpha`, build metadata, leading-zero, empty, and malformed prerelease identifiers; REFACTOR — remove the private competing identity parser without moving SemVer ordering or eligibility into the identity module.

Focused Bun command: `bun test tests/release-update-contract.test.ts`

Stop conditions: stop if the shared contract would require producer metadata, signatures, publication changes, or identity verification during candidate examination; this group only unifies normalized tag syntax and keeps pending identity valid.

- [x] 8.1 Add RED cross-stage fixtures in `tests/release-update-contract.test.ts` for the parser-disagreement finding.
  - skills: `bun`, `release`, `ein-discipline`
  - why: Selection must never admit a normalized release tag that canonical identity derivation is guaranteed to reject solely because two parsers disagree.
  - learn: Fail-closed validation is safest when all stages share one normalization contract but still enforce their own stage-specific evidence requirements.
  - architecture: Define the acceptance matrix against `installer/src/core/release-types.ts`; selection eligibility remains separate and pending artifact identity remains allowed until bytes are verified.
  - avoid: Do not make `artifactId` mandatory during selection, loosen malformed SemVer, or add publication/1B evidence.
  - verify: `bun test tests/release-update-contract.test.ts`

- [x] 8.2 Implement GREEN, TRIANGULATE, and REFACTOR in `installer/src/core/release-types.ts`.
  - skills: `release`, `bun`, `ein-discipline`
  - why: Identity derivation needs a reusable normalized `ReleaseTag` result that later resolver and record consumers can share exactly.
  - learn: A branded TypeScript tag does not validate runtime provider input; one exported pure validator supplies that runtime guarantee.
  - architecture: Let `release-types.ts` own normalized tag syntax and canonical identity derivation, while leaving channel policy and SemVer precedence in the resolver.
  - avoid: Do not retain a second private tag regex, absorb resolver ordering into this file, or broaden accepted prerelease vocabularies.
  - verify: `bun test tests/release-update-contract.test.ts`

## // 009. Resolver and record adaptation consume the shared tag contract

Production files: `installer/src/core/release-resolver.ts`, `installer/src/core/release-record.ts`.

Strict-TDD evidence: RED — prove provider adaptation, explicit selectors, stable/alpha eligibility, and canonical identity derivation agree on normalized tag acceptance; GREEN — replace resolver and adapter tag parsing with the shared validator while preserving pure SemVer ordering and provider adaptation; TRIANGULATE — cover final/alpha tags, beta/rc ineligibility, build metadata, shorthand explicit selectors, and malformed tags; REFACTOR — keep one syntax owner and remove duplicate regex paths without coupling record I/O to artifact verification.

Focused Bun command: `bun test tests/release-update-contract.test.ts`

Stop conditions: stop if alignment changes stable/alpha eligibility, requires acquisition or marker mutation, or rejects an eligible candidate merely because identity is pending; parser agreement is the only behavior owned here.

- [x] 9.1 Drive `installer/src/core/release-resolver.ts` from RED to GREEN against the shared normalized-tag validator.
  - skills: `bun`, `release`, `ein-discipline`
  - why: Selector parsing, eligibility, and SemVer extraction must start from the same normalized tag accepted by canonical identity.
  - learn: Shared syntax does not imply shared policy: the resolver still owns channel eligibility and SemVer precedence after normalization.
  - architecture: Consume the `release-types.ts` validator in `release-resolver.ts`, preserving `selectHighestRelease` as the pure ordering authority.
  - avoid: Do not duplicate the shared regex, accept beta/rc on alpha, or move network adaptation into the resolver.
  - verify: `bun test tests/release-update-contract.test.ts`

- [x] 9.2 Align `installer/src/core/release-record.ts`, then TRIANGULATE and REFACTOR the cross-stage matrix.
  - skills: `release`, `bun`, `ein-discipline`
  - why: Provider records must enter selection with the same canonical normalized tag later used to derive immutable identity.
  - learn: Adapters should normalize provider syntax once and preserve uncertainty; they should not pre-claim verified byte identity.
  - architecture: Have record adaptation call the shared validator and continue emitting pending identity; keep draft/prerelease eligibility in `release-resolver.ts`.
  - avoid: Do not derive `artifactId` from provider metadata, silently repair malformed tags, or add candidate-list fetching in this group.
  - verify: `bun test tests/release-update-contract.test.ts`

## // 010. Candidate-list fetch and highest-eligible adaptation path

Production files: `installer/src/core/release-record.ts`.

Strict-TDD evidence: RED — prove latest resolution receives a provider candidate list containing finals, alpha prereleases, drafts, malformed tags, and unsupported prereleases rather than trusting one `/latest` record; GREEN — add the smallest list fetch/adaptation path and delegate highest-eligible choice to `selectHighestRelease`; TRIANGULATE — cover stable highest final, alpha highest final-or-alpha by SemVer, empty/all-ineligible lists, malformed list payloads, and explicit tag fetch compatibility; REFACTOR — reuse single-record adaptation and keep provider pagination/publication outside 1A.

Focused Bun command: `bun test tests/release-update-contract.test.ts`

Stop conditions: stop if correctness would require publication workflow changes, exhaustive GitHub pagination, promotion logic, or 1B metadata; fail closed on an unusable candidate response and do not treat provider `/latest` ordering as SemVer authority.

- [x] 10.1 Add RED provider-list fixtures in `tests/release-update-contract.test.ts` for highest-eligible selection.
  - skills: `bun`, `release`, `ein-discipline`
  - why: A single provider `/latest` record cannot guarantee the highest eligible alpha across finals and supported alpha prereleases.
  - learn: Provider ordering and channel semantics are different authorities; deterministic core selection must decide after bounded adaptation.
  - architecture: Exercise `installer/src/core/release-record.ts` with injected HTTP evidence and assert delegation to the existing pure resolver contract.
  - avoid: Do not mock selection as “first item wins,” add publication, or infer eligibility from mutable display fields.
  - verify: `bun test tests/release-update-contract.test.ts`

- [x] 10.2 Implement GREEN list fetching/adaptation, TRIANGULATE failures, and REFACTOR in `installer/src/core/release-record.ts`.
  - skills: `release`, `bun`, `ein-discipline`
  - why: Latest candidate discovery needs enough bounded evidence for `selectHighestRelease` to guarantee the channel contract.
  - learn: An I/O adapter should return normalized candidates or a selected pure-policy result without reimplementing SemVer comparison.
  - architecture: Reuse `adaptReleaseRecord`, pass the effective channel to `selectHighestRelease`, retain exact-tag fetch behavior, and expose no publication producer behavior.
  - avoid: Do not duplicate SemVer comparison, silently accept malformed top-level payloads, or expand into pagination/promotion/1B.
  - verify: `bun test tests/release-update-contract.test.ts`

## // 011. Channel-aware acquisition uses the selected candidate

Production files: `installer/src/core/acquisition.ts`.

Strict-TDD evidence: RED — prove latest acquisition on alpha downloads the highest eligible final-or-alpha candidate from the adapted list, stable downloads only the highest final, explicit tags remain exact, and invalid channels never acquire bytes; GREEN — thread an explicit effective channel through acquisition metadata fetch and resolution; TRIANGULATE — cover final outranking alpha, alpha outranking an older final, beta/rc exclusion, pending identity before digest verification, and selected-record asset lookup; REFACTOR — keep candidate policy in the resolver and byte verification in acquisition.

Focused Bun command: `bun test tests/release-update-state-primitives.test.ts`

Stop conditions: stop before any filesystem mutation if channel evidence is unavailable or candidate selection fails; do not add publication, require identity before download, or let asset selection use a different record from the resolver-selected candidate.

- [x] 11.1 Add RED acquisition fixtures in `tests/release-update-state-primitives.test.ts` for explicit stable/alpha candidate choice.
  - skills: `bun`, `release`, `ein-discipline`
  - why: Even a correct pure resolver is ineffective if acquisition still fetches one stable-defaulted record.
  - learn: The chosen release and the assets downloaded must come from the same resolved candidate to preserve evidence continuity.
  - architecture: Exercise `installer/src/core/acquisition.ts` with candidate-list HTTP fixtures and observable asset URLs before any local commit path runs.
  - avoid: Do not test only resolver output, hide channel defaults in fixtures, or pre-verify identity from provider metadata.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

- [x] 11.2 Implement GREEN channel propagation, TRIANGULATE candidate/asset cases, and REFACTOR in `installer/src/core/acquisition.ts`.
  - skills: `release`, `bun`, `ein-discipline`
  - why: Acquisition must ask discovery and resolution for the caller's effective channel instead of relying on stable defaults.
  - learn: Defaults belong at the installation preference boundary; deeper consumers should receive the resolved domain value explicitly.
  - architecture: Add effective `ReleaseChannel` input to acquisition, use list-backed latest selection, preserve exact-tag behavior, and derive identity only after digest verification.
  - avoid: Do not silently coerce invalid preferences, select assets before resolving the candidate, or move marker mutation into acquisition.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

## // 012. Transaction propagates effective channel through dry-run, acquisition, and marker commit

Production files: `installer/src/core/transaction.ts`.

Strict-TDD evidence: RED — prove explicit alpha reaches latest dry-run resolution, acquisition, transaction evidence, and the committed/read-back marker, while omitted channel preserves stable compatibility; GREEN — add one transaction channel input and pass it to every candidate-resolution/acquisition/marker seam before mutation; TRIANGULATE — cover stable default, explicit alpha selecting a final or alpha by highest SemVer, invalid/no candidate before mutation, and alpha marker read-back; REFACTOR — centralize the channel value once per transaction without changing rollback authority or journal architecture.

Focused Bun command: `bun test tests/release-update-state-primitives.test.ts`

Stop conditions: stop if any mutation occurs before channel/candidate resolution succeeds, if marker channel differs from the effective transaction channel, or if work would require journal-system consolidation, publication, promotion, or remote rollback.

- [x] 12.1 Add RED transaction fixtures in `tests/release-update-state-primitives.test.ts` for channel continuity and zero mutation on resolution failure.
  - skills: `bun`, `release`, `ein-discipline`
  - why: The actual update path currently reintroduces stable defaults even after alpha preference exists.
  - learn: A channel contract is end-to-end evidence: resolution, downloaded candidate, transaction outcome, and installed marker must agree.
  - architecture: Test `installer/src/core/transaction.ts` as the coordinator that receives an effective channel and passes it to existing owned edges.
  - avoid: Do not infer channel from prerelease syntax after selection, mutate marker/tree on unavailable preference, or claim local transactions move remote channels.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

- [x] 12.2 Implement GREEN propagation, TRIANGULATE stable/alpha and failure cases, and REFACTOR in `installer/src/core/transaction.ts`.
  - skills: `release`, `bun`, `ein-discipline`
  - why: Dry-run, real acquisition, and marker commit must all use the same effective channel before and after local mutation.
  - learn: Passing a resolved closed value is safer than letting each downstream function independently default policy.
  - architecture: Carry one `ReleaseChannel` through `resolveForDryRun`, `acquireRelease`, and `commitMarkerV2`; preserve stable as the compatibility default for direct callers until the CLI supplies preference evidence.
  - avoid: Do not read installation preference inside low-level transaction helpers, hard-code alpha from selected tags, or broaden transaction complexity.
  - verify: `bun test tests/release-update-state-primitives.test.ts`

## // 013. CLI resolves installation preference before recovery or update mutation

Production files: `installer/src/cli/update.ts`.

Strict-TDD evidence: RED — prove absent preference invokes the transaction as stable, explicit alpha invokes it as alpha across runs, and malformed/unreadable preference returns unavailable without recovery, acquisition, transaction, or marker mutation; GREEN — resolve the installation-owned preference before invoking recovery/update and pass its effective channel into the transaction; TRIANGULATE — cover explicit installation path, agent-directory fallback, absent/defaulted stable, persisted alpha, invalid bytes, and read failure; REFACTOR — keep preference ownership in the dedicated core module and result rendering at the existing CLI seam.

Focused Bun command: `bun test tests/release-update-cli.test.ts`

Stop conditions: stop before recovery or update mutation when preference evidence is unavailable; do not read/write client-project settings, silently fall back invalid state to stable, or add a second channel flag/settings owner.

- [x] 13.1 Add RED CLI fixtures in `tests/release-update-cli.test.ts` for pre-mutation preference resolution and fail-closed invalid state.
  - skills: `bun`, `release`, `ein-discipline`
  - why: Reading effective alpha only after the update transaction makes the persisted preference observational rather than behavioral.
  - learn: Fail-closed preferences must be checked before any operation that may mutate local recovery or installed state.
  - architecture: Exercise `installer/src/cli/update.ts` with installation-owned preference bytes and spies at recovery/transaction boundaries.
  - avoid: Do not assert only post-update advisor output, reuse client settings, or permit invalid preference to start recovery.
  - verify: `bun test tests/release-update-cli.test.ts`

- [x] 13.2 Implement GREEN preference handoff, TRIANGULATE paths/failures, and REFACTOR in `installer/src/cli/update.ts`.
  - skills: `release`, `bun`, `ein-discipline`
  - why: `runUpdate` is the existing boundary with the installation path and must supply the resolved channel before the transaction begins.
  - learn: Status projection reports evidence after the fact; command orchestration must consume the same evidence before side effects.
  - architecture: Read `installer/src/core/release-channel-preference.ts` from the managed installation path, pass the effective channel to `runUpdateTransaction`, and render unavailable preference through existing outcome handling.
  - avoid: Do not default malformed/unreadable preference, alter client settings, or implement a new UI/status subsystem.
  - verify: `bun test tests/release-update-cli.test.ts`

## // 014. Terminal journal finalization after proven successful local recovery

Production files: `installer/src/core/transaction.ts`.

Strict-TDD evidence: RED — reproduce a successful local rollback whose retained journal makes the next normal `runUpdate` return `recovery-required` without a callback; GREEN — define a terminal succeeded-recovery state/finalization path that a later normal recovery pass can safely clean or accept without another callback; TRIANGULATE — cover immediate and next-run success, cleanup failure, `attempted`, `failed`, pending transition, malformed evidence, and complete journals; REFACTOR — centralize terminal detection and cleanup while preserving failed/pending diagnostic evidence.

Focused Bun command: `bun test tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts`

Stop conditions: stop if recovery success is not durably proven, if cleanup would delete `attempted`/`failed`/pending/malformed evidence, or if remediation requires merging `install-journal.ts`; uncertainty must remain `recovery-required`.

- [x] 14.1 Add RED recovery and next-normal-run fixtures in `tests/release-update-state-primitives.test.ts` and `tests/release-update-cli.test.ts`.
  - skills: `bun`, `release`, `ein-discipline`
  - why: A proven successful local rollback must not leave a journal that permanently blocks ordinary updates.
  - learn: Retaining forensic evidence and recognizing terminal recovery are compatible when only durably proven success is finalized.
  - architecture: Test direct `recoverPendingTransaction` semantics and the existing `runUpdate` preflight against the same journal evidence contract.
  - avoid: Do not delete failed/pending journals in test setup, inject a recovery callback into the next normal run, or treat missing proof as success.
  - verify: `bun test tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts`

- [x] 14.2 Implement GREEN terminal finalization, TRIANGULATE evidence states, and REFACTOR in `installer/src/core/transaction.ts`.
  - skills: `release`, `bun`, `ein-discipline`
  - why: Recovery needs an idempotent terminal path that unblocks future updates only after a durable succeeded outcome exists.
  - learn: Cleanup is a state transition, not generic deletion: eligibility must be proven from the persisted journal before removal/finalization.
  - architecture: Let `transaction.ts` recognize its own local succeeded rollback evidence and finalize it without a callback; retain and fail closed on every non-terminal or cleanup-failed journal.
  - avoid: Do not remove evidence before persisting success, convert cleanup errors to clean, or consolidate unrelated journal systems.
  - verify: `bun test tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts`

## // 015. Post-remediation focused verification

Production files: none.

Strict-TDD evidence: RED — confirm each remediation group recorded its focused failing behavior before implementation; GREEN — all focused behavior suites pass after the owning minimal production change; TRIANGULATE — the combined suites jointly cover stable/alpha selection, candidate-list ordering, shared tag validation, channel continuity, marker evidence, and terminal recovery; REFACTOR — both typechecks pass after local cleanup only, with no broad complexity-29 refactor.

Focused Bun command: `bun test tests/release-update-contract.test.ts tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts && bun run typecheck && (cd installer && bun run typecheck)`

Stop conditions: stop and return to the owning remediation group on any focused or typecheck failure; do not run a build, publication command, complexity-29 refactor, or unrelated dirty-file cleanup.

- [x] 15.1 Run the three focused suites and both typechecks, preserving per-group RED→GREEN→TRIANGULATE→REFACTOR evidence.
  - skills: `bun`, `release`, `ein-discipline`
  - why: The audit closes only when behavior and both TypeScript surfaces jointly prove the remediated 1A contract.
  - learn: Bun tests execute TypeScript but do not replace static typechecking; both root and installer typechecks remain required.
  - architecture: Verify only milestone 1A consumer paths and leave publication/1B, build output, and the unrelated complexity-29 refactor untouched.
  - avoid: Do not run a production build, fix unrelated dirty files, publish, or broaden scope in response to a focused failure.
  - verify: `bun test tests/release-update-contract.test.ts tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts && bun run typecheck && (cd installer && bun run typecheck)`
