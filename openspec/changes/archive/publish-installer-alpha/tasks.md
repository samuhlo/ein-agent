# Tasks — publish-installer-alpha

status: ready
blocked_by: none

## // 001. Prerelease-aware GitHub publication contract

- [x] 1.1 Add strict-TDD coverage and the narrow workflow changes for shared push/dispatch tag classification, metadata coherence, and conditional prerelease publication.
  - skills: `release`, `github-workflow`, `bun`, `ein-discipline`
  - production: `.github/workflows/installer-release.yml`
  - tests: `tests/release-asset-contract.test.ts`
  - cycle: RED — add contract cases for canonical final/alpha tags, malformed or unsupported prereleases, pointer/changelog disagreement, and alpha-only `--prerelease`; GREEN — implement one native classifier and pre-build coherence gate, then conditionally append `--prerelease`; TRIANGULATE — prove stable tags omit the flag and both push/dispatch retain the main-tip gate plus `allow_non_main_tag=true`; REFACTOR — remove duplicated classification without changing the six assets, title, notes, or gate ordering.
  - why: GitHub must publish `installer-v0.82.0-alpha.1` as a prerelease without weakening stable publication or ancestry protection.
  - learn: Release classification and release ancestry are separate policies and should remain independently testable.
  - architecture: Keep validation and publication metadata at the Actions boundary; GitHub Actions remains the only production publication path after merge.
  - avoid: Do not loosen the main-tip check, bypass pointer agreement, add a local publisher, or invoke `gh` during apply.
  - verify: `bun test tests/release-asset-contract.test.ts`
  - stop: Stop on any failure, if a final tag receives `--prerelease`, if alpha can bypass main-tip policy, or if build/publication could begin before validation.

## // 002. Exact bootstrap asset and checksum acquisition

- [x] 2.1 Drive `install.sh` from failing process fixtures to an inseparable `--release-channel`/`--release-tag` contract with exact-tag downloads and unchanged stable defaults.
  - skills: `release`, `bun`, `architecture`, `ein-discipline`
  - production: `installer/install.sh`
  - tests: `tests/install-sh-checksum.test.ts`
  - cycle: RED — cover both-or-neither arguments, canonical alpha acceptance, malformed/`beta`/`rc` rejection before curl, exact binary and manifest URLs, stable latest URLs, checksum ordering, and exact Pi argv; GREEN — bind both downloads to `/releases/download/<tag>/` and hand the verified binary `install --runtime pi --release-channel <channel> --release-tag <tag>`; TRIANGULATE — exercise stable no-input, exact alpha, partial contract, wrong manifest entry, duplicate entry, and digest mismatch; REFACTOR — centralize selector validation and one base URL without disturbing platform, WSL, `/dev/tty`, cleanup, or checksum guards.
  - why: An explicit alpha bootstrap must never mix an exact binary with the latest stable checksum or silently fall back to latest.
  - learn: The release selector is one integrity boundary even though channel and immutable tag are separate fields.
  - architecture: The shell owns acquisition, checksum verification, and handoff only; it must not write managed installation state.
  - avoid: Do not add a tag-only or `--alpha` shortcut, access the network in tests, edit `tests/install-sh-wsl.test.ts` unless a preserved WSL assertion truly needs it, or run a production build.
  - verify: `bun test tests/install-sh-checksum.test.ts`
  - stop: Stop on any fixture network escape, any explicit path containing `/releases/latest/download`, checksum after chmod/move/exec, or changed no-input/WSL behavior.

## // 003. Installer binary admission of the release contract

- [x] 3.1 Validate the handed-off channel/tag at the binary boundary before planning or mutation, admitting explicit alpha only for the Pi route and only when the tag matches the running installer version.
  - skills: `release`, `bun`, `architecture`, `ein-discipline`
  - production: `installer/src/main.ts`, `installer/src/core/release-types.ts`, `installer/src/core/release-resolver.ts`
  - tests: `tests/installer-runtime-menu.test.ts`
  - cycle: RED — add vectors for missing halves, malformed SemVer, leading zeroes, unsupported prerelease vocabulary, channel/tag mismatch, compiled-version mismatch, and alpha with `claude`/`both`; GREEN — parse the two flags as one contract and reuse the closed channel/resolver vocabulary before constructing mutable install work; TRIANGULATE — prove no-input remains stable, exact final behavior remains valid, alpha Pi succeeds, and terminal/manual branches print the same bound Pi command; REFACTOR — keep classification in the existing resolver/types surface and the CLI edge thin.
  - why: A checksum-valid binary still must reject a forged, stale, partial, or non-Pi alpha contract before touching an installation.
  - learn: Artifact integrity proves bytes; runtime admission separately proves that those bytes are eligible for the requested local operation.
  - architecture: `main.ts` owns argument admission, existing release domain modules own vocabulary/classification, and no process-global channel state is introduced.
  - avoid: Do not trust shell validation alone, infer alpha from the tag without the explicit channel, permit Claude targets, or start a plan before validation completes.
  - verify: `bun test tests/installer-runtime-menu.test.ts`
  - stop: Stop if any invalid contract reaches mutable handlers, if default installs stop resolving stable, or if the implementation requires a new store/parser abstraction.

