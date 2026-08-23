# Design — add-stable-alpha-release-contract

## A. Proposal

### Intent

Define milestone 1A as a small, deterministic installer contract for `stable` and `alpha`: channel choice is installation-scoped and observable, stable selects only final releases, alpha selects finals or supported alpha prereleases, and both choose the highest eligible Semantic Version. Candidate discovery may precede identity verification, but artifact/rollback evidence fails closed before local commit; alpha freshness remains evidence-gated.

### Scope

**In scope**

- The complete release-channel vocabulary: `stable` and `alpha` only.
- Deterministic resolution of absent, valid, invalid, and unreadable persisted preference.
- Installation-scoped channel persistence that does not alter client-project settings.
- Channel-aware final/prerelease eligibility and highest-eligible Semantic Version selection.
- A minimal status projection exposing persisted preference, effective channel, installed version, verified `artifactId` when available, and honest identity/freshness availability.
- An immutable artifact identity derived from the selected tag and verified digest before local commit, then preserved through marker commit/read-back and local rollback evidence.
- Minimum local alpha transaction and rollback evidence, with remote and local authorities kept separate.

**Out of scope**

- CI publication, GitHub release workflow changes, signatures, trust roots, and artifact-producer changes.
- Alpha-to-stable promotion automation or remote rollback implementation.
- Alpha-expiration enforcement until explicit immutable publication evidence and policy metadata exist; this is 1B/later work.
- Full lifecycle inventory/planner, exact dry-run, installer visual redesign, Apply Packet/IR, launcher/menu work, and logo work.

### Affected areas

- Channel and identity contracts: `installer/src/core/release-types.ts`.
- Record adaptation and deterministic resolution: `installer/src/core/release-record.ts`, `installer/src/core/release-resolver.ts`.
- Installation-owned preference: one bounded core persistence module; `installer/src/core/settings.ts` remains client/project settings and is not the owner.
- Installed-state identity: `installer/src/core/marker-v2.ts`; acquisition propagation only where required to turn a selected candidate and verified digest into canonical identity before local commit.
- Local transaction evidence: `installer/src/core/transaction.ts`; no journal-system consolidation.
- Existing status/result edges only: `installer/src/core/update-advisor-read.ts`, `installer/src/cli/result.ts`, `installer/src/cli/update.ts`, and the existing banner status boundary if needed.
- Focused tests: `tests/release-update-contract.test.ts`, `tests/release-update-state-primitives.test.ts`, and `tests/release-update-cli.test.ts` (or one isolated channel-contract fixture if that reduces churn).

### Risks

- A free-form or shared settings field could leak Ein's alpha choice into client projects.
- Pending, missing, or conflicting digest/tag evidence could be mistaken for verified identity or could be gated too early and incorrectly prevent candidate examination.
- Current provider metadata cannot evidence alpha age; deriving it from local clocks or mutable timestamps would fabricate freshness.
- Extending transaction evidence could accidentally imply that local rollback controls a remote channel.

### Rollback

Set each affected installation preference back to `stable`, restore the previous locally verified artifact through the existing installer rollback path, and then revert the 1A contract/persistence changes. Preserve rollback records for diagnosis; do not rewrite remote channel evidence or silently reinterpret an unreadable new preference as stable.

### Success criteria

- Absent preference resolves to stable; persisted `stable` and `alpha` reproduce across runs; invalid/unreadable state returns unavailable.
- Ein can persist alpha for its own installation while client-project stable settings remain byte-for-byte unchanged.
- Stable accepts only non-draft finals; alpha accepts non-draft finals and supported non-draft alpha SemVer prereleases; each selects the highest eligible version and alpha rejects beta, rc, and unknown prereleases.
- Existing output exposes preference and effective channel separately with evidenced version, verified identity when available, and honest pending/unavailable evidence state.
- Candidate selection and acquisition can proceed with identity pending; after digest verification, missing or conflicting canonical identity blocks local commit before marker mutation.
- Local rollback records identify the attempted transition without claiming remote rollback or signature authenticity.
- Without immutable publication evidence or an applicable deterministic policy, 1A reports alpha expiration as unknown/unavailable rather than current.

### Specification inputs

- Structured delta: `openspec/changes/add-stable-alpha-release-contract/specs/installer-release-channels/spec.md`.
- Canonical OpenSpec context: none was supplied in `scope.md`; no `openspec/specs/<domain>/spec.md` is added or inferred by this design.

## B. Spec

### R1. Channel vocabulary and deterministic resolution

The system **MUST** recognize exactly `stable` and `alpha` as release channels. An absent persisted preference **MUST** resolve to effective `stable`; a valid explicit preference **MUST** resolve identically across runs; an unsupported, malformed, or unreadable value **MUST** yield unavailable with no effective channel and **MUST NOT** fall back.

**Scenario**

- **Given** preference state is absent, valid `stable`, valid `alpha`, unsupported, malformed, or unreadable,
- **When** effective channel is resolved,
- **Then** absence produces stable, valid values reproduce exactly, and all invalid/unreadable cases produce unavailable without selecting either channel.

