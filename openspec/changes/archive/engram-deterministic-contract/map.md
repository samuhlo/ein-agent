# MAP — Deterministic Engram contract

status: complete
scope_status: bounded
change: engram-deterministic-contract
phase: map
skill_resolution: paths-injected (previous retry findings reused; mandatory Pi docs were not reread per task)
budget_source: task correction
budget: { max_tokens: 30000, max_reads: 45, max_runtime_ms: 900000 }
budget_exceeded: false

## Conclusion

**`artifactStore: engram` and `artifactStore: both` do not currently change persistence.** They only change a session-local preflight preference, prompt text, and UI notification. No deterministic runtime reads that preference to invoke an Engram operation; no adapter, normalization layer, project identifier, retrieval, save, or fake transport exists. OpenSpec remains the only evidenced SDD artifact persistence path.

Evidence: `sdd-preflight.ts:35-86,433-471,498-518,521-559` collects and renders the value; repository search found no later consumer outside that module. The router and closer operate only on `openspec/changes/` (with legacy `.sdd/changes/` fallback) and contain no Engram reference.

## Current call paths and claim boundary

### E0 — deterministic configuration/install/diagnosis

```text
install CLI --no-engram / wizard
  -> checkDeps(platform) -> resolveEngram(platform)
  -> optional installEngramDep(platform) -> installEngram(platform)
  -> deployTemplate(platform) -> resolveEngram(platform)
     -> templateConfig("mcp.json", { ENGRAM_BIN, ENGRAM_DATA_DIR })

installed mcp.json
  -> declares `engram mcp --tools=agent`, lazy, directTools:false

installer doctor: verifyDeployment()
  -> parses mcp.json; validates server/key/data-dir/resolved command
  -> lookPath("engram") -> WARN only when missing
agent doctor: ein-doctor
  -> cliExists("engram") and mcp.json structural checks
```

This is deterministic only through executable discovery, optional installation, template deployment, and structural diagnostics. `resolveEngram()` falls back to bare `engram`, so a valid generated config does not prove executable availability; doctor reports the missing CLI as a warning. The installer never performs memory search/save.

### E1 — prompt-advised, not enforced

- `assets/orchestrator.md:195-197` tells the parent/subagents to use a callable memory tool when available and to save meaningful discoveries with a project/stable key.
- `core/agents/{sdd-scope,sdd-map,sdd-design,sdd-tasks,sdd-apply,sdd-verify}.md` conditionally advise memory retrieval by the parent and saving after meaningful work. The wording explicitly permits inline/OpenSpec fallback and says not to claim persistence when tools are absent.
- `core/agents/sdd-close.md` calls `summary.md` the durable memory; it has no Engram operation. `agent/chains/` has no Engram/artifact-store reference.
- `lib/persona.ts:91,111` prohibits inventing persistent memory from this package alone.
- `core/skills/local/skill-registry/SKILL.md:19,37` asks for an Engram save “when available”; it is prompt guidance, not an executable transport.

These references can cause a model to choose a visible tool, but model compliance is neither lifecycle ownership nor a persistence result.

### E2 — absent

No code registers an Engram adapter/local tool, invokes an Engram CLI operation, invokes an MCP tool, receives an Engram result, or normalizes an operation outcome. `hasWritableEngramTool()` is only a name probe; it recognizes `mem_save`/`engram_mem_save` (including dotted variants) but does not call them. Existing test coverage has no fake Engram transport.

| Claim level | Current state | Code evidence | Permitted present-tense claim |
|---|---|---|---|
| E0 configured | Implemented | installer resolver/install/deploy; `mcp.json`; two doctor structural/CLI checks | Optional Engram can be configured/installed/diagnosed. |
| E1 prompt-advised | Implemented as text only | orchestrator, phase-agent prompts, skill prompt | A callable memory tool may be used when available. |
| E2 deterministic retrieve/save | Not implemented | no runtime caller/adapter/operation test | None. Do not claim cross-session retrieval or save. |

## Runtime/preflight map

