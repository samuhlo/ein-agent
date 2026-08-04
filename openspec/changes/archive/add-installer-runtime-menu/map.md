status: partial
scope_status: bounded
change: add-installer-runtime-menu
phase: map
budget_exceeded: true
budget_source: scope.md
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
skill_resolution: paths-injected
active_tools:
  - read
  - find
  - grep
  - codegraph status/explore/callers/callees

## Scope and delta

The bounded change is B2 only: interactive selection of Pi, Claude Code, or both, with target-scoped prerequisites, deployment, launcher, migration, secrets, marker, and doctor work. B3 (update banner, `pi-ein update --all`, session-start/update detection) is explicitly excluded.

The declared delta adds three scenarios in `specs/installer-runtime/spec.md`: Claude installation through `bun cc-ein/sync.ts` plus `cc-ein.fish`; Pi isolated deployment plus gated legacy migration and `pi-ein.fish`; and explicit menu target selection with exactly-once selected paths.

## Current installer flow and prompt seams

- `installer/src/main.ts:80-124` routes `ein install` directly to `runInstall(rest)` and no arguments to `runMenu()`. Internal update continuation/template entrypoints are separate and must remain untouched.
- `installer/src/cli/menu.ts:17-59` first rejects non-TTY input with a clean exit, then presents the lifecycle `p.select` (Install, Doctor, Update, Uninstall, Restore, Quit). Install currently calls `runInstall([])`; cancel/quit returns 0 after `p.outro`. The runtime target prompt belongs immediately after the Install action is chosen, not in the shared lifecycle menu, to preserve all other actions and the non-TTY path.
- `installer/src/cli/install.ts:79-284` is currently Pi-only. It parses flags, detects platform, asks Solo/Team mode, prints `checkDeps`, handles dry-run, installs Bun and Pi as required, optionally installs Engram/gh/hypa/codegraph, snapshots `AGENT_DIR`, deploys through `deployTemplate`, installs declared Pi packages, runs optional secrets/export work, writes the marker, runs Pi doctor, and returns 1 on deploy/doctor failure. `fail()` logs and returns 1.
- Existing confirmation cancellation exits 1 from `confirm()`; menu-level cancellation exits 0. A target-selection seam must make that distinction explicit and must not turn cancelled non-install actions into install failures.
- `runInstall` has no dependency injection and imports side-effectful/global modules. A small target argument/options seam is preferable to encoding target values as ignored install flags. Direct `ein install` should retain its current Pi default unless design intentionally changes that documented CLI contract; the interactive menu is the required new selection surface.

## Pi path and B1 isolation

- `installer/src/core/paths.ts:11-62` derives `HOME` from `$HOME`/`homedir()`, defines legacy `~/.pi/agent`, isolated `~/.pi-ein/agent`, and marker `.ein-install.json`. `AGENT_DIR` is resolved once at module import: isolated marker first, then legacy marker, otherwise isolated default. `INSTALL_MARKER` and all installer paths derive from that static value.
- `installer/src/core/deploy.ts:108-149` reads/merges user settings, cleans template-owned directories, extracts the embedded tarball to the global `AGENT_DIR`, templates absolute paths, preserves user settings, and writes global Solo/Team mode. `templateConfig()` also uses the global `AGENT_DIR`; the returned `agentDir` is informational, not an override. `installer/src/core/backup.ts:224-283` snapshots/restores the same target and excludes auth, sessions, backups, runtime state, and downloaded skills.
- `installer/src/core/deps.ts:52-148` checks git/curl/Bun/Pi plus optional tools. Bun and Pi are installed through `run()` with extra Bun/local paths; declared packages invoke the resolved `pi`. Those calls must be behind the Pi target boundary. Claude-only must not install Pi, deploy the Pi template, install Pi packages, snapshot Pi state, write the Pi marker, or run Pi doctor.
- `installer/src/core/verify.ts:130-306` is a Pi deployment doctor: every path, manifest, extension, skill, Pi runtime, and Pi integration check reads `AGENT_DIR` and Pi-specific settings. It is retained for Pi and invoked once for both, not for Claude-only.
- `installer/src/core/version.ts:16-39` writes only the Pi marker at `INSTALL_MARKER`; there is no Claude marker.
- The current log/dry-run text still says `~/.pi/agent` in several places even though B1 resolves isolated by default; target-specific design should report the resolved directory, not reintroduce legacy wording.

