# Map — readonly-scout-contract

status: complete
scope_status: bounded
change: readonly-scout-contract
phase: map
skill_resolution: paths-injected
budget_source: default
budget_exceeded: false

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/bun/SKILL.md", lines: 203, estimated_tokens: 1900 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/branch-pr/SKILL.md", lines: 174, estimated_tokens: 1500 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/chained-pr/SKILL.md", lines: 45, estimated_tokens: 600 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: 50, estimated_tokens: 700 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/comment-writer/SKILL.md", lines: 50, estimated_tokens: 500 }
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/document-writer/SKILL.md", lines: 93, estimated_tokens: 900 }
    - { path: "openspec/changes/readonly-scout-contract/map.md (prior partial evidence)", lines: 132, estimated_tokens: 2000 }
    - { path: "ein-pi/agent/settings.json", lines: 37, estimated_tokens: 400 }
    - { path: "ein-pi/agent/lib/model-config.ts", lines: 498, estimated_tokens: 5200 }
    - { path: "ein-pi/agent/extensions/ein-doctor.ts", lines: 512, estimated_tokens: 4800 }
    - { path: "ein-pi/agent/lib/sdd-preflight.ts", lines: 840, estimated_tokens: 3000 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts (inventory/detection sections)", lines: 290, estimated_tokens: 3200 }
    - { path: "ein-pi/agent/lib/sdd-reconcile.ts", lines: 173, estimated_tokens: 1600 }
    - { path: "installer/scripts/bundle-template.ts", lines: 177, estimated_tokens: 2100 }
    - { path: "installer/src/core/verify.ts", lines: 335, estimated_tokens: 3000 }
    - { path: "tests/agent-tools-contract.test.ts", lines: 140, estimated_tokens: 1600 }
    - { path: "tests/sdd-phase-runtime-contract.test.ts", lines: 176, estimated_tokens: 1800 }
    - { path: "tests/sdd-flow-contract.test.ts", lines: 255, estimated_tokens: 2600 }
    - { path: "tests/sdd-scope-budget.test.ts", lines: 40, estimated_tokens: 400 }
    - { path: "tests/sdd-scope-packet.test.ts", lines: 126, estimated_tokens: 1200 }
    - { path: "tests/model-config.test.ts (user-agent inventory section)", lines: 65, estimated_tokens: 700 }
    - { path: "/home/samuhlo/.pi/agent/npm/node_modules/pi-subagents/package.json", lines: 65, estimated_tokens: 700 }
    - { path: "/home/samuhlo/.pi/agent/npm/node_modules/pi-subagents/src/agents/agents.ts (AgentConfig/frontmatter parser)", lines: 265, estimated_tokens: 3000 }
    - { path: "/home/samuhlo/.pi/agent/npm/node_modules/pi-subagents/src/api/preflight.ts", lines: 410, estimated_tokens: 4300 }
    - { path: "/home/samuhlo/.pi/agent/npm/node_modules/pi-subagents/src/runs/shared/pi-args.ts", lines: 371, estimated_tokens: 4300 }
    - { path: "/home/samuhlo/.pi/agent/npm/node_modules/pi-subagents/src/extension/schemas.ts", lines: 330, estimated_tokens: 3500 }
    - { path: "/home/samuhlo/.pi/agent/npm/node_modules/pi-subagents/src/runs/shared/{turn-budget,tool-budget,structured-output,acceptance}.ts", lines: 1460, estimated_tokens: 9000 }
  webfetch_used: false
  budget_consumed: { tokens: 58700, reads: 27 }

## Decision

Ship `ein-scout` as a **user agent** in `ein-pi/core/agents/ein-scout.md`, not as an SDD phase. Its reliable beta boundary requires both frontmatter and the parent invocation: `defaultContext: fresh`, `tools: read, grep, find`, `extensions:` (an explicit empty list), `inheritProjectContext: false`, `inheritSkills: false`, a positive `timeoutMs`, `turnBudget`, and `toolBudget` with `block: "*"`. The parent must still invoke it with `context: "fresh"`, an explicit `maxRuntimeMs`, `turnBudget`, `toolBudget`, `outputSchema`, and `acceptance` policy. Do not represent prompt prohibitions as enforcement.

## Runtime findings (installed `pi-subagents` 0.37.2)

| Requirement | Exact evidence | Decision / limitation |
|---|---|---|
| Fresh context | `src/api/preflight.ts` resolves `context: input.context ?? agent.defaultContext ?? "fresh"` (around line 328). `src/agents/agents.ts` accepts frontmatter `defaultContext: fresh|fork`; `src/extension/schemas.ts` defines invocation `context`. | `defaultContext: fresh` is the agent default, **not an absolute guarantee**, because an invocation can override it with `fork`. The enforceable launch requirement is explicit `context: "fresh"`; frontmatter is defense in depth. |
| Static tools | `src/runs/shared/pi-args.ts#resolvePiLaunchToolPlan` makes `tools:` an explicit allowlist and `buildPiArgs` passes `--tools <effective>` (or `--no-tools`). `tests/agent-tools-contract.test.ts` and doctor describe this correctly. | A scout declaring only `read, grep, find` cannot receive builtin `bash`, `write`, `edit`, or `subagent` through the builtin allowlist. `structured_output` is an intentional internal tool when `outputSchema` is supplied. |
| Dynamic/ambient tools | The same planner sets `disableAmbientExtensions = ... || input.extensions !== undefined`; only then it passes `--no-extensions`. It always adds Pi's prompt runtime; it adds `fanout-child.ts` only when declared tools include `subagent`. | **Tools frontmatter alone is insufficient to prove extension isolation.** Set frontmatter `extensions:` explicitly empty (not absent), do not declare path/provider tools, MCP tools, or `subagent`. That causes `--no-extensions`, while the runtime's necessary prompt extension remains. No source proves a hostile/ambient Pi builtin cannot dynamically register another builtin, so beta should claim only this runtime launch boundary, not universal sandboxing. |
| Timeout | `timeoutMs` frontmatter is parsed as a positive integer in `src/agents/agents.ts`; invocation schema permits `timeoutMs` / alias `maxRuntimeMs`, documented as foreground default 30 minutes. | Enforceable wall-clock field: per call `maxRuntimeMs` (preferred explicit), with frontmatter `timeoutMs` fallback. There is no `maxExecutionTimeMs` parser in installed user-agent schema. |
| Turns | `turnBudget: { maxTurns, graceTurns? }` is validated in `src/extension/schemas.ts` and `src/runs/shared/turn-budget.ts`; it asks to wrap up and can abort after the limit, but can defer while tool work is active. | Enforceable but not an exact hard ceiling at a tool boundary unless the runner's hard-limit mode is used. Do not promise an exact response-token ceiling. |
| Tool/read budget | `toolBudget: { hard, soft?, block? }`; `tool-budget.ts` blocks only selected tools after `hard`, default block is read/grep/find/ls, `"*"` blocks all. | Use `block: "*"` to prevent more tools after the limit. This is a **tool-call** count, not a read/file/byte limit. `max_reads`, bytes read, and source-token budgets are unsupported by installed runtime. Keep those as report/audit requirements or add an adapter. |
| Output structure | `outputSchema` accepts a JSON Schema object; `structured-output.ts` requires `structured_output`, reads JSON, and TypeBox-compiles/validates it. | It can enforce object shape, required fields, `maxLength`, `maxItems`, patterns, and an uncertainty enum. It does **not** independently verify that cited files/lines exist, that claims follow sources, or that prose outside the structured response is short. |
| Acceptance | `acceptance.ts` parses and validates a fixed generic acceptance-report and runs configured verification commands. It does not provide arbitrary report-specific predicates. `acceptanceRole: read-only` only affects inferred acceptance, never tool access. | Do not misuse generic acceptance as citation/uncertainty enforcement. `acceptance: { level: "none", reason: ... }` avoids an irrelevant generic evidence contract; a scout-specific deterministic validator must decide semantic acceptance. |

## Smallest honest beta contract

1. The agent may inspect through `read`, `grep`, and `find`; it has no declared mutation, shell, delegation, provider-path, or MCP tool.
2. The parent launches only with explicit fresh context and bounded wall-clock/turn/tool budgets.
3. The scout returns structured JSON containing a concise report, `references[]` (`path`, line range, claim), and `uncertainty` (controlled values). JSON Schema can cap these fields.
4. A local deterministic adapter is required before claiming verified citations, reference existence, byte-size caps across the full report, or truthful uncertainty. It should parse the structured output, enforce total UTF-8 size and reference count/path/line syntax, resolve each reference beneath the repository and confirm its line range, require non-empty uncertainty, and reject violations. It must not infer truth from prose. Without that adapter, narrow beta wording to “structured self-report with declared references and uncertainty”, not validated research.

## Authoritative inventory and consumers

**Authoritative inventory:** `ein-pi/core/agents/*.md`. `installer/scripts/bundle-template.ts` copies that directory into the staged `agents/`, regenerates `assets/agents/` from it, and generates `template-manifest.json` by scanning staged `agents/`. This is the only inventory that should grow with `ein-scout.md`.

| Consumer | Required change |
|---|---|
| `installer/scripts/bundle-template.ts` | No new list. Existing scan/copy/manifest propagation handles scout. Add/retain a bundle-manifest test proving it. |
| `ein-pi/agent/lib/sdd-preflight.ts` | No new list. Existing recursive assets copy and drift comparison propagate scout from generated `assets/agents`. |
| `installer/src/core/verify.ts` | Manifest-driven installs will require scout automatically. Update its legacy fallback inventory with a non-SDD agent list, or legacy/no-manifest installs silently omit the requirement. Keep `SDD_AGENTS` exactly seven. |
| `ein-pi/agent/extensions/ein-doctor.ts` | Add `ein-scout.md` to a non-SDD required-agent list and label it research/read-only. Retain its separate seven-item `SDD_AGENTS`; its deployed-tool audit covers the scout declaration. |
| `ein-pi/agent/extensions/ein-ai.ts` | No SDD routing change. `isSddAgentStartEvent` relies on `SDD_AGENT_NAME_SET`; scout stays outside it. It is discovered as a named user agent, gets no SDD preflight/context/canonical-spec injection, and is included in status inventory by directory scan. |
| `ein-pi/agent/lib/model-config.ts` | Add an `ein-scout` recommendation (cheap/low or medium). Discovery is filesystem-based, so it will be model-routable once installed. `settings.json` contains only `packages` and `subagents.disableBuiltins`; it does not enumerate user agents and needs no scout entry. |
| `ein-pi/agent/lib/sdd-reconcile.ts` | No positive membership. `phaseForAgent` accepts only names whose suffix is in the seven-key `PHASE_ARTIFACT`; test `ein-scout` returns `null`. |

The SDD lifecycle remains exactly `scope → map → design → tasks → apply → verify → close`; do not add scout to `SDD_AGENT_NAMES`, router phase maps, the chain, `PHASE_AGENTS`, or any `sdd-*` filename convention.

## Focused test plan and commands

Add focused tests, do not run them in map:

- `tests/agent-tools-contract.test.ts`: scout is in `core/agents`, declared tools are exactly `read, grep, find`, and no provider/MCP/delegation/mutation tools appear.
- New scout-contract test: frontmatter has `defaultContext: fresh`, explicit empty `extensions`, disabled inherited project context/skills, positive timeout/turn/tool budgets, and the report schema/prompt does not claim prompt-only enforcement.
- `tests/model-config.test.ts`: scout discovery/routing and recommendation.
- `tests/sdd-phase-runtime-contract.test.ts` and `tests/sdd-flow-contract.test.ts`: explicit seven-only phase inventory and scout negative membership.
- `tests/sdd-reconcile.test.ts`: `phaseForAgent("ein-scout") === null`.
- Installer bundle/manifest and verify tests: generated manifest includes scout; fallback verification requires it without increasing SDD count.
- Adapter unit tests: reject oversize output, invalid/out-of-root/missing reference, bad line range, missing/invalid uncertainty; accept valid bounded references.

Planned verification commands for apply/verify: `bun test tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts`; add the focused scout/installer tests to that command. Run the existing installer test command defined by its package only after the new manifest/fallback tests are located by design/apply; no full suite or build is required for this bounded contract.

## Risks and review forecast

- **High:** calling scout with `context: "fork"`, or omitting the explicit empty `extensions` field, weakens the stated isolation boundary.
- **High:** `toolBudget` is not a read cap. A compliance claim of max files/bytes/tokens needs the local adapter or a narrower promise.
- **Medium:** static JSON Schema validates report shape, not citation existence or epistemic truth.
- **Medium:** installer fallback and doctor duplicate non-SDD requirements unless factored around the manifest/one shared inventory helper.
- **Forecast:** 8–12 production/config/agent files plus focused tests, likely below the 400 production-line review budget if the adapter is a small isolated module. If semantic reference validation is deferred, this is one focused PR; if included, split adapter + tests first, then scout inventory/wiring.

## Next phase

Proceed to `sdd-design`. The design must choose: (a) local deterministic scout-report adapter, or (b) explicitly narrowed, non-validated beta contract. Do not implement an “enforced” citation/uncertainty guarantee with frontmatter or prompt prose alone.
