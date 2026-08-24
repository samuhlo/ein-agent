# Scope — add-stable-alpha-release-contract

## SCOPE PACKET

scope: Define milestone 1A only: a bounded deterministic stable/alpha release-channel contract covering channel resolution and persistence, honest effective status, alpha-only prerelease eligibility and expiration, immutable artifact identity, and minimum local rollback evidence, while keeping remote publication authority separate from local installer rollback authority.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000

## Outcome

Ein can opt into an experimental `alpha` channel without allowing client projects on `stable` to consume prereleases. The contract makes the selected and effective channels observable, ties remote and local evidence to one immutable artifact identity, and defines the minimum evidence needed to prove a local alpha rollback without claiming that local recovery moved a remote channel.

## In scope

1. Define the complete channel vocabulary as exactly `stable` and `alpha`.
2. Resolve the channel deterministically: an absent preference defaults to `stable`; a valid explicit preference persists; unsupported or unreadable state fails closed instead of silently changing channels.
3. Expose persisted preference and effective channel as separate values alongside installed version, immutable `artifactId`, and freshness/expiration state.
4. Restrict `stable` to non-draft final releases and `alpha` to non-draft alpha prereleases. Drafts and other prerelease vocabularies are ineligible.
5. Define deterministic alpha expiration from explicit release evidence and policy boundaries. Expired, stale, conflicting, or unavailable evidence is never represented as `current`.
6. Define immutable artifact identity as a binding between release identity and verified artifact digest, preserved across resolution, installed marker, and rollback evidence. Conflicts fail closed.
7. Require minimum local rollback evidence for alpha dogfooding: previous and attempted `artifactId`, affected managed tree, backup reference, journal state, and rollback outcome.
8. Preserve authority separation: remote publication/channel movement owns remote pointers; the installer owns local install, backup, journal, restore, and rollback. The shared `artifactId` provides correlation, not a shared transaction.

## Acceptance boundaries

- With no stored setting, effective resolution is `stable`; valid persisted `stable` or `alpha` is reproducible across runs.
- Invalid/unreadable channel state yields `unavailable` rather than a fallback that could opt a machine into alpha.
- Stable never accepts a prerelease. Alpha accepts only the supported alpha prerelease form. Neither accepts drafts.
- Status reports preference, effective channel, version, `artifactId`, and freshness honestly; an expired alpha is not current and is not promoted implicitly.
- Tag/digest/identity conflicts prevent resolution or commit.
- A local alpha transaction records enough evidence to identify and restore the affected Ein tree, while client project channel preferences remain stable.
- Remote rollback does not claim local restoration; local rollback/repair/restore does not mutate or claim to mutate a remote channel.

## Explicit non-goals

- Full CI publication or changes to the GitHub release workflow.
- Signatures, trust-root selection, or rotation.
- Alpha-to-stable promotion automation or remote rollback implementation.
- Complete lifecycle inventory, common planner, or exact dry-run.
- Installer visual redesign, second-menu removal, launcher redesign, or OpenTUI work.
- Apply Packet/IR, local-model evaluation or promotion, prompt thinning, or micro-lane work.
- Logo or brand geometry work.
- Publishing from a local machine.

## Authority boundary

### Remote publication/channel authority

CI and the remote artifact system own publication, channel pointers, future promotion, and future remote rollback. This change defines only the 1A contract consumed by that future work. It does not publish, promote, sign, or move a remote channel.

### Local installer rollback authority

The installer owns the managed local tree, marker, backup reference, journal, restore, and rollback result. Local rollback may restore the previous local `artifactId`; it cannot move `stable` or `alpha` remotely. No cross-authority atomicity or rollback guarantee is introduced.

## Product and implementation evidence

### Canonical product intent

- `docs/roadmap-features-ein.md` — SHA-256 `a90bf6ebb713bbc564c9ef5393c5f65ecb4ab40baedd755ad63fb5ca29981e13`, 30859 bytes.
- Relevant roadmap units: “Fronteras de autoridad”, “1A. Contrato mínimo stable/alpha”, “1B. Publicación remota determinista”, and the common measurement rows for alpha age/use and rollback separation.

### Canonical OpenSpec context

