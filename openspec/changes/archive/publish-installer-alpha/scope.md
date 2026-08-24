# Scope — publish-installer-alpha

## SCOPE PACKET

scope: Prepare the minimal deterministic release and bootstrap slice for `installer-v0.82.0-alpha.1`: prerelease-aware GitHub Actions publication, exact-tag bootstrap acquisition, and alpha preference persistence/read-back limited to the managed Pi Ein dogfooding installation. Publication, tag push, workflow execution, asset read-back, and real installation remain post-merge release-delivery work and are not performed during SDD implementation.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 180000

## Outcome

After verified code is merged to `main`, release delivery can publish `installer-v0.82.0-alpha.1` through the existing GitHub Actions workflow and explicitly bootstrap that exact prerelease into the targeted Pi Ein home. Stable tags remain normal releases, the existing main-tip gate is retained, default bootstrap behavior remains stable, and no Claude Ein, vanilla runtime, or client home is changed.

## Included behavior

1. Accept and validate full SemVer installer tags, including prerelease identifiers, for both tag pushes and `workflow_dispatch`.
2. Fail before publication unless the normalized tag agrees with `installer/package.json`, `installer/src/core/version.ts`, and the leading `CHANGELOG.md` release entry.
3. Preserve the current tagged-commit-equals-`main`-tip gate and its explicit maintenance-hotfix escape hatch without weakening it.
4. Pass the GitHub Release prerelease flag for SemVer prerelease tags; publish stable SemVer tags as normal releases.
5. Synchronize the three authorized version pointers to `0.82.0-alpha.1` and add the matching changelog entry.
6. Add an explicit, validated alpha/tag input to `installer/install.sh` that binds both binary and `checksums.txt` downloads to the requested release tag rather than `/releases/latest/download`.
7. Preserve stable bootstrap behavior when no alpha/tag input is supplied.
8. Persist and read back `alpha` only for the explicitly targeted managed Pi Ein dogfooding installation; fail closed if persistence/read-back cannot be proved.
9. Keep publication and installation as a separate release-delivery step after merge to `main`; local production builds are not a publication mechanism.

## Non-goals

- Signatures or trust roots.
- Alpha expiration.
- Full promotion or remote rollback automation.
- Release-candidate pagination.
- Installer frame redesign.
- npm or local publishing.
- Changing client homes, vanilla runtime homes, or Claude Ein.
- Force-pushing or moving a published tag.
- Running a local production build as publication.
- Pushing the tag, waiting for Actions, reading back remote assets, or performing the real dogfooding installation before verified code is merged to `main`.

## Expected change surface

- `.github/workflows/installer-release.yml` — shared push/dispatch tag validation, pointer consistency gate, and conditional prerelease creation while retaining the main-tip gate.
- `installer/install.sh` — explicit validated alpha/tag selection and exact-tag asset/checksum URLs; stable default unchanged.
- `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md` — synchronized `0.82.0-alpha.1` pointers.
- `installer/src/core/release-channel-preference.ts` and the narrow Pi installation call site if needed — targeted persistence/read-back only; reuse the existing deterministic preference primitive rather than introduce another store.
- `tests/release-asset-contract.test.ts` — prerelease-aware version and workflow contract coverage.
- `tests/install-sh-checksum.test.ts` (and `tests/install-sh-wsl.test.ts` only if its preserved branch needs an assertion) — exact-tag URLs, stable default, malformed input, and checksum binding.
- Existing release-channel tests, primarily `tests/release-update-contract.test.ts`, only where needed to prove Pi-target isolation and read-back.

This is an expected map, not permission for broad edits. Map/design must identify the narrow Pi install call path before adding production files.

## Acceptance boundaries

