status: partial
scope_status: bounded-mapped
change: materialize-claude-orchestrator-asset
phase: map
budget_source: scope.md
budget_exceeded: true

# Map — packaged Claude payload materialization

## Boundary

This slice owns the packaged archive validation/extraction seam, the existing installer hand-off, and compiled BunFS portability. Transport inventory/bundling and checkout sync are upstream contracts and are referenced only at their interfaces. No transport or `cc-ein/sync.ts` redesign is mapped here.

## Current source archive → staged payload → installed home flow

1. **Packaged source archive (upstream contract).** The generated `installer/src/assets/cc-ein-runtime.tar.gz` is lazily resolved by `resolveCcEinPayloadArchive()` in `installer/src/core/cc-payload.ts`; the no-argument path imports the archive with `{ with: { type: "file" } }`, then checks that the resolved path exists. The archive is produced upstream by `bundleCcEinPayload()` with format `ein-cc-payload/v1` and `ein-cc-payload-manifest.json`; its canonical direct member is `ein-pi/agent/assets/orchestrator.md`.

2. **Real filesystem materialization.** `stageCcEinPayload()` creates a deterministic temporary `ein-cc-payload-*` root, then `materializeCcEinPayloadArchive()` reads the resolved archive through `Bun.file(...).arrayBuffer()` and writes `cc-ein-runtime.tar.gz` inside that root with `Bun.write()`. This is the critical BunFS seam: `tar` must receive a real filesystem path, not a BunFS-embedded path. `run("tar", ["-xzf", archivePath, "-C", root])` extracts the archive into the same root.

3. **Staged payload admission.** `assertPayloadLayout()` checks `CC_EIN_PAYLOAD_REQUIRED_PATHS`: `cc-ein/sync.ts`, the SDD entry and source-entry closure, handoff command, `ein-pi/core`, the canonical orchestrator member, and `pi-ein/pi-ein.fish`. If present, `stageCcEinPayload()` parses `ein-cc-payload-manifest.json` when present, checks format and entry shape, rejects absolute/traversal/nonexistent entries, and recomputes SHA-256 from the staged file. It returns `CcEinPayloadStage` (`root`, `archivePath`, `syncPath`, `sddCliPath`, `manifestPath`, idempotent `cleanup`). Extraction/validation failures clean the root in the catch path.

4. **Existing installer hand-off.** `createClaudeInstallHandlers()` in `installer/src/cli/install.ts` obtains the stage, runs the injected/default `run` seam as `bun cc-ein/sync.ts` with `cwd: staged.root`, `HOME: home`, `CC_EIN_HOME: <home>/.claude-ein`, and an extra Bun bin path. A failed child returns detailed stdout/stderr (or exit code), cleans staging, and prevents launcher installation. On success it writes `.claude-ein/.ein-install.json`; the second handler installs `cc-ein.fish`, and its `finally` cleans the stage. `runClaudeInstall()` preserves runtime-before-launcher ordering.

5. **Installed destination.** In the staged checkout, `cc-ein/sync.ts` derives `REPO` from `import.meta.dir` and therefore sees the staged root, not the caller checkout. `runSync()` creates `<CC_EIN_HOME>/assets`, then copies `join(REPO, "ein-pi", "agent", "assets", "orchestrator.md")` byte-for-byte to `<CC_EIN_HOME>/assets/orchestrator.md`; copy errors enter `requiredFailures` and make the sync non-successful. The promised installed path is therefore `~/.claude-ein/assets/orchestrator.md` by default.

## Validation and likely design decision points

- Required-path admission is currently existence-only (`existsSync(join(root, relativePath))`); it does not distinguish a directory from a regular required file and does not require a manifest to exist.
- Manifest validation is currently conditional on the manifest file being present. When present, it validates `format`, array shape, path confinement, existence, and each listed digest, but does not explicitly require every required path (or the canonical asset) to have a manifest entry. The design phase must reconcile this permissive fixture seam with the requirement that a packaged payload be incomplete/checksum-invalid fail-closed.
- The transport builder's manifest is based on staged bytes and is upstream; final materialization should consume that contract rather than recalculate or duplicate bundling semantics.
- Cleanup is deliberately part of the stage contract: callers must not retain `root` after either child failure or launcher completion.

## BunFS smoke and release wiring

- `installer/scripts/cc-payload-smoke.ts` changes to an unrelated temporary cwd, calls no-argument `stageCcEinPayload()`, asserts the copied archive lives under the staging root and exists, checks every `CC_EIN_PAYLOAD_REQUIRED_PATHS` member, then verifies archive/root cleanup. It is extraction/portability coverage; it does not invoke staged `cc-ein/sync.ts` or assert the installed-home byte parity.
- `.github/workflows/installer-release.yml` already wires the required Linux x64 compiled smoke after `bun run build:all`: from `installer/`, `bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-x64 --outfile /tmp/ein-cc-payload-smoke`, followed by `(cd /tmp && /tmp/ein-cc-payload-smoke)`. No workflow edit is indicated by the current map unless implementation changes the required command.
- `installer/scripts/build-all.ts` invokes `bundle-cc-ein.ts` before compiling installer targets; this is only the upstream archive-production boundary, not a target for this slice.

## Existing focused coverage and seams

