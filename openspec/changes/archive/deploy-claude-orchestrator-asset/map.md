status: partial
scope_status: bounded
change: deploy-claude-orchestrator-asset
phase: map
budget_exceeded: true
skill_resolution: paths-injected

# Map — deploy-claude-orchestrator-asset

## Scope boundary

Map is limited to the checkout/runtime Claude sync path that deploys the canonical `ein-pi/agent/assets/orchestrator.md` into the Claude adapter home, plus an isolated regression seam. The asset content, installer inventory/payload, bundling, staging, archive, packaged artifact, and smoke paths are explicitly out of scope and belong to `package-claude-orchestrator-asset`.

No source code, tests, installer files, canonical asset, or unrelated dirty files were edited in this phase. Exploration stopped after the effective read budget was exceeded; the relevant sync and test seams were identified.

## Current sync structure and symbols

### `cc-ein/sync.ts`

- `REPO` (line 32): repository root derived from `import.meta.dir`.
- `CORE` (line 33): `ein-pi/core` root.
- `CC` (line 34): `cc-ein/` adapter directory.
- `DEST` (line 35): `process.env.CC_EIN_HOME ?? join(homedir(), ".claude-ein")`. This is the authoritative sync destination. With no override it resolves to `~/.claude-ein`; with the requested isolated test override, the asset destination is `<temporary-home>/.claude-ein/assets/orchestrator.md` when `CC_EIN_HOME` is set to that path.
- `MAIN` (line 36): `join(homedir(), ".claude")`, used only for the shared credentials lookup/link.
- `DRY` (line 37): `process.argv.includes("--dry")`; all sync writes must remain no-ops in dry mode.
- `ensureDir` (lines 545–548): recursive directory creation, skipped in dry mode. The new `assets` parent must be created through the same deployment flow before copying/writing the file.
- `write` (lines 550–553): UTF-8 string writer, skipped in dry mode. It is suitable for generated text but is not itself a byte-copy contract; the design must preserve the canonical asset bytes exactly (binary read/write or a file-copy operation).
- `runSync` (line 627): sole explicit sync operation and `import.meta.main` entrypoint (lines 781–784). It first calls `compileClaudeSurface`, then creates the destination tree and deploys required surface files. The asset deployment belongs inside this required core section, before the optional MCP section.
- Existing structure phase (lines 637–642): creates `DEST`, `DEST/agents`, and `DEST/commands/ein`; this is the natural parent-directory insertion point for `DEST/assets`.
- Existing generated/deployed writes (lines 655–696): CLAUDE.md, settings/commands, agents, and skills. The asset should be an independent canonical-file deployment, not part of generated coordinator/agent compilation.
- Required/optional boundary (lines 738–778): failures before the MCP section populate `requiredFailures` and make `runSync()` return `{ ok: false, ... }`; MCP configuration is best effort. Missing/copy failure for the canonical asset must remain required so a successful sync cannot claim the promised asset exists when it does not.

The file already imports `cpSync`, `existsSync`, `mkdirSync`, `readFileSync`, `rmSync`, and `writeFileSync` from `node:fs`; `join` is already imported from `node:path`. A byte-preserving implementation can reuse the existing filesystem boundary or add the smallest explicit copy primitive. Do not normalize the Markdown through `write(..., "utf8")` if that could change bytes.

### Canonical source and destination

