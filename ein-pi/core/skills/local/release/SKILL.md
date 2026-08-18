---
name: release
description: "Publish an Ein installer release through GitHub Actions. Trigger: release, publish, GitHub release, version bump."
triggers:
  - release
  - publish
  - GitHub release
  - version bump
stack:
  - git
  - gh
  - bun
cost: high
type: workflow
---

# Release Skill

Use this skill when preparing, publishing, or verifying an Ein installer release.

## Rules

- Keep `installer/package.json`, `installer/src/core/version.ts` and `CHANGELOG.md` on the same SemVer version.
- Update `tests/release-asset-contract.test.ts` too: it pins the expected version as a
  literal in the assertion AND in the test name, so a release that skips it fails its own
  checks in step 2. Update both — the name has silently lagged the assertion before.
- Run the release checks before tagging.
- Tag format: `installer-v<semver>` (for example, `installer-v0.23.0`).
- The changelog is updated before the tag.
- Never force-push a tag.
- Never publish to npm or publish a release from the local machine.

## Canonical sequence

### 1. Prepare the version

Update the installer version pointers, the changelog and the release-contract test, then commit the explicit paths.

```bash
git add installer/package.json installer/src/core/version.ts CHANGELOG.md tests/release-asset-contract.test.ts
git commit -m "chore(release): prepara installer v<version>"
```

### 2. Run release checks

Run the focused tests and installer typecheck required by the release change. Do not use a local production build as the publication path.

### 3. Tag and push

```bash
git tag -a installer-v<semver> -m "installer-v<semver>"
git push origin installer-v<semver>
```

### 4. Verify GitHub assets

`.github/workflows/installer-release.yml` builds the four installer binaries, generates `checksums.txt`, and publishes them with `install.sh` as GitHub Release assets. Verify that workflow and its assets after it completes.

```bash
gh run list --workflow installer-release.yml --limit 3
gh run watch <run-id> --exit-status
```

## Troubleshooting

- If the workflow fails, inspect it with `gh run view <run-id> --log`.
- Do not substitute npm or a local publish for the GitHub asset workflow.