- `tests/installer-runtime-menu.test.ts`: inventory assertions; explicit archive staging with byte-identical archive copy and idempotent cleanup; missing/unreadable/invalid-tar rejection; injected `runClaudeInstall()` proof that Bun runs with staged cwd/env before launcher installation; child failure detail, exit-code fallback, launcher failure, and cleanup. The runner tests use a fake stage, so they do not yet prove a real packaged asset reaches `.claude-ein/assets/orchestrator.md`.
- `tests/cc-payload-entrypoints.test.ts`: protects the explicit canonical route exactly once and prevents broadening to `ein-pi/agent`; also protects sync compile-entry inventory. Preserve as upstream transport coverage.
- `tests/cc-payload-bundle.test.ts`: protects archive member bytes, staged-byte manifest digest, and fail-closed source absence/directory/unreadable cases. Preserve as upstream transport coverage; do not duplicate it in the materialization slice.
- `tests/surface-wiring.test.ts`: executes the checkout sync in an isolated home and proves regular-file byte parity at `assets/orchestrator.md`, dry-run non-mutation, and required failure on a blocked destination. This is the downstream sync contract; preserve it and use it as the byte-parity reference, not as a place to add payload extraction logic.
- `tests/release-asset-contract.test.ts` is a release pointer contract in the requested focused verification list, but it is not a materialization seam and should remain unchanged unless verification exposes an unrelated pointer drift.

## Protected paths / dirty-work boundary

Do not reset, stage, rewrite, or absorb existing work in: canonical `ein-pi/agent/assets/orchestrator.md`; archived transport inventory/bundler files and tests; archived checkout-sync files/tests; A1–A3 dirty paths including `installer/install.sh`, `installer/src/cli/install.ts`, `installer/src/core/settings.ts`, `installer/src/core/cc-payload-inventory.ts`, `tests/cc-payload-entrypoints.test.ts`, and other existing dirty tests; `tests/deploy-settings.test.ts`, `tests/install-plan.test.ts`, and `tests/install-sh-checksum.test.ts`; generated `installer/src/assets/cc-ein-runtime.tar.gz` (disposable output, never source); and untracked `docs/plan-hallazgos-dogfooding-2026-08.md`.

The main collision risk is `installer/src/cli/install.ts`: it is already protected dirty work while containing the existing hand-off seam. Any later edit must preserve unrelated hunks and should be avoided if focused tests can exercise the current seam. `installer/src/core/cc-payload.ts` is the primary materialization implementation boundary.

## Recommended design hand-off

Design should decide the fail-closed manifest/required-file strengthening, add only the smallest real-archive hand-off assertion needed to prove installed byte parity, and retain the already-wired compiled smoke command. Keep archive generation and checkout sync out of the change.

## Ledger

ledger:
  reads:
    - { path: "openspec/changes/materialize-claude-orchestrator-asset/scope.md", lines: 40, estimated_tokens: 900 }
    - { path: "openspec/changes/materialize-claude-orchestrator-asset/preflight.json", lines: 4, estimated_tokens: 80 }
    - { path: "openspec/changes/materialize-claude-orchestrator-asset/specs/installer-runtime/spec.md", lines: 10, estimated_tokens: 180 }
    - { path: "openspec/specs/installer-runtime/spec.md", lines: 40, estimated_tokens: 700 }
    - { path: "openspec/changes/archive/package-claude-orchestrator-asset/summary.md", lines: 32, estimated_tokens: 520 }
    - { path: "openspec/changes/archive/deploy-claude-orchestrator-asset/summary.md", lines: 29, estimated_tokens: 480 }
    - { path: "openspec/changes/archive/package-claude-orchestrator-asset/scope.md", lines: 32, estimated_tokens: 600 }
    - { path: "openspec/changes/archive/deploy-claude-orchestrator-asset/scope.md", lines: 38, estimated_tokens: 700 }
    - { path: "installer/src/core/cc-payload.ts", lines: 190, estimated_tokens: 1700 }
    - { path: "installer/src/core/cc-payload-inventory.ts", lines: 57, estimated_tokens: 620 }
    - { path: "installer/src/cli/install.ts", lines: 70, estimated_tokens: 750 }
    - { path: "installer/scripts/cc-payload-smoke.ts", lines: 53, estimated_tokens: 500 }
    - { path: ".github/workflows/installer-release.yml", lines: 110, estimated_tokens: 1200 }
    - { path: "tests/installer-runtime-menu.test.ts", lines: 470, estimated_tokens: 4300 }
    - { path: "tests/cc-payload-entrypoints.test.ts", lines: 68, estimated_tokens: 650 }
    - { path: "tests/cc-payload-bundle.test.ts", lines: 150, estimated_tokens: 1500 }
    - { path: "installer/scripts/bundle-cc-ein.ts", lines: 175, estimated_tokens: 1500 }
    - { path: "cc-ein/sync.ts", lines: 125, estimated_tokens: 1100 }
    - { path: "tests/surface-wiring.test.ts", lines: 155, estimated_tokens: 1450 }
    - { path: "codegraph: callers(stageCcEinPayload)", lines: 1, estimated_tokens: 80 }
    - { path: "codegraph: explore(createClaudeInstallHandlers)", lines: 1, estimated_tokens: 100 }
    - { path: "codegraph: explore(bundleCcEinPayload)", lines: 1, estimated_tokens: 100 }
    - { path: "codegraph: explore(stageCcEinPayload)", lines: 1, estimated_tokens: 100 }
    - { path: "codegraph: status", lines: 1, estimated_tokens: 80 }
  webfetch_used: false
  budget_consumed: { tokens: 17210, reads: 24 }