| File / symbol | Current behavior | Callers / blast radius | Classification |
|---|---|---|---|
| `installer/src/core/engram.ts` — `resolveEngram`, `installEngram` | Finds binary candidates; macOS brew or Linux release download/install. Returns `{command, found}` or `{ok,path?,detail}`. | `deps.ts`, `deploy.ts`, install CLI. No covering test reported by codegraph. | Deterministic E0 only. |
| `installer/src/core/deps.ts` — `checkDeps`, `installEngramDep` | Marks Engram optional; delegates install. | install CLI uses it for wizard/flags. | Deterministic E0 only. |
| `installer/src/core/deploy.ts` — `deployTemplate`, `templateConfig` | Resolves Engram then renders `mcp.json` and settings. Returns command/found. | install/update CLIs; no covering test reported. | Deterministic E0 only. |
| `ein-pi/agent/mcp.json` | `engram` command, `mcp --tools=agent`, `ENGRAM_DATA_DIR`, `directTools:false`, `lifecycle:lazy`. | Pi runtime configuration, not called by Ein TS. | E0 declaration; external MCP surface unverified. |
| `ein-pi/agent/lib/sdd-preflight.ts` — `hasWritableEngramTool` | Uses optional `pi.getActiveTools()`, catches all failures, matches only writable tool names. | `ensureSddPreflight`. | Availability hint, not a transport. |
| same — `collectSddPreflightPreferences` | UI offers `openspec|engram|both` iff name probe succeeds; headless mode defaults `openspec`. | `ensureSddPreflight`. | Session preference only. |
| same — `renderSddPreflightPrompt` | Renders `Artifact store: ...` into injected prompt. | `ein-ai`, tests. | Prompt-only. |
| same — `ensureSddPreflight` | Caches by session key, probes tools, collects preferences, installs SDD assets/config, notifies UI. | `extensions/ein-ai.ts`, `extensions/sdd-init.ts`. | Deterministic setup; no memory lifecycle. |
| `extensions/ein-ai.ts` — `runSddPreflight` / event-command wiring | Calls preflight before SDD flow setup, injects rendered prompt. | Main extension runtime. | Only owner currently adjacent to lifecycle hooks. |
| `extensions/sdd-init.ts` | Calls the same preflight, then bootstraps OpenSpec config. | Manual `sdd-init` command. | No persistence change. |
| `extensions/ein-doctor.ts` | Checks CLI presence and parsed MCP fields. | `ein-doctor` command. | Diagnostic only. |
| `installer/src/core/verify.ts` — deployment checks | Validates `mcpServers.engram`, data dir, untemplated command; runtime CLI is WARN. | installer doctor. | Diagnostic only. |
| `lib/sdd-router.ts` — `resolveChangesDir`, status/next | Reads phase files from canonical `openspec/changes/`, then legacy fallback. | `ein_sdd_status`, check/next UI, router tests. | Actual SDD persistence state, no Engram. |
| `lib/sdd-close.ts` — `closeChange` | Moves a verified change to `archive/`; validates name/existence/collision. | close command and `sdd-close.test.ts`. | Actual SDD persistence state, no Engram. |

## Lifecycle gaps

| Required point | Current owner/behavior | Gap |
|---|---|---|
| availability | Preflight scans active tool *names*; doctors scan config/CLI. | Does not prove discovery, MCP readiness, operation support, or a usable result. |
| project identity | No Engram call exists. Preflight cache uses session-file/id then `ctx.cwd`. | No stable identity is sent to a memory backend. |
| retrieval | Parent prompt may ask for it. | No deterministic pre-phase call, timeout, result shape, empty-result behavior, or precedence rule in code. |
| save | Prompt may ask a model to save; preflight recognizes save-like names. | No deterministic post-discovery/close call, bounded payload, or success/failure outcome. |
| empty/failure | No operation result is received. | No normalized `empty`, `unavailable`, `failed`, or malformed-result path. |
| closure | `sdd-close` writes/moves OpenSpec records only. | No optional Engram closure capture. |

## Project identity and ambiguity

Current identity sources are **not** a memory identity contract:

| Source | Current use | Suitability / ambiguity |
|---|---|---|
| `ctx.cwd` | preflight session-key fallback; runtime/project roots | Available but changes on move and can collide by basename if reduced. |
| session file/id | preferred preflight cache key | Session-specific, not project-stable. |
| `openspec-config-bootstrap.ts` | starts with `basename(cwd)`; root `package.json.name` may replace it | Human/project context only; nested packages and duplicate names are ambiguous. If no markers exist it calls the project “Unclassified software project”. |
| `sessions.ts` | recent-session label is `basename(meta.cwd)` | Explicitly collision-prone; display-only. |
| git remote/origin | No Engram/memory identity code consumes it. | No remote/no-remote behavior exists to confirm. |

Thus unknown, moved, no-remote, and duplicate-basename projects neither fail closed nor are isolated for Engram: there is simply no operation path. The configured `ENGRAM_DATA_DIR` is a shared user-level database path; without a passed stable project key, project isolation cannot be evidenced.

