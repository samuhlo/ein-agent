status: complete
scope_status: bounded
change: package-claude-orchestrator-asset
phase: map
skill_resolution: paths-injected

## Scope boundary

This map covers only transport of the canonical orchestrator asset through the Claude payload inventory, deterministic staging, archive creation, and archive manifest/required-path coverage. The canonical source is `ein-pi/agent/assets/orchestrator.md` (scope observation: 42,926 bytes; SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`).

Excluded: extraction/materialization behavior, runtime hand-off, BunFS smoke, release workflow, checkout synchronization, and downstream runtime consumption. Existing extraction symbols are recorded only as downstream validation seams; they are not implementation scope.

## Transport map

### Inventory contract

- `installer/src/core/cc-payload-inventory.ts`
  - `CC_EIN_PAYLOAD_ROOTS`: wholesale roots currently `cc-ein` and `ein-pi/core`; it does not cover `ein-pi/agent`.
  - `CC_EIN_PAYLOAD_FILES`: direct file transport allowlist currently `pi-ein/pi-ein.fish` and `pi-ein/migrate.ts`. This is the bounded seam for the canonical asset, because it must be transported as one explicit file rather than adding the whole agent tree.
  - `CC_EIN_PAYLOAD_SOURCE_ENTRIES`: source-closure entrypoints used by `collectSourceClosure`; unrelated to the asset unless its imports are changed later.
  - `CC_EIN_PAYLOAD_REQUIRED_PATHS`: staged-layout gate currently checks `cc-ein/sync.ts`, the SDD/runner entrypoints, handoff documentation, `ein-pi/core`, and `pi-ein/pi-ein.fish`. The canonical stable payload-relative path must be represented here for fail-closed layout coverage.
  - `CC_EIN_PAYLOAD_MANIFEST`: archive member name `ein-cc-payload-manifest.json`.
  - `CcEinPayloadManifestEntry` is `{ path, sha256 }`; `CcEinPayloadManifest` is format `ein-cc-payload/v1` with `files`.

### Source-to-staging path and byte flow

- `installer/scripts/bundle-cc-ein.ts`
  - `sourcePath(repoRelativePath)` resolves against `REPO_ROOT` and rejects paths outside the repository.
  - `filesUnder(path)` fails when the source is absent and recursively enumerates a direct file/directory.
  - `addSourcePath(repoRelativePath, staging, files)` calls `filesUnder(sourcePath(...))` and `addFile` for each result.
  - `addFile(source, staging, files)` computes `relative(REPO_ROOT, source)`, normalizes separators to `/`, creates the destination parent, and uses `cpSync(source, destination)`. For the canonical input, the exact destination is:
    - source: `ein-pi/agent/assets/orchestrator.md`
    - staging: `<temporary ein-cc-payload root>/ein-pi/agent/assets/orchestrator.md`
    - manifest path value: `ein-pi/agent/assets/orchestrator.md`
  - The copy path does not perform text decoding or rewriting. `hash(path)` reads source bytes and computes SHA-256 for the manifest.
  - Missing canonical input fails in `filesUnder`; unreadable input fails during `readFileSync`/`cpSync`/`hash`, before a successful archive is produced. The direct-file inventory entry is therefore the source-side fail-closed boundary.

### Staging, manifest, and archive

- `main()` in `installer/scripts/bundle-cc-ein.ts` creates a temporary `mkdtemp` root named `ein-cc-payload-*`.
- It stages, in order, `CC_EIN_PAYLOAD_ROOTS`, `CC_EIN_PAYLOAD_FILES`, and the relative-import closure of `CC_EIN_PAYLOAD_SOURCE_ENTRIES` into that root. The new direct asset participates in the `CC_EIN_PAYLOAD_FILES` loop.
- The manifest is created after all copies. `files` is sorted; each entry is `{ path, sha256: hash(sourcePath(path)) }`; it is written as `<staging>/ein-cc-payload-manifest.json` with a trailing newline. Thus the canonical asset must have both its stable path and source digest in the generated manifest.
- `OUT` is `installer/src/assets/cc-ein-runtime.tar.gz`. `main()` ensures its parent exists, then runs `tar -czf OUT .` with `cwd: staging`, so archive members retain repository-relative paths (including `ein-pi/agent/assets/orchestrator.md`) and the manifest member. The temporary staging root is removed in `finally`.
- A tar failure aborts the script; the archive is generated only after staging and manifest writing. The archive is generated verification/distribution output, not source.

### Required-path and manifest validation seams

- `installer/src/core/cc-payload.ts`
  - `assertPayloadLayout(root)` consumes `CC_EIN_PAYLOAD_REQUIRED_PATHS` with `existsSync(join(root, relativePath))`; this is the downstream required-path check that must see the canonical path in the contract.
  - `stageCcEinPayload()` extracts a supplied/embedded archive and, when present, reads `CC_EIN_PAYLOAD_MANIFEST`, checks format and entry shape, rejects unsafe/missing entries, and recomputes each entry SHA-256. This is the downstream manifest verification seam, not an extraction/materialization change in this scope.
  - `CC_EIN_PAYLOAD_ARCHIVE` points to `../assets/cc-ein-runtime.tar.gz`; the generated archive is lazily imported for compiled installers.
- `installer/scripts/cc-payload-smoke.ts` also iterates `CC_EIN_PAYLOAD_REQUIRED_PATHS`, but compiled BunFS smoke is explicitly excluded from this change.

## Focused test seams

- `tests/installer-runtime-menu.test.ts`, `describe("Claude runtime payload")`: current inventory assertions and explicit-archive staging fixture. The fixture enumerates required paths manually and currently does not model the canonical asset or assert its manifest digest; it is the closest existing transport/staging seam.
- `tests/cc-payload-entrypoints.test.ts`: asserts source entrypoints and required-path inventory. It is suitable for the required-path contract assertion, but does not execute `bundle-cc-ein.ts` or inspect an archive.
- No dedicated `bundle-cc-ein` test file was found. A later design should choose a focused seam that verifies the direct inventory entry, exact staged/archive-relative path, byte preservation, manifest path/digest, and missing/unreadable-source failure without touching protected worktree paths.
- `installer/src/core/cc-payload.ts` manifest checks can validate a generated fixture archive, but adding extraction behavior or BunFS smoke coverage is outside this map.

## Generated outputs and adjacent declarations

- `installer/src/assets/cc-ein-runtime.tar.gz`: generated archive output from `bundle-cc-ein.ts`; disposable/ignored verification output and protected from source edits.
- `ein-cc-payload-manifest.json`: generated only inside the temporary staging root and then embedded as an archive member; no standalone manifest source is present.
- `installer/src/assets.d.ts`: declares `*.tar.gz` file imports for Bun compilation; no behavior change is indicated by this transport scope.
- `installer/scripts/build-all.ts`: `bundleCcEinPayload()` invokes `bundle-cc-ein.ts` before compiling installers; this is the build caller, not a release-workflow target. Compiled `installer/dist/*` binaries are downstream generated outputs and are not to be edited.

## Protected dirty paths

Preserve without overwrite, revert, staging, or cleanup:

- `ein-pi/agent/assets/orchestrator.md` (canonical source and its observed bytes/digest).
- `cc-ein/sync.ts` (dirty).
- `tests/surface-wiring.test.ts` (dirty).
- `installer/install.sh`, `installer/src/cli/install.ts`, `installer/src/core/settings.ts` (A1–A3 work files).
- `docs/plan-hallazgos-dogfooding-2026-08.md` (untracked dogfooding document).
- Existing/untracked `installer/src/assets/cc-ein-runtime.tar.gz` archive output; treat as disposable verification output, never as source or a reason to overwrite unrelated work.

## Skill applicability

Paths were parent-injected. Bun rules apply to the project stack, but this map phase ran no Bun command, test, build, typecheck, or package operation. Release, Nuxt-module, TypeScript-library, and Vitest guidance is not applicable to this bounded transport map (tests use Bun rather than Vitest).

ledger:
  reads:
    - { path: openspec/changes/package-claude-orchestrator-asset/preflight.json, lines: 1-5, estimated_tokens: 80 }
    - { path: openspec/changes/package-claude-orchestrator-asset/scope.md, lines: 1-47, estimated_tokens: 700 }
    - { path: openspec/changes/package-claude-orchestrator-asset/specs/claude-payload-transport/spec.md, lines: 1-10, estimated_tokens: 260 }
    - { path: installer/src/core/cc-payload-inventory.ts, lines: 1-49, estimated_tokens: 420 }
    - { path: installer/src/core/cc-payload.ts, lines: 1-191, estimated_tokens: 1450 }
    - { path: installer/scripts/bundle-cc-ein.ts, lines: 1-143, estimated_tokens: 1420 }
    - { path: tests/cc-payload-entrypoints.test.ts, lines: 1-54, estimated_tokens: 470 }
    - { path: tests/installer-runtime-menu.test.ts, lines: 1-230, estimated_tokens: 2100 }
    - { path: installer/scripts/cc-payload-smoke.ts, lines: 1-52, estimated_tokens: 430 }
    - { path: installer/scripts/build-all.ts, lines: 1-120, estimated_tokens: 650 }
    - { path: installer/package.json, lines: 1-24, estimated_tokens: 160 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 8140, reads: 11 }