### R2. Installation-scoped persistence and isolation

The system **MUST** persist channel preference under the owning Ein installation, independently of client/project settings. Changing Ein's preference to alpha **MUST NOT** read, write, migrate, or reinterpret client-project settings, whose bytes **MUST** remain unchanged; persistence **SHOULD** use atomic write/read-back semantics and fail closed on a mismatch.

**Scenario**

- **Given** an Ein installation and one or more client projects are stable,
- **When** the Ein installation persists alpha and resolves again,
- **Then** Ein resolves alpha while every client settings file remains byte-for-byte unchanged, including after a new process starts.

### R3. Channel-aware release eligibility and ordering

The system **MUST** allow stable to consider only non-draft final SemVer releases. It **MUST** allow alpha to consider non-draft final SemVer releases and non-draft SemVer prereleases whose first prerelease identifier is exactly `alpha`. Both channels **MUST** order eligible candidates by Semantic Version and select the highest; drafts, malformed versions, and `beta`, `rc`, or unknown prerelease vocabularies **MUST** be rejected. Eligibility and ordering **MUST** occur before acquisition or local mutation.

**Scenario**

- **Given** multiple final, `alpha`, `beta`/`rc`/unknown prerelease, malformed, and draft release records,
- **When** eligibility and ordering are evaluated for stable and alpha,
- **Then** stable selects the highest eligible final, alpha selects the highest eligible final or `alpha` prerelease, and no unsupported or draft candidate is selected.

### R4. Honest effective-channel status

The system **MUST** expose persisted preference and effective channel as separate fields together with evidenced installed version, verified immutable `artifactId` when available, and identity/freshness state through an existing status/result surface. Identity pending verification **MUST** remain visibly pending or unavailable; absent preference may be shown as defaulted, but unavailable, stale, conflicting, expired, or unknown evidence **MUST NOT** be rendered as current.

**Scenario**

- **Given** an absent, alpha, invalid, pending-verification, stale, conflicting, expired, or unavailable channel/installation state,
- **When** status is returned or rendered,
- **Then** preference and effective channel remain distinguishable, version and `artifactId` are shown when evidenced, and uncertainty is visibly unknown/unavailable rather than current.

### R5. Verify canonical artifact identity before local commit

The system **MUST** define `artifactId` as the canonical binding `<normalized-release-tag>@sha256:<lowercase-verified-digest>`. Candidate examination, channel selection, and acquisition **MAY** proceed while identity is pending. After digest verification and before any local commit or marker mutation, the system **MUST** derive and require the canonical `artifactId`; missing or conflicting verified tag, digest, or identifier evidence **MUST** block that commit. The verified value **MUST** then be preserved through installed marker, marker read-back, and local rollback evidence.

Digest verification **MUST NOT** be represented as signature or authenticity evidence, and 1A **MUST NOT** invent producer metadata or signatures. Pending or unavailable identity **MUST** be reported honestly without disqualifying an otherwise eligible candidate before the commit gate.

**Scenario**

- **Given** a channel-eligible selected candidate whose bytes can be acquired and whose tag/digest evidence may later agree, conflict, or remain missing,
- **When** the installer verifies the digest and attempts local commit, marker mutation, read-back, or rollback recording,
- **Then** selection and acquisition may occur with identity pending, but commit occurs only with one canonical `artifactId` preserved across local evidence; missing or conflicting verified identity blocks commit and no signature-authenticity claim is emitted.

### R6. Minimum local alpha rollback evidence

Before an alpha transaction is reported as safely dogfoodable, the installer **MUST** retain the previous `artifactId` (or explicit none), attempted `artifactId`, affected managed tree, backup reference, journal state, and explicit rollback outcome. Missing or malformed evidence **MUST NOT** count as successful rollback or safe dogfooding.

**Scenario**

- **Given** Ein attempts an eligible alpha transition and the transaction succeeds, fails, or requires restoration,
- **When** transaction evidence is inspected,
- **Then** it identifies both ends of the artifact transition, the exact local tree and backup, state and outcome, and never converts absent evidence into success.

### R7. Separate remote and local authorities

The system **MUST** treat remote publication/channel movement and local install/backup/journal/restore/rollback as separate authorities. A shared `artifactId` **MAY** correlate their evidence, but no local operation **MUST** mutate or claim to mutate a remote channel, and no remote operation **MUST** claim local-tree restoration or cross-authority atomicity.

**Scenario**

- **Given** remote and local records refer to the same `artifactId`,
- **When** local rollback or remote channel movement is reported,
- **Then** each report names only its own authority and outcome, with no claim that the other authority was changed.

### R8. Alpha expiration remains evidence-gated