## // 004. Pi installation preference commit and read-back

- [x] 4.1 Commit the resolved channel at `pi.write-install-marker`, require explicit matching read-back, and use that value for the marker while preserving recovery evidence and non-target bytes.
  - skills: `release`, `bun`, `architecture`, `ein-discipline`
  - production: `installer/src/cli/install.ts`
  - owned dependency reused unchanged: `installer/src/core/release-channel-preference.ts`
  - tests: `tests/installer-runtime-menu.test.ts`, `tests/release-update-contract.test.ts`, `tests/release-update-cli.test.ts`
  - cycle: RED — prove alpha persistence under the resolved managed Pi `agentDir`, marker/advisor/update read-back, write/read/mismatch failure, journal recovery evidence, and byte-for-byte isolation of vanilla Pi, Claude Ein, vanilla Claude, and client settings; GREEN — call `writeReleaseChannelPreference(context().agentDir, channel)`, require matching explicit read-back, then write the marker from that value; TRIANGULATE — cover default stable, explicit alpha, managed legacy Pi context, prior-file preservation on pre-rename failure, and later-run alpha resolution; REFACTOR — keep the commit at the existing marker boundary and reuse the atomic preference primitive rather than adding a plan step or store.
  - why: Installation success is truthful only when the Pi-scoped preference can be proven durable and readable by later consumers.
  - learn: Fail-closed persistence needs positive read-back evidence; absence, unreadable bytes, or mismatch is not equivalent to the stable default.
  - architecture: `paths.ts` remains destination authority, the preference module remains atomic-I/O authority, and the Pi marker handler is the single install commit boundary.
  - avoid: Do not write `~/.pi/agent`, Claude/client homes, hard-code `stable` into the marker, swallow persistence errors, or claim remote rollback.
  - verify: `bun test tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts`
  - stop: Stop if marker, doctor, launcher, promotion, or success can run after unproven persistence; if prior preference bytes are lost before rename; or if any non-target fixture changes.

## // 005. Synchronized `0.82.0-alpha.1` release pointers

- [x] 5.1 Move the three authorized release pointers together and add the leading changelog entry for `0.82.0-alpha.1` without weakening the generic agreement contract.
  - skills: `release`, `bun`, `ein-discipline`
  - production: `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md`
  - tests: `tests/release-asset-contract.test.ts` (reuse unchanged for pointer agreement)
  - cycle: RED — after changing the first pointer, capture the existing agreement test failing on intentional temporary drift; GREEN — synchronize the remaining pointers and leading changelog heading to `0.82.0-alpha.1`; TRIANGULATE — verify the contract still accepts publishable SemVer shape and rejects pointer disagreement rather than pinning a test-only literal; REFACTOR — remove no release history and keep the changelog entry limited to this scoped slice.
  - why: The workflow coherence gate must observe one version across package metadata, runtime identity, and release notes.
  - learn: A release version is a distributed invariant; the test should enforce agreement, not become a fourth version pointer.
  - architecture: These remain the only three authorized release pointers; no generated or test-owned version authority is added.
  - avoid: Do not edit the test merely to accept drift, update unrelated roadmap/version references, tag, publish, install, or run a production build.
  - verify: `bun test tests/release-asset-contract.test.ts`
  - stop: Stop if any pointer differs, the new changelog entry is not leading, unrelated history changes, or the agreement test requires a literal pin.

## // 006. Focused, offline, and full verification preparation

- [x] 6.1 Run the complete local verification ladder and preserve evidence without crossing the post-merge delivery boundary.
  - skills: `bun`, `release`, `github-workflow`, `ein-discipline`
  - production: none
  - tests: `tests/release-asset-contract.test.ts`, `tests/install-sh-checksum.test.ts`, `tests/installer-runtime-menu.test.ts`, `tests/release-update-contract.test.ts`, `tests/release-update-cli.test.ts`, then the full repository suite
  - cycle: RED/GREEN evidence — confirm each behavior group recorded its initial focused failure and passing implementation; TRIANGULATE — rerun all focused contracts together using only local fixtures; REFACTOR check — rerun both typechecks and the full suite after cleanup, with no production artifact build.
  - why: The release slice needs evidence across native workflow/shell contracts, TypeScript behavior, types, and repository integration before review and merge.
  - learn: Bun executes tests but does not typecheck; both repository typecheck boundaries are independent required gates.
  - architecture: Local apply/verify proves code preparation only; the release workflow after merge owns production binaries, checksums, and GitHub publication.
  - avoid: Do not run `build:all` or any production build, create/push a git tag, call GitHub publication APIs, inspect remote release assets, or perform a real installation.
  - verify: `bun test tests/release-asset-contract.test.ts tests/install-sh-checksum.test.ts tests/installer-runtime-menu.test.ts tests/release-update-contract.test.ts tests/release-update-cli.test.ts && bun run typecheck && (cd installer && bun run typecheck) && bun test`
  - stop: Stop at the first failed focused test, either failed typecheck, failed full suite, unexpected network access, or any attempted delivery side effect; route fixes back to the owning group before rerunning the ladder.