- Source: `ein-pi/agent/assets/orchestrator.md` (regular canonical asset; source bytes are protected and must not change). Scope evidence: 42,926 bytes, SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`.
- Destination: `join(DEST, "assets", "orchestrator.md")`, therefore `~/.claude-ein/assets/orchestrator.md` by default and `<isolated CC_EIN_HOME>/assets/orchestrator.md` under the regression test.
- The adapter launcher `cc-ein/cc-ein.fish` sets `CLAUDE_CONFIG_DIR` to `$HOME/.claude-ein` for runtime use. `cc-ein/README.md` documents the same isolated default. Neither file needs a behavior change for this checkout sync addition; they are downstream consumers of the promised relative path.
- No copy into `~/.claude`, Pi homes, project homes, or generated Claude coordinator content is intended.

## Isolated regression-test seam

### Existing seam

`tests/surface-wiring.test.ts` is the existing isolated Claude surface test module. It imports sync helpers from `../cc-ein/sync.ts` and already contains the `describe("Claude runner sync payload", ...)` group (around lines 653–729) with temporary roots and cleanup, plus `installedSurfaceFixture` (line 873) for isolated runtime launcher tests. This is the closest focused surface-wiring home for the regression.

The current module import evaluates `DEST` at import time, so a test that changes `process.env.CC_EIN_HOME` in the same process after importing `sync.ts` would not reliably exercise the requested destination. The regression should therefore invoke the real sync entrypoint in a child Bun process (or use an equivalent fresh module process), passing:

- `HOME=<temporary home>` to isolate `MAIN` and the default home-derived paths;
- `CC_EIN_HOME=<temporary home>/.claude-ein` to make the destination explicit and deterministic;
- a repository-root working directory so `cc-ein/sync.ts` resolves its canonical source and adapter inputs.

The test should track and remove the temporary root, assert the child sync completed successfully, assert `lstatSync(destination).isFile()` (not merely `existsSync`), and compare the source and destination bytes directly (`Buffer`/`Uint8Array` equality), not only text or file size. The canonical source path and expected destination path should be constructed with `join(import.meta.dir, "..", ...)` and the isolated home path respectively.

### Test dependencies and expected side effects

A real `runSync` also compiles/validates the normal Claude surface before the deployment section, so the child process depends on the existing `cc-ein/` adapter inputs, `ein-pi/core/` inputs, Bun, and the existing standalone compile path. With a temporary `HOME`, the credentials source is absent and no real login home is touched. Context7/Engram MCP setup remains optional and should not be made part of the asset assertion; the test only needs the required sync result and filesystem bytes.

Do not use `tests/installer-runtime-menu.test.ts` for this regression: its sync invocation is staged installer execution and is explicitly deferred with installer payload/staging work.

## Dependency and call-flow map

1. Fresh child imports `cc-ein/sync.ts`.
2. `DEST` resolves from `CC_EIN_HOME`; `MAIN` resolves below the temporary `HOME`.
3. `runSync()` calls `compileClaudeSurface()` and then creates the isolated destination tree.
4. The new required asset step creates `<DEST>/assets` and copies `REPO/ein-pi/agent/assets/orchestrator.md` to `<DEST>/assets/orchestrator.md` without altering source bytes.
5. Existing CLAUDE.md/settings/commands/agents/skills/bin deployment continues unchanged.
6. The child exits non-zero on required failure; optional MCP failures remain warnings.
7. The test proves destination regular-file status and exact source/destination byte parity, then deletes the temporary root.

## Blast radius

- Every non-dry `runSync()` now owns one additional required output under `DEST/assets`; default syncs gain the promised Claude asset.
- `--dry` must continue to avoid creating the destination directory/file, consistent with `ensureDir` and `write` behavior.
- A missing canonical source, missing parent, or copy/write failure must be visible as a required sync failure rather than silently producing a successful incomplete Claude home.
- Existing generated coordinator, settings/hooks, commands, agents, skills, binaries, MCP setup, launcher behavior, Pi deployment, and vanilla `~/.claude` isolation are otherwise unchanged.
- Current direct test coverage exercises helper-level Claude surface wiring and runner payload behavior, but no existing test covers `runSync()` itself; the child-process regression closes that seam.
- Packaging tests and installer execution may later need the asset in their staged payload, but that is intentionally a separate change and must not be pulled into this map or implementation.

## Protected unrelated work and exclusions

The following dirty paths are protected and must not be reset, rewritten, staged, or absorbed:

- `installer/install.sh`
- `installer/src/cli/install.ts`
- `installer/src/core/settings.ts`
- `tests/deploy-settings.test.ts`
- `tests/install-plan.test.ts`
- `tests/install-sh-checksum.test.ts`
- untracked `docs/plan-hallazgos-dogfooding-2026-08-19.md` (scope records `docs/plan-hallazgos-dogfooding-2026-08.md`; preserve the exact working-tree path if it differs at apply time)

Also protected/out of scope: `ein-pi/agent/assets/orchestrator.md` itself, A1–A3 dirty changes, and all installer source/tests, release payload inventory, bundling, packaged staging, archive layout, payload assertions, and smoke changes. Those belong to `package-claude-orchestrator-asset`.

## Design handoff

Design should decide the smallest byte-preserving copy primitive and exact insertion point in `runSync`, retaining required-failure and dry-run semantics. It should specify whether the regression is appended to `tests/surface-wiring.test.ts` or isolated in a new focused test file, but it must use a fresh child process/fresh import for `CC_EIN_HOME` and must not enter installer packaging paths.

## Ledger

ledger:
  reads:
    - { path: "/Users/samu/.pi-ein/agent/skills/downloaded/bun/SKILL.md", lines: 108, estimated_tokens: 1100 }
    - { path: "/Users/samu/.pi-ein/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1200 }
    - { path: "/Users/samu/.pi-ein/agent/skills/downloaded/nuxt-modules/SKILL.md", lines: 49, estimated_tokens: 400 }
    - { path: "/Users/samu/.pi-ein/agent/skills/downloaded/ts-library/SKILL.md", lines: 86, estimated_tokens: 700 }
    - { path: "/Users/samu/.pi-ein/agent/skills/downloaded/tsdown/SKILL.md", lines: 211, estimated_tokens: 1700 }
    - { path: "EIN.md", lines: 74, estimated_tokens: 900 }
    - { path: "openspec/changes/deploy-claude-orchestrator-asset/preflight.json", lines: 5, estimated_tokens: 100 }
    - { path: "openspec/changes/deploy-claude-orchestrator-asset/scope.md", lines: 38, estimated_tokens: 900 }
    - { path: "openspec/changes/deploy-claude-orchestrator-asset/specs/surface-wiring/spec.md", lines: 10, estimated_tokens: 180 }
    - { path: "openspec/config.yaml", lines: 58, estimated_tokens: 900 }
    - { path: "openspec/changes/deploy-claude-orchestrator-asset/lane.json", lines: 3, estimated_tokens: 40 }
    - { path: "codegraph: cc-ein/sync.ts sync path", lines: 1, estimated_tokens: 2600 }
    - { path: "codegraph: cc-ein/sync.ts constants and filesystem symbols", lines: 1, estimated_tokens: 1500 }
    - { path: "codegraph: cc-ein/sync.ts runner symbols", lines: 1, estimated_tokens: 1800 }
    - { path: "codegraph: tests/surface-wiring.test.ts isolated seam", lines: 1, estimated_tokens: 1200 }
    - { path: "cc-ein/sync.ts", lines: 785, estimated_tokens: 4300 }
    - { path: "tests/surface-wiring.test.ts", lines: 1-120, estimated_tokens: 900 }
    - { path: "tests/surface-wiring.test.ts", lines: 820-1059, estimated_tokens: 2200 }
    - { path: "ein-pi/agent/assets/orchestrator.md", lines: 1-5, estimated_tokens: 80 }
    - { path: "cc-ein/README.md", lines: 1-100, estimated_tokens: 1200 }
    - { path: "cc-ein/cc-ein.fish", lines: 1-48, estimated_tokens: 500 }
    - { path: "tests/claude-continuity-runtime.test.ts", lines: 1-180, estimated_tokens: 2400 }
    - { path: "tests/claude-project-settings.test.ts", lines: 1-100, estimated_tokens: 1100 }
    - { path: "tests/core-parity-coordinator.test.ts", lines: 1-100, estimated_tokens: 1000 }
    - { path: "tests/cc-payload-entrypoints.test.ts", lines: 1-100, estimated_tokens: 600 }
  webfetch_used: false
  budget_consumed: { tokens: 26800, reads: 26 }
  budget_source: scope.md
  budget: { max_tokens: 12000, max_reads: 20 }
  budget_exceeded: true

## Skill applicability

- `bun`: applicable to the planned Bun child-process regression and repository test runner; no tests/builds were run in map phase.
- `ein-discipline`: applicable; SDD boundaries and protected dirty work were followed.
- `nuxt-modules`: not applicable; this change does not create or modify a Nuxt module.
- `ts-library`: not applicable; this change is runtime sync wiring, not a published TypeScript library API.
- `tsdown`: not applicable; no tsdown configuration or library bundling is in scope; installer/bundling paths are explicitly deferred.
