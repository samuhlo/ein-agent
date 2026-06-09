---
name: release
description: "Publish an Ein release via GitHub and npm. Trigger: release, publish, npm publish, GitHub release, version bump."
triggers:
  - release
  - publish
  - npm publish
  - GitHub release
  - version bump
stack:
  - git
  - gh
  - npm
  - bun
cost: high
type: workflow
---

# Release Skill

Use this skill when preparing, publishing, or verifying an Ein release.

## Rules

- Always run tests before tagging.
- Do not publish to npm from a local machine — use the CI workflow.
- Tag format: `v<semver>` (e.g. `v1.2.0`).
- Changelog must be updated before tagging.
- Never force-push a tag.

## Steps

### 1. Pre-release checks

```bash
bun test
bun run build
```

### 2. Bump version

Update `package.json` version. Commit:

```bash
git add package.json
git commit -m "chore(release): bump version to v<version>"
```

### 3. Tag

```bash
git tag -a v<version> -m "v<version>"
git push origin v<version>
```

### 4. GitHub Release

```bash
gh release create v<version> \
  --title "v<version>" \
  --generate-notes
```

### 5. Verify CI

```bash
gh run list --workflow publish.yml --limit 3
gh run watch <run-id> --exit-status
```

### 6. Verify npm publish

```bash
npm view ein@<version> version --registry=https://registry.npmjs.org/
```

## Troubleshooting

- If CI fails, check `gh run view <run-id> --log`.
- If npm verify is stale immediately after publish, wait 30s and retry.