### Migration seam and ordering hazard

- `pi-ein/migrate.ts:1-61` is a top-level Bun script. It detects only whether `~/.pi/agent` exists, aborts if the isolated destination is non-empty, creates a pre-move tar backup, renames the whole legacy directory, then rewrites absolute `settings.json` paths from legacy to isolated. It uses synchronous `tar`/filesystem operations and has no EIN-marker check; a vanilla Pi directory is therefore unsafe to pass to it.
- Positive legacy EIN detection is available from the B1 marker contract: inspect `~/.pi/agent/.ein-install.json` (and parse/validate it rather than treating any directory as EIN). A vanilla `~/.pi/agent` without that marker must remain untouched. Migration errors must be fail-closed and reported as a failed Pi path.
- Important current-state hazard: `AGENT_DIR` is static. If the installer imports `paths.ts` while the legacy marker exists, it captures `~/.pi/agent`; migrating first then leaves `deployTemplate`, backup, marker, doctor, and `templateConfig` pointing at the old path. Design must either establish the isolated path before these imports, provide a re-resolvable/path-context seam through the affected Pi operations, or deliberately stage migration at a seam that preserves the resolved target. Do not silently run migration and continue with stale `AGENT_DIR`.

## Shell launcher assets and reusable helper

- There is no installer launcher implementation today (`grep` found no Fish destination/install call under `installer/`). The only assets are `pi-ein/pi-ein.fish` and `cc-ein/cc-ein.fish`.
- `pi-ein/pi-ein.fish` defines a function-scoped launcher, exporting `PI_CODING_AGENT_DIR` and `EIN_PI_AGENT_HOME` as `~/.pi-ein/agent`, then executing `pi`. It must be installed at `~/.config/fish/functions/pi-ein.fish`.
- `cc-ein/cc-ein.fish` defines a function-scoped launcher, exporting `CLAUDE_CONFIG_DIR=~/.claude-ein`, prepending `~/.claude-ein/bin` to function-scoped `PATH`, loading Context7 from the secrets file when absent from the environment, then executing `claude`. It must be installed at `~/.config/fish/functions/cc-ein.fish`.
- Because both launchers share destination, mkdir, idempotence, and owned-file semantics, a small installer core helper is the narrowest reusable seam (for example, a function accepting `home`, launcher name/content, and an injectable writer). It should create the parent recursively, replace only the named EIN file with identical content, and never enumerate/overwrite unrelated Fish functions. Keep CLI orchestration/reporting in `install.ts`.
- Focused tests should use a temp home or explicit destination parameter; do not mutate the real user Fish directory.

## Claude Code sync and source/package availability

- `cc-ein/sync.ts` is now present in the current tree. It is a top-level side-effectful Bun script, not an importable function. It computes `REPO` from `import.meta.dir/..`, reads canonical `ein-pi/core`, reads `cc-ein/CLAUDE.md` and `settings.json`, writes isolated `~/.claude-ein`, translates agents, copies skills, compiles `cc-ein/sdd-cli/cli.ts`, and configures Context7/optional Engram via synchronous `claude`/`which` calls.
- `cc-ein/sdd-cli/cli.ts` compiles against `../../ein-pi/agent/lib/{sdd-router,sdd-guardrails,sdd-close,guardrails}.ts`; the payload cannot consist of only `sync.ts` and the two static CC files.
- `sync.ts` catches several optional `bun build`/`claude mcp` failures and still reaches its success message. `run()` in `installer/src/core/exec.ts:10-78` never throws for child non-zero exits and reports `{ok, code, stdout, stderr}`. The B2 seam must define what counts as synchronization failure and must not report Claude success when a required sync operation is only logged as a warning. Launcher write failure is independently observable and must fail the Claude result.
- `installer/scripts/build-all.ts` currently bundles only the Pi template and compiles `src/main.ts`; `installer/scripts/bundle-template.ts` generates only `src/assets/template.tar.gz`; `installer/src/assets.d.ts` declares only `.tar.gz`, and `installer/.gitignore` ignores generated assets. The current standalone binary therefore has no CC source/payload or launcher asset.
- Repository execution can invoke `bun cc-ein/sync.ts` only when a deterministic repository root/cwd is available. A downloaded standalone binary cannot assume the caller's cwd contains `cc-ein/`. The design must select one explicit mechanism: for example, generate/import an embedded CC payload archive containing `cc-ein/` plus the source trees required by `sync.ts`/`sdd-cli`, extract to a temporary deterministic staging root, invoke Bun with that script and cwd, then clean it; or explicitly constrain the packaged mode and fail with a clear unavailable-source error. A missing path must never be silently treated as a successful Claude install.
- Source and launcher acquisition should remain tied to the current `cc-ein/` tree and build artifact, not a second Claude implementation. B3/update behavior remains out of scope.