No canonical OpenSpec domain paths were supplied in the task context, so no existing `openspec/specs/<domain>/spec.md` was read. The new validated delta is bounded to `installer-release-channels` and does not modify existing canonical domains during scope.

### Live source evidence

- `installer/src/core/release-resolver.ts`: `isEligibleRelease` currently rejects every prerelease; selector normalization currently accepts final SemVer only.
- `installer/src/core/release-types.ts`: marker state has an unbounded string `channel`; `MarkerV2` stores release tag and asset digest but no shared immutable `artifactId` contract.
- `installer/src/tui/banner.ts`: current visible status reports the running binary version or recovery requirement, not persisted/effective channel and freshness.
- `installer/src/core/transaction.ts`: local journal/rollback already owns local recovery artifacts and transaction state; it is the boundary to extend with correlated artifact evidence, not with remote channel mutation.

## Focused test context

Strict TDD posture is inherited from `openspec/config.yaml` (`strict_tdd: true`) and must be declared for the change in preflight before apply.

Primary contract fixture:

- `tests/release-update-contract.test.ts` — extend channel parsing/resolution and eligibility fixtures, replacing the current assertion that all prereleases are filtered.

Focused adjacent fixtures:

- `tests/release-update-state-primitives.test.ts` — immutable marker identity, journal/backup correlation, and fail-closed read-back/rollback evidence.
- `tests/release-update-cli.test.ts` — visible persisted/effective channel, version, artifact identity, and freshness/error rendering.

Focused apply/verify command:

`bun test tests/release-update-contract.test.ts tests/release-update-state-primitives.test.ts tests/release-update-cli.test.ts`

Required type safety after implementation:

`cd installer && bun run typecheck`

The repository-level `bun run typecheck` remains a project CI requirement from `EIN.md` if shared/root types are touched. No tests, build, or typecheck were run during scope.

## Expected implementation slice for mapping

Likely production slice, subject to map/design confirmation:

- `installer/src/core/release-types.ts`
- `installer/src/core/release-resolver.ts`
- one bounded channel-setting/status core module if persistence cannot remain in marker primitives
- `installer/src/core/marker-v2.ts` and/or `installer/src/core/transaction.ts` only for immutable identity and minimum rollback evidence
- the existing installer status/result surface needed to expose effective state, without visual redesign

Likely test slice is limited to the three focused files above, with a dedicated `tests/release-channel-contract.test.ts` permitted only if keeping the contract isolated reduces churn.

## Worktree preservation

The worktree was already dirty before this scope. Unrelated modified/untracked files include `EIN.md`, lockfiles, continuity work, docs-site styling, roadmap/evaluation docs, installer backup/install work, existing canonical specs, tests, and archived changes. Preserve all pre-existing bytes and do not stage, revert, format, or otherwise touch them. In particular, the dirty `installer/src/cli/install.ts` and backup/journal-related work are evidence only and are not authorization to edit those unrelated changes.

Files created by this scope are limited to:

- `openspec/changes/add-stable-alpha-release-contract/scope.md`
- `openspec/changes/add-stable-alpha-release-contract/specs/installer-release-channels/spec.md`

## Configuration summary

Existing `openspec/config.yaml` was retained unchanged. It records Bun as runner, `bun test` for apply/verify, `strict_tdd: true`, artifacts under `openspec/changes/`, and installer typecheck via `cd installer && bun run typecheck`. Its detected test count/context may be stale, but updating user-maintained configuration is outside this bounded scope.

## Risks and stop conditions

- Stop if map/design requires implementing remote publication, promotion, signatures, or a shared remote/local transaction; that belongs to 1B or later work.
- Stop if `artifactId` cannot be derived from verified immutable evidence without changing published artifact production; split the producer work into 1B and keep 1A fail-closed.
- Stop if channel persistence would implicitly alter client-project settings when Ein opts into alpha; preferences must remain scoped to their installation/project owner.
- Do not widen into lifecycle inventory/planner or UX redesign to make status visible; expose the minimum contract through an existing result/status boundary.

## Behaviour delta

The validated structured delta is `openspec/changes/add-stable-alpha-release-contract/specs/installer-release-channels/spec.md` (SHA-256 `d96d8d99c6cafb7c95344a8dafffa1bbe76a890b5a729bc3d8d1b754912af980`, 5112 bytes). It is the mandatory behaviour declaration for this change.