## Feasible transport seams (mapping only)

| Option | What exists | What is missing / must be a new adapter |
|---|---|---|
| Model-selected MCP tool | `mcp.json` launches `engram mcp --tools=agent` lazily; prompts may advise use; preflight can inspect active tool names. | Deterministic code cannot invoke a selected MCP tool in repository source. Actual names, schemas, project discovery, search/save/update, diagnostics, and return/error shapes are unverified. |
| Local Pi extension tool | Established Pi-doc finding: extension tools can execute deterministic local code; existing Ein extensions demonstrate `registerTool(... execute ...)`. | A new local memory adapter/tool plus an owned transport is needed; no current local Engram tool exists. |
| Direct Engram CLI | Installer can locate/install `engram`; config proves only the `mcp --tools=agent` invocation. | No observed CLI command for current-project, search/context, save/update, or output protocol; a CLI adapter cannot be safely specified until that surface is validated. |
| Extension-to-MCP bridge | The config may make tools visible to the model. | No repository API bridges from extension code to arbitrary registered/MCP tools. The prior Pi-doc finding also did not establish direct arbitrary-tool invocation. New bridge/adapter capability is required. |

Do not infer a transport from tool-name suffixes or from `directTools:false`.

## Result normalization and data risks

- **Normalization:** installer outcomes are normalized (`EngramResolution`, `EngramInstall`, and generic `RunResult`), but there is no runtime memory-operation result type. A future deterministic owner has no established mapping from MCP/CLI success, empty, unavailable, malformed, timeout, or error to the scope’s outcomes.
- **Secrets/noise:** current prompt guidance can invite broad “discoveries”; there is no payload allowlist/redaction layer. The configured data-dir path and checked-in resolved home path are environment metadata, not a memory secret filter. Raw artifacts, source, logs, diffs, transcripts, and test output have no runtime guard against being sent.
- **Staleness:** no timestamp/version/source validation is applied to memory because nothing is retrieved. Prompt text says current source/OpenSpec/user instructions prevail, but code does not enforce it.
- **Deduplication/supersession:** no topic/project key is generated or queried by code. The strings suggested in prompts (`sdd/<change>/...`) are advisory and not deduplicated.
- **Availability false positives:** a matching active-tool name can be unrelated, unwritable, disconnected, or fail on call; exceptions in the probe collapse to `false` without diagnostic detail.

## Tests and injection seams

The repository uses Bun tests (`bun:test` imports). There is no root `package.json` test script; `installer/package.json` has only dev/bundle/build/typecheck scripts. The evidenced focused command is therefore **`bun test tests/` from repository root** (or individual `bun test tests/<file>.test.ts`); it is not run in map.

| Existing test/harness | What it covers now | Fake/injection seam for this change |
|---|---|---|
| `tests/sdd-preflight-tdd-gate.test.ts` | Pure `renderSddPreflightPrompt` using literal `PREFS`; asserts rendered lines. | Extend only for honest rendering; it cannot fake a transport. |
| `tests/review-workload-guard.test.ts` | Imports same renderer and reads prompt files as text. | Prompt regression only. |
| `tests/git-baseline.test.ts` | Imports preflight renderer; uses temporary real git repo for baseline behavior. | Avoid using real Engram; separate injected adapter tests required. |
| `tests/sdd-router.test.ts` | Temp directories and `writeFileSync`; router status/path behavior. | Can prove OpenSpec continuity independently of a fake memory adapter. |
| `tests/sdd-close.test.ts` | Covers deterministic archive move (reported by codegraph). | Can prove close continuity; no current hook for optional save. |
| `tests/sdd-flow-contract.test.ts`, `tests/subagent-build-hygiene.test.ts`, `tests/sdd-aliases.test.ts`, `tests/sdd-next-dispatcher.test.ts` | Text/wiring contracts for agents, orchestrator, and commands. | Update only if lifecycle prompt/command wording intentionally changes. |
| installer tests / `e2e/docker-test.sh` | Installer E2E explicitly passes `--no-engram`; codegraph reports no direct coverage for resolver/deploy/install. | Do not use for real memory. Installer unit seam is its `run` helper, but runtime adapter tests need a separate injected interface. |

`ensureSddPreflight` already accepts injectable `installAssets` and `applyModelConfig`, but **not** `getActiveTools` or a memory transport: it receives `pi` directly. The minimum testable seam for E2 is an explicit adapter dependency passed to the deterministic lifecycle owner; fakes must return normalized available/empty/unavailable/failure outcomes and must never reach the real CLI/MCP.