- `installer-v0.82.0-alpha.1` is valid for push and manual dispatch; malformed tags and tag/version/changelog disagreement fail before build/publication.
- A prerelease tag results in `gh release create` being invoked as prerelease; a final tag does not.
- The tip-of-main check remains before build and keeps its existing failure behavior and deliberate hotfix override.
- Explicit bootstrap selection downloads the platform binary and manifest from `/releases/download/installer-v0.82.0-alpha.1/`; it never falls back to GitHub latest stable for either file.
- No explicit selection continues to use the stable path.
- Unsupported prerelease vocabulary or malformed explicit tag fails before download or publication.
- Alpha preference is atomically persisted and read back in the targeted Pi Ein installation only; inability to read back is not reported as success.
- Fixtures prove Claude Ein, vanilla runtimes, and client settings/homes are untouched.
- Release delivery does not begin until focused tests, root typecheck, installer typecheck, full verification, review, and merge to `main` are complete.

## Verification expectations for later phases

Scope does not run tests or builds. Apply/verify should use focused Bun tests for release workflow, shell bootstrap, and release-channel persistence, then the project gates from `EIN.md`: `bun test`, `bun run typecheck`, and `cd installer && bun run typecheck`. Do not use `build:all` as local publication evidence; GitHub Actions owns production artifacts.

## Existing project configuration

- `openspec/config.yaml` exists and remains unchanged.
- Stack: TypeScript ESM on Bun; GitHub Actions owns installer publication.
- Test runner: `bun test`.
- `strict_tdd: true`; the per-change preflight decision remains authoritative in later phases.
- Configured installer typecheck: `cd installer && bun run typecheck`; `EIN.md` additionally requires root `bun run typecheck`.
- Artifact store: canonical OpenSpec files under `openspec/changes/<change>/`.

## Canonical OpenSpec context

Only the explicitly supplied canonical domain was read; total context is within the 3-file / 32 KiB phase limit.

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `installer-release-channels` | `openspec/specs/installer-release-channels/spec.md` | `9232badaf647f2a76e49eb2aa4f70ce48982b340d407ec44665bf3900e0ea240` | 5438 |

The change carries a validated structured delta at `openspec/changes/publish-installer-alpha/specs/installer-release-channels/spec.md` for prerelease publication, exact-tag bootstrap selection, and targeted Pi alpha preference isolation.

## Repository evidence and constraints

- Current workflow accepts only final `installer-vX.Y.Z` dispatch tags and does not mark GitHub Releases prerelease.
- Current `installer/install.sh` always uses `/releases/latest/download` for both binary and checksums.
- Current authorized version pointers are `0.81.0`.
- Existing tests pin asset names, pointer agreement, dispatch checkout/publish wiring, main-tip ordering, checksum validation, WSL behavior, release-channel vocabulary, and preference persistence.
- The working tree already contains many unrelated and overlapping dirty files, including release-channel source/tests and the roadmap. Later phases must inspect current bytes, layer only scoped edits, and never reset, overwrite, stage, or clean unrelated work.

## Risks

- The workflow uses shell regex and text-contract tests; independently implemented SemVer patterns can drift unless one validated shape is pinned across push and dispatch.
- Bootstrap channel semantics can be confused with binary installation destination; design must separate exact release selection from the explicitly targeted managed Pi installation preference.
- Existing dirty release-channel work overlaps likely call sites, increasing merge/overwrite risk; preserve it and map from current on-disk bytes.
- GitHub Release metadata and assets cannot be proven locally; post-merge delivery must wait for Actions and read back the actual prerelease and checksums before installation.

## Skill applicability

- `release`: applied; governs synchronized version pointers, tag form, Actions-only publication, no force-push, and post-publish asset verification.
- `github-workflow`: applied only as a delivery constraint; no git/gh delivery operation is in this scope phase.
- `ts-library`: applied at a general TypeScript release-contract level; npm publishing guidance is explicitly out of scope.
- `motion`, `nuxt-content`, and `nuxt-modules`: skipped because this slice changes neither animation nor Nuxt content/module surfaces.