## Target-scoped execution model to carry into design

- Runtime target values: Pi, Claude Code, or both. The selected target is a single value; both must execute each path once and aggregate independent results.
- Shared Bun prerequisite may be resolved/installed once for any target. Pi-only prerequisites (Pi package, Pi packages, Engram install if retained as Pi install work, Pi snapshot/deploy/marker/doctor) are conditional. Claude-only must not touch Pi state. Claude's own minimum prerequisite behavior should be limited to what the established sync actually needs; do not add vanilla Claude installation as a side effect.
- Pi result should preserve existing backup/rollback, optional secrets, marker, and doctor semantics, with migration gated before the deployment seam and with the static `AGENT_DIR` issue resolved.
- Claude result should run the established sync through the `run()` child-process convention with deterministic script/cwd/payload resolution, then install `cc-ein.fish`. Check both outcomes and report target failure if either fails.
- Both should normally run Pi then Claude so Pi's existing backup/deploy/doctor semantics remain contiguous; if Pi fails, still run Claude once and aggregate both failures/results. If Pi succeeds and Claude fails, return overall failure with Pi success retained and a retryable Claude-specific error; do not roll back a successful independent Pi installation merely because Claude failed. Do not duplicate Bun checks or either target's deploy/sync work.
- Secrets/export work must be assigned per target rather than left in the current unconditional Pi block. Context7 is shared by the launcher paths; Linear/MiniMax and Pi marker/doctor are Pi concerns unless design documents another established consumer.

## Focused test surfaces for B2

No existing test covers `runMenu`/`runInstall` (the codegraph blast-radius reports none). Add a cheap focused installer-runtime surface rather than invoking real Pi, Claude, network, homes, or TUI child processes:

1. Pure target/menu seam: options visibly contain Pi, Claude Code, both; each value reaches `runInstall` exactly once; unselected path calls are absent; menu cancellation and non-TTY behavior stay unchanged.
2. Orchestration isolation: fake target runners and shared Bun prerequisite; assert Pi-only, Claude-only, and both call counts/order, no duplicate shared work, and independent aggregate failure when one target fails.
3. Pi path: inject/fake deployment, snapshot/rollback, package, marker, doctor, and launcher seams; assert isolated `AGENT_DIR` is used and vanilla `~/.pi/agent` is not touched.
4. Legacy gating: temp homes for (a) vanilla legacy directory without marker, (b) valid legacy EIN marker, (c) malformed marker, and (d) isolated destination conflict/migration failure; assert only positive EIN detection triggers migration and failure is reported.
5. Launcher helper: temp home/destination, parent creation, exact `pi-ein.fish`/`cc-ein.fish` placement, repeat idempotence, and preservation of an unrelated function.
6. Claude sync: fake `run()`/source resolver or a safe fixture; assert Bun receives the `cc-ein/sync.ts` entrypoint from the deterministic source context, non-zero sync is propagated, and launcher failure is not reported as success.

Existing supporting surfaces: `tests/deps-pi.test.ts` protects scoped Pi installation; `tests/installer-backup.test.ts` covers snapshot/restore; `tests/updater-cli-entrypoints.test.ts` covers real installer entrypoints and isolated default deployment; `tests/legacy-paths-veto.test.ts` protects canonical source layout. These should remain regression support, not be stretched into real CC/Pi integration tests. Verification later runs `cd installer && bun run typecheck` and focused Bun tests; no tests/builds were run in map.

## Design handoff

Recommend `sdd-design` next. Resolve before apply: (1) target API between menu and direct install, (2) dynamic/re-resolved Pi path around migration, (3) required-vs-optional sync failure semantics, (4) embedded/repository CC payload strategy for standalone binaries, (5) target ordering/aggregate failure contract, and (6) launcher helper injection/test seam. Keep the implementation bounded to installer CLI/core, asset/build plumbing required for deterministic CC acquisition, focused tests, and the declared OpenSpec delta.

## Risks