## Production/test forecast and review decomposition warning

Forecast only; design must refine it after validating the real transport surface.

| Slice | Production estimate | Test estimate | Why |
|---|---:|---:|---|
| Adapter contract, input filtering, result normalization | 150–230 | 120–190 | New boundary; presently absent. |
| Deterministic lifecycle owner and truthful preflight/doctor status | 100–170 | 80–130 | Retrieval/save placement and non-blocking continuity. |
| Identity/topic, stale/dedup rules | 80–140 | 100–180 | No existing stable project identity or dedup code. |
| **Total** | **330–540** | **300–500** | Excludes generated/docs changes. |

The production forecast can exceed the 400-line Review Workload Guard. Treat it as a decomposition warning, not a delivery decision: likely bounded work units are (1) adapter + normalized fake matrix, (2) lifecycle/preflight integration, and (3) identity/dedup/staleness plus regression tests. `ein-git` remains the authoritative measured gate.

## Design entry conditions

`sdd-design` should choose no higher claim than E1 unless it first validates the actual callable Engram operation schemas and selects a real deterministic adapter owner. Design must preserve OpenSpec canonical records, optional/non-blocking behavior, injected-only fake transports, and explicit outcomes for availability, identity, retrieval, empty, save, dedup, stale, filtered, and failure paths.

## Ledger

ledger:
  reads:
    - { path: "openspec/changes/engram-deterministic-contract/map.md (prior partial map)", lines: 58, estimated_tokens: 1200 }
    - { path: "installer/src/core/engram.ts", lines: 144, estimated_tokens: 1900 }
    - { path: "installer/src/core/deps.ts", lines: 170, estimated_tokens: 900 }
    - { path: "installer/src/core/deploy.ts", lines: 149, estimated_tokens: 1500 }
    - { path: "installer/src/core/exec.ts", lines: 117, estimated_tokens: 1000 }
    - { path: "installer/src/core/verify.ts", lines: 120, estimated_tokens: 1000 }
    - { path: "installer/src/cli/install.ts", lines: 90, estimated_tokens: 700 }
    - { path: "ein-pi/agent/mcp.json", lines: 19, estimated_tokens: 150 }
    - { path: "ein-pi/agent/lib/sdd-preflight.ts", lines: 560, estimated_tokens: 5000 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: 90, estimated_tokens: 900 }
    - { path: "ein-pi/agent/extensions/sdd-init.ts", lines: 35, estimated_tokens: 350 }
    - { path: "ein-pi/agent/extensions/ein-doctor.ts", lines: 90, estimated_tokens: 900 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: 250, estimated_tokens: 2100 }
    - { path: "ein-pi/agent/lib/sdd-close.ts", lines: 64, estimated_tokens: 600 }
    - { path: "ein-pi/agent/lib/openspec-config-bootstrap.ts", lines: 110, estimated_tokens: 1000 }
    - { path: "ein-pi/agent/lib/sessions.ts", lines: 130, estimated_tokens: 900 }
    - { path: "ein-pi/agent/lib/persona.ts", lines: 35, estimated_tokens: 350 }
    - { path: "ein-pi/agent/assets/orchestrator.md", lines: 35, estimated_tokens: 450 }
    - { path: "ein-pi/core/agents/sdd-{scope,map,design,tasks,apply,verify,close}.md", lines: 95, estimated_tokens: 1100 }
    - { path: "ein-pi/core/skills/local/skill-registry/SKILL.md", lines: 40, estimated_tokens: 350 }
    - { path: "tests/sdd-preflight-tdd-gate.test.ts", lines: 45, estimated_tokens: 350 }
    - { path: "tests/review-workload-guard.test.ts", lines: 110, estimated_tokens: 850 }
    - { path: "tests/git-baseline.test.ts", lines: 165, estimated_tokens: 1100 }
    - { path: "tests/sdd-router.test.ts", lines: 220, estimated_tokens: 1600 }
    - { path: "tests/sdd-close.test.ts", lines: 100, estimated_tokens: 700 }
    - { path: "tests/{sdd-flow-contract,subagent-build-hygiene,sdd-aliases,sdd-next-dispatcher}.test.ts", lines: 180, estimated_tokens: 1200 }
    - { path: "installer/package.json", lines: 18, estimated_tokens: 150 }
    - { path: "e2e/docker-test.sh", lines: 65, estimated_tokens: 500 }
  webfetch_used: false
  budget_consumed: { tokens: 26550, reads: 28 }