The system **MUST** evaluate alpha expiration only from explicit immutable publication evidence and an applicable deterministic policy. In 1A, when either input is absent, expiration/freshness **MUST** remain unknown or unavailable; the system **MUST NOT** infer age from download time, install time, mutable release fields, or wall-clock guesses, report uncertain alpha evidence as current, or change stable channel state implicitly. Complete future evidence **MUST** be evaluated reproducibly at the defined boundary.

**Scenario**

- **Given** an eligible alpha or final selected on the alpha channel whose current metadata lacks immutable publication evidence or an applicable expiration policy,
- **When** 1A renders effective alpha-channel status,
- **Then** expiration is unknown/unavailable, no fabricated freshness timestamp is created, the release is not called current on that basis, and stable channel state remains unchanged.

## C. Decisions

1. **Use a closed two-value channel type.** `stable` and `alpha` are domain values; absent and unavailable are resolution states, not extra channels. This prevents typo-driven eligibility changes.
2. **Keep preference installation-owned.** A small dedicated persistence boundary is preferred over reusing `settings.ts`, because that module preserves client/project settings and would violate dogfooding isolation.
3. **Resolve eligibility and order before I/O-heavy acquisition.** Parsing, preference resolution, eligibility, and Semantic Version ordering remain deterministic core decisions. Identity is deliberately not a prerequisite at this stage; filesystem/network reads and digest verification stay at existing edges.
4. **Gate local commit on content-bound identity.** After acquisition verifies the SHA-256 digest, the normalized tag plus digest becomes mandatory canonical identity before local commit or marker mutation. It provides integrity correlation, not signature-based authenticity; producer manifests and signatures remain outside 1A.
5. **Extend the active local transaction path only.** Add the minimum evidence to the current update journal/marker flow; do not merge `install-journal.ts`, create a lifecycle planner, or introduce a remote/local transaction coordinator.
6. **Project status through existing surfaces.** Add contract fields to current read/result/banner seams only; no visual redesign or second status system.
7. **Keep expiration evidence-gated rather than fabricate it.** Evaluation is permitted only with immutable publication evidence and deterministic policy. When either is absent in 1A, the observable result is unknown/unavailable.

### Boundaries

- `release-types` and resolver policy own vocabulary, eligibility, Semantic Version ordering, selection, and resolution states; selection may carry pending identity.
- The dedicated installation persistence edge owns preference bytes per managed Ein installation and atomic read-back; it does not own or touch project settings.
- Acquisition verifies digest evidence and establishes canonical identity before the local commit gate; marker/transaction code preserves verified identity and local outcomes.
- Status adapters render evidence without upgrading uncertainty.
- CI/remote artifact infrastructure owns future publication, promotion, signature, expiration-source metadata, and remote rollback.

### Alternatives rejected

- **Reuse project `settings.json`:** rejected because Ein alpha dogfooding could alter client stable state.
- **Fallback invalid state to stable:** rejected because it hides corruption and violates fail-closed resolution.
- **Limit alpha to prereleases:** rejected because alpha intentionally considers eligible finals as well as supported alpha prereleases, then selects the highest Semantic Version.
- **Let alpha accept every prerelease:** rejected because `beta`, `rc`, and unknown vocabulary would cross the explicit channel contract.
- **Require canonical identity during initial resolution:** rejected because identity depends on verified artifact bytes; eligible candidate selection and acquisition may proceed with identity pending, while local commit may not.
- **Use tag or digest alone as cross-stage identity:** rejected because the contract must detect either release-identity or byte-identity conflicts.
- **Derive alpha age from install/download/current mutable timestamps:** rejected because none proves immutable publication freshness.
- **Coordinate remote and local rollback as one transaction:** rejected because the authorities, failure domains, and ownership differ.

## D. Success Criteria

1. Focused strict-TDD fixtures cover all R1–R8 scenarios, including default/valid/invalid persistence, process restart, byte-for-byte project-setting isolation, the ordered eligibility matrix for both channels, pending and verified identity status, the pre-commit identity gate, rollback evidence, authority wording, and unknown alpha expiration.
2. Existing stable behavior remains compatible: stable never consumes prereleases and selects the highest eligible final; malformed/free-form channel state fails closed, while incomplete or conflicting identity blocks at the pre-commit gate and never blocks eligible candidate selection or acquisition.
3. No CI workflow, publication, signature, promotion, remote rollback, lifecycle planner, visual redesign, Apply Packet, or logo file is changed.
4. Required focused verification after implementation:
   - `bun test tests/release-update-contract.test.ts tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts`
   - `cd installer && bun run typecheck`
5. Run repository `bun run typecheck` only if shared/root types are touched, as required by project convention.
6. Verification must explicitly show that alpha can select either an eligible final or alpha prerelease by highest SemVer while rejecting beta/rc/unknown prereleases; stable never selects a prerelease.
7. Verification must explicitly show that candidate selection/acquisition permits pending identity, missing or conflicting verified identity blocks local commit before marker mutation, missing expiration evidence is unknown/unavailable, and local rollback output makes neither a remote-channel nor signature-authenticity claim.