- Static `AGENT_DIR` capture can make a pre-deploy migration deploy back into legacy or doctor the wrong tree.
- Current `cc-ein/sync.ts` is side-effectful and partially best-effort; process exit alone may not expose all required synchronization failures.
- Standalone installer packaging currently has no CC payload; invoking a relative source path from arbitrary cwd would produce a false or unavailable Claude install.
- Budget/read cap was exceeded during mapping; notes above cover the requested scope but the ledger is marked partial.

## Ledger

ledger:
  reads:
    - { path: /home/samuhlo/.pi-ein/agent/skills/local/ein-discipline/SKILL.md, lines: 101, estimated_tokens: 880 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt-modules/SKILL.md, lines: 37, estimated_tokens: 350 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/document-writer/SKILL.md, lines: 62, estimated_tokens: 550 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/nuxt-studio/SKILL.md, lines: 65, estimated_tokens: 560 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/vitest/SKILL.md, lines: 48, estimated_tokens: 400 }
    - { path: /home/samuhlo/.pi-ein/agent/skills/downloaded/web-quality-audit/SKILL.md, lines: 126, estimated_tokens: 1000 }
    - { path: openspec/changes/add-installer-runtime-menu/scope.md, lines: 75, estimated_tokens: 950 }
    - { path: openspec/changes/add-installer-runtime-menu/specs/installer-runtime/spec.md, lines: 29, estimated_tokens: 280 }
    - { path: installer/src/cli/menu.ts, lines: 60, estimated_tokens: 550 }
    - { path: installer/src/cli/install.ts, lines: 279, estimated_tokens: 2050 }
    - { path: installer/src/core/paths.ts, lines: 62, estimated_tokens: 520 }
    - { path: installer/src/core/deploy.ts, lines: 149, estimated_tokens: 900 }
    - { path: installer/src/core/exec.ts, lines: 120, estimated_tokens: 450 }
    - { path: installer/src/core/deps.ts, lines: 165, estimated_tokens: 1050 }
    - { path: installer/src/core/verify.ts, lines: 310, estimated_tokens: 1900 }
    - { path: installer/src/core/backup.ts, lines: 283, estimated_tokens: 1350 }
    - { path: installer/src/core/version.ts, lines: 54, estimated_tokens: 350 }
    - { path: installer/src/main.ts, lines: 124, estimated_tokens: 1000 }
    - { path: installer/scripts/build-all.ts, lines: 80, estimated_tokens: 600 }
    - { path: installer/scripts/bundle-template.ts, lines: 160, estimated_tokens: 1400 }
    - { path: installer/package.json, lines: 27, estimated_tokens: 200 }
    - { path: installer/tsconfig.json, lines: 18, estimated_tokens: 180 }
    - { path: installer/src/assets.d.ts, lines: 5, estimated_tokens: 70 }
    - { path: pi-ein/migrate.ts, lines: 61, estimated_tokens: 750 }
    - { path: pi-ein/pi-ein.fish, lines: 13, estimated_tokens: 170 }
    - { path: cc-ein/sync.ts, lines: 220, estimated_tokens: 2100 }
    - { path: cc-ein/cc-ein.fish, lines: 15, estimated_tokens: 220 }
    - { path: cc-ein/sdd-cli/cli.ts, lines: 170, estimated_tokens: 1500 }
    - { path: cc-ein/settings.json, lines: 15, estimated_tokens: 100 }
    - { path: cc-ein/README.md, lines: 45, estimated_tokens: 750 }
    - { path: cc-ein/CLAUDE.md, lines: 80, estimated_tokens: 1000 }
    - { path: installer/.gitignore, lines: 5, estimated_tokens: 70 }
    - { path: .gitignore, lines: 25, estimated_tokens: 200 }
    - { path: tests/deps-pi.test.ts, lines: 30, estimated_tokens: 300 }
    - { path: tests/installer-backup.test.ts, lines: 150, estimated_tokens: 1250 }
    - { path: tests/legacy-paths-veto.test.ts, lines: 130, estimated_tokens: 1000 }
    - { path: tests/installed-agent-inventory.test.ts, lines: 75, estimated_tokens: 650 }
    - { path: tests/session-version.test.ts, lines: 50, estimated_tokens: 500 }
    - { path: tests/updater-cli-entrypoints.test.ts, lines: 80, estimated_tokens: 900 }
  webfetch_used: false
  budget_consumed: { tokens: 28230, reads: 40 }
  budget_exceeded: true
