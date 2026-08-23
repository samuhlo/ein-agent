status: complete
scope_status: bounded
change: add-stable-alpha-release-contract
phase: map

## Map outcome

Milestone 1A is a focused installer contract slice. The current resolver accepts only final SemVer releases and hard-codes eligibility independent of channel; marker v2 stores a free-form `channel` plus release tag and asset digest, while transaction journals store target tag and artifact paths but no immutable artifact identity or rollback outcome. Existing read/status and CLI surfaces are the narrow extension seams; no remote publication code is required.

## Implementation surface

### Release vocabulary, selector, eligibility, resolution

- `installer/src/core/release-types.ts`
  - Owns `ReleaseSelector`, `ReleaseRecord`, `ResolvedRelease`, `AssetDigest`, marker types, update outcomes, and shared `Result`/stage errors.
  - Current `ReleaseRecord` lacks an explicit prerelease vocabulary, publication timestamp/expiration evidence, and artifact identity. `MarkerV1/V2.channel` is an unconstrained string.
- `installer/src/core/release-resolver.ts`
  - `normalizeTag`, `parseSelector`, `isEligibleRelease`, and `resolveRecord` are the deterministic decision seam.
  - `isEligibleRelease` currently rejects all prereleases and has no channel input. `parseSelector` wording assumes stable-only versions.
- `installer/src/core/release-record.ts`
  - Parses GitHub release metadata and applies eligibility before returning records. Its provider shape currently exposes only boolean `draft`/`prerelease`, so alpha classification and explicit expiration evidence must be represented here or in a bounded contract adapter; do not add publication workflow behavior.
- `installer/src/core/acquisition.ts` / `installer/src/core/asset-selector.ts`
  - Consume `ResolvedRelease` and digest evidence. They are downstream identity/eligibility consumers, not remote channel authorities; update only if the designed identity contract requires propagation.

### Persisted preference and effective status

- `installer/src/core/settings.ts`
  - Preserves user `settings.json` fields across template deployment. It is not currently an Ein release-channel store; adding channel preference here risks mixing installation-owned release state with client/project settings.
  - Design should choose a bounded installation-scoped persistence seam, with absent => `stable`, valid explicit value reproducible, malformed/unreadable => `unavailable`, and no client-project preference mutation.
- `installer/src/core/marker-v2.ts`
  - Atomic marker write/read-back and migration are the installed-state seam. `commitMarkerV2` currently hard-codes `channel: "stable"` and verifies tag/version/template/asset fields but no shared `artifactId`.
  - Marker read failure currently returns null; new status must distinguish unavailable/invalid rather than silently selecting alpha.
- `installer/src/core/update-advisor-read.ts`
  - Existing read-only evidence composition already models status/freshness (`current|stale|unknown`) and unavailable/ambiguous states. It is a likely core status projection seam, provided it gains preference/effective channel, version, artifactId, and alpha freshness/expiration without claiming current on uncertainty.
- `installer/src/tui/banner.ts`
  - Current banner state reads marker and pending-journal presence and renders running binary version/recovery-required only. Extend only the existing status/result boundary; do not redesign banner/logo/visual surfaces.
- `installer/src/cli/result.ts` and `installer/src/cli/update.ts`
  - `renderOutcome` is the terminal contract for update outcomes; `runUpdate` resolves selector, recovers pending journal, executes transaction, and prints lines. These are appropriate propagation/rendering seams for minimum effective status, not a new UX system.

### Immutable identity and local rollback evidence

- `installer/src/core/release-types.ts` + `marker-v2.ts`
  - Define one immutable `artifactId` binding release identity to verified asset digest. Preserve it across `ResolvedRelease`, acquired digest/verification, marker commit/read-back, and rollback evidence. Tag/digest/identity disagreement must fail closed.
  - Existing `AssetDigest` is the nearest primitive; it is not itself a cross-authority identity contract.
- `installer/src/core/transaction.ts`
  - `Journal` (schema v1) records tx id, target tag, owner, state/pending state, and backup/artifact paths. `prepare`, transition persistence, rollback cleanup, and `recoverPendingTransaction` are the local rollback authority seam.
  - Extend evidence minimally with previous/attempted artifact IDs, affected managed tree, backup reference, journal state, and rollback outcome. Keep recovery local; do not add channel-pointer mutation, remote rollback, promotion, or cross-authority atomicity.
- `installer/src/core/template-transaction.ts`, executable/backup paths, and `currentIsCoherent`
  - Existing restore/snapshot and binary/template coherence checks provide the affected-tree and verification evidence to correlate. Avoid widening into lifecycle planner/control-plane work.
- `installer/src/core/install-journal.ts` is a separate install-plan journal abstraction; treat as adjacent evidence only unless design proves it is the actual 1A transaction path. Do not merge journal systems in this slice.

## Test seams

- `tests/release-update-contract.test.ts`: channel vocabulary/default/fail-closed persistence, resolver channel-aware eligibility, stable-vs-alpha prerelease fixtures, expiration boundary, and identity conflict cases.
- `tests/release-update-state-primitives.test.ts`: marker artifact identity/read-back, journal/backup correlation, previous/attempted IDs, affected tree, rollback result, malformed evidence fail-closed.
- `tests/release-update-cli.test.ts`: status/result rendering with persisted preference distinct from effective channel, version, artifactId, freshness/expired/unavailable states; preserve existing exit-code contract.
- A dedicated `tests/release-channel-contract.test.ts` is permissible only if it keeps channel policy isolated without expanding the focused test slice.
- No tests were run in map phase (hard phase boundary).

## Dependency and authority graph

`release-record/acquisition → release-resolver(channel + eligibility + expiration) → ResolvedRelease/artifact identity → transaction + marker commit/read-back → update-advisor/banner/CLI status`.

Remote CI/artifact publication owns release publication, channel pointers, promotion, signatures, checksums/read-back, and remote rollback (1B/out of scope). Installer transaction code owns local install, managed tree, backup, journal, restore, and local rollback. `artifactId` is correlation only; neither operation may claim to perform the other authority's rollback.

## Boundaries and risks

- Do not modify GitHub workflow, publication, promotion, signatures, trust roots, or remote rollback.
- Do not build full lifecycle inventory/planner/control plane, Apply Packet/IR, UX redesign, launcher/menu migration, or logo work.
- Alpha expiration needs explicit release evidence and a deterministic policy boundary; current provider data may be insufficient. If identity cannot be derived from verified immutable evidence without changing artifact production, stop and leave that producer concern to 1B.
- Existing `settings.ts` is user/project-settings preservation, not automatically the correct channel persistence owner.

## Ledger

ledger:
  reads:
    - { path: "openspec/changes/add-stable-alpha-release-contract/scope.md", lines: 92, estimated_tokens: 1500 }
    - { path: "openspec/changes/add-stable-alpha-release-contract/specs/installer-release-channels/spec.md", lines: 45, estimated_tokens: 850 }
    - { path: "docs/roadmap-features-ein.md", lines: 430, estimated_tokens: 6500 }
    - { path: "installer/src/core/release-types.ts", lines: 85, estimated_tokens: 850 }
    - { path: "installer/src/core/release-resolver.ts", lines: 54, estimated_tokens: 550 }
    - { path: "installer/src/core/marker-v2.ts", lines: 170, estimated_tokens: 1700 }
    - { path: "installer/src/core/transaction.ts", lines: 370, estimated_tokens: 3600 }
    - { path: "installer/src/tui/banner.ts", lines: 120, estimated_tokens: 1200 }
    - { path: "installer/src/core/settings.ts", lines: 55, estimated_tokens: 500 }
    - { path: "installer/src/cli/result.ts", lines: 75, estimated_tokens: 650 }
    - { path: "installer/src/cli/update.ts", lines: 230, estimated_tokens: 2200 }
    - { path: "tests/release-update-contract.test.ts", lines: 95, estimated_tokens: 950 }
    - { path: "tests/release-update-state-primitives.test.ts", lines: 90, estimated_tokens: 1000 }
    - { path: "tests/release-update-cli.test.ts", lines: 260, estimated_tokens: 2800 }
    - { path: "codegraph: release channel persistence/settings/effective status", lines: 56, estimated_tokens: 1800 }
    - { path: "codegraph: resolver/eligibility/artifact identity/transaction", lines: 210, estimated_tokens: 4200 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 28850, reads: 16 }
  budget_exceeded: true
  budget_note: "The source/context estimate exceeds the nominal token cap due to the supplied scope and focused source/test files; exploration stopped after the bounded surface was mapped."

skill_resolution: paths-injected
skipped_skills:
  - motion: no animation work in scope
  - nuxt-content: no Nuxt Content work in scope
  - nuxt-modules: no Nuxt module work in scope
  - document-writer: map artifact is engineering notes, not public documentation
  - vue-router-best-practices: no routing work in scope
