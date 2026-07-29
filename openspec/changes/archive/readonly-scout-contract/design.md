# Design: bounded read-only scout contract

## Human outcome

Ein gains a librarian for repository questions: `ein-scout` may inspect and cite evidence, but it has no mutation, shell, delegation, delivery, lifecycle, or architecture authority. Beta accepts the supported user-agent extension contract without pretending that `pi-subagents` exposes a per-run extension-isolation receipt.

## Canonical context

The design reuses the sole canonical reference selected by scope; no mapped domain was added.

| Path | SHA-256 | UTF-8 bytes |
| --- | --- | ---: |
| `openspec/specs/sdd-lifecycle/spec.md` | `f895e00282b8efc1b70175b0823d451a0e496ab3ed083d21906f4cb9dd5f12b9` | 30699 |

This remains within the shared limit of 3 files and 32768 UTF-8 bytes. The relevant canonical invariants are the exact seven-phase lifecycle and bounded, explicitly recorded canonical context.

## A. Proposal

### Intent

Add `ein-scout` as the smallest supported beta research executor outside SDD. The parent normalizes only fields exposed by the `subagent` call schema and validates the structured report; the canonical user-agent frontmatter owns the empty extension declaration.

### Scope

**In scope**

- One user-agent contract with exactly `read`, `grep`, and `find` as its declared tools and an explicit empty `extensions:` list.
- Direct foreground invocation normalized to fresh context, bounded wall-clock time, bounded turns, and a hard tool-call budget.
- The supported extension boundary in installed `pi-subagents` 0.37.2: an explicitly empty agent extension list maps to `--no-extensions`, while the parent call schema exposes no extension override.
- A structured, byte-bounded report with repository references and explicit uncertainty.
- Deterministic pre-invocation normalization of supported call fields and post-invocation fail-closed report validation.
- Installation, model recommendation, doctor, static contract, and inventory coverage without changing the seven SDD agents.

**Out of scope / non-goals**

- An eighth SDD phase, lifecycle artifact, router target, reconciliation target, chain step, or OpenSpec state.
- Bash, write/edit, Git, delivery, OpenSpec mutation, web research, MCP/provider tools, or child delegation.
- Injecting `extensions: []` into the `subagent` tool-call input; that field is not exposed by the installed parent call schema.
- A per-run extension-isolation capability receipt or probe, or a launch hard-block that depends on such unavailable evidence.
- Pinning `pi-subagents`. Future package drift is an explicitly accepted residual risk, diagnosed by doctor and static contract checks where possible.
- A read-count, file-count, input-byte, source-token, response-token, or semantic-truth guarantee; installed `pi-subagents` does not expose those enforceable counters.
- An OS sandbox or proof that read builtins cannot inspect paths outside the repository. Accepted citations are repository-confined, but beta does not claim filesystem confinement.
- Automatic architecture, implementation, or delivery recommendations. The schema has no decision field, and the parent remains responsible for all decisions.
- Changes to `settings.json`, `PHASE_ORDER`, phase/router/reconcile/chain modules, or any of the seven `sdd-*` agent contracts.

### Delta correction

The current delta phrase **“enforced read ... bounds”** overclaims the installed runtime. The enforceable beta bound is a **tool-call budget** (`toolBudget.hard` with `block: "*"`), plus wall-clock and report-byte limits. It MUST NOT be represented as a read count: `read`, `grep`, and `find` cannot be distinguished into a trustworthy read-only counter by the installed budget mechanism. The delta is intentionally not edited in this phase; later synchronization must use the narrower wording.

### Architecture and data flow

1. **Authoring and distribution.** `ein-pi/core/agents/ein-scout.md` is the canonical agent source. Its frontmatter declares exactly `tools: read, grep, find` and an explicitly empty `extensions:` list. The existing bundle scan copies it to staged `agents/` and `assets/agents/`, then records it in `template-manifest.json`.
2. **Supported extension boundary.** Installed `pi-subagents` 0.37.2 preserves the explicit empty agent extension list and resolves any defined extension list to `--no-extensions` plus only its required internal runtime extension. The parent `subagent` call schema has no `extensions` field, so a valid caller cannot weaken the agent declaration through invocation. This is the accepted beta contract, not a per-run attestation.
3. **Pre-launch boundary.** The existing parent `subagent` `tool_call` hook delegates to a small pure adapter. The adapter recognizes every occurrence of `ein-scout`, normalizes the exposed direct-launch fields, and blocks nested chain/parallel/background/resume forms rather than allowing an alternate unbounded path. It does not inject an unsupported extension field and does not request an unavailable capability receipt.
4. **Runtime boundary.** `pi-subagents` starts the user agent from fresh context with the strict builtin allowlist, the empty extension declaration resolved from frontmatter, disabled inherited project context and skills, and normalized wall-clock/turn/tool budgets.
5. **Report boundary.** The scout emits one structured report through the runtime's internal `structured_output` mechanism. The parent `tool_result` hook associates exactly one payload with the tracked direct scout call and runs deterministic byte, schema, reference, and uncertainty validation.
6. **Acceptance.** A valid report is exposed to Ein as advisory evidence. Any timeout, budget failure, malformed or multiple payload, oversized payload, invalid reference, unreferenced claim, or absent uncertainty turns the result into an error and no scout finding is accepted.
7. **Drift diagnostics.** Doctor and static contract tests inspect the deployed frontmatter, parent schema assumptions, and package behavior where available. Because the package remains unpinned and no per-run capability probe exists, these checks reduce drift risk but do not convert extension isolation into a proven fact for each run.

No class hierarchy or service is needed. One pure `scout-contract` module owns supported launch normalization, tool-call tracking metadata, the report schema, and report validation; `ein-ai.ts` remains the thin Pi hook boundary.

### Supported invocation shape

Every accepted beta call is normalized to this supported parent input shape:

```ts
await subagent({
  agent: "ein-scout",
  task,
  context: "fresh",
  maxRuntimeMs: 120_000,
  turnBudget: { maxTurns: 12, graceTurns: 2 },
  toolBudget: { hard: 30, soft: 24, block: "*" },
  outputSchema: SCOUT_REPORT_SCHEMA,
  acceptance: {
    level: "none",
    reason: "Ein validates the scout report through its deterministic local adapter",
  },
});
```

`extensions` is deliberately absent: the installed parent call schema does not expose it. Extension selection comes from the user-agent frontmatter:

```yaml
tools: read, grep, find
extensions: []
defaultContext: fresh
inheritProjectContext: false
inheritSkills: false
timeoutMs: 120000
turnBudget: { maxTurns: 12, graceTurns: 2 }
toolBudget: { hard: 30, soft: 24, block: "*" }
```

In installed `pi-subagents` 0.37.2, that explicitly empty list maps to `--no-extensions`. The hook still overwrites `context` with `fresh`; `defaultContext: fresh` alone is not enforcement because callers can request `fork`. The 30-call hard limit covers child-visible tool calls, including any runtime-visible structured-output call; it is not “30 reads.” Turn budgeting may defer while a tool is active, so `maxRuntimeMs` remains the wall-clock backstop. Generic `acceptance` is disabled because it cannot verify scout-specific citations.

### Report schema

`SCOUT_REPORT_SCHEMA` is a closed JSON Schema (`additionalProperties: false` at every object) with this observable shape:

| Field | Contract |
| --- | --- |
| `version` | Required constant `ein-scout-report/v1`. |
| `summary` | Required non-empty string, at most 2000 characters. |
| `summaryReferenceIds` | Required 1–8 unique IDs; every ID resolves to `references`. |
| `findings` | Required 1–12 items. Each item has only `claim` (1–1000 chars) and 1–8 unique `referenceIds`. |
| `references` | Required 1–24 items. Each has unique `id` matching `R[1-9][0-9]*`, repository-relative `path` (1–512 chars), positive `startLine`, positive `endLine`, and non-empty `supports` (1–500 chars). |
| `uncertainties` | Required 1–8 items. Each has `level: none | low | material` and a non-empty `statement` (1–500 chars). “None” still requires an explicit statement. |

The deterministic post-adapter additionally enforces a maximum **16384 UTF-8 bytes** for the complete structured report, unique IDs, `endLine >= startLine`, no absolute/NUL/empty/`..` paths, and no unused references. Every summary and finding has at least one valid reference. It resolves and realpaths each cited file beneath the invocation repository root, requires a regular existing file, and confirms that the cited line range exists. Symlink escape, missing file, unreadable file, or out-of-range lines fail closed.

These checks establish report shape, byte bounds, and reference existence. They do not prove that prose is true, that a citation semantically supports a claim, that uncertainty is epistemically complete, or that extension isolation was attested for the individual run.

### Validation and failure matrix

| Condition | Deterministic outcome |
| --- | --- |
| Direct `ein-scout` launch with caller requesting `fork` or looser limits | Normalize to the exact supported fresh/budget/schema shape above. |
| Caller attempts an `extensions` override | The supported parent schema offers no such field; Ein does not inject one. The canonical agent's empty declaration remains the only extension configuration. |
| Scout appears in `tasks`, `steps`, `chain`, parallel, background, continuation, or resume form | Block before launch; direct foreground execution is the only beta path. |
| An unavailable per-run extension-isolation receipt/probe is absent | Do not block and do not claim proof; beta relies on the documented user-agent contract. |
| Static checks detect changed package semantics, a newly exposed call override, or deployed frontmatter drift | Report a doctor/static contract incompatibility where detectable; do not fabricate a per-run receipt. Unobserved future drift remains an accepted residual risk. |
| Deployed scout tools differ from exactly `read, grep, find`, or declare provider/MCP paths | Installation/doctor diagnostics and contract tests fail; the configuration is not an acceptable scout contract. |
| Timeout, hard tool budget, runner error, missing structured payload, or multiple payloads | Return an error; accept no report. |
| JSON/schema malformed, unknown fields present, or report exceeds 16384 UTF-8 bytes | Return an error; accept no report. |
| Summary/finding has no reference, ID is missing/duplicate/unused, or uncertainty is absent | Return an error; accept no report. |
| Reference is absolute, escapes root (including symlink), is missing/unreadable/non-file, or has an invalid line range | Return an error; accept no report. |
| Structurally valid report whose claim is debatable | Accept only as advisory evidence; the parent/human retains judgment. |

### Authoritative installed-agent inventory

The single authoring authority is the set of Markdown agents in `ein-pi/core/agents/`. `template-manifest.json#agents`, generated by scanning the staged copy, is the exact distribution/install receipt. SDD identity remains independently fixed at the existing seven names; non-SDD inventory is the manifest remainder and includes `ein-linear`, `ein-git`, and `ein-scout`.

| Consumer | Exact contract |
| --- | --- |
| Bundle | `installer/scripts/bundle-template.ts` continues scanning/copying `core/agents`; no new hand-maintained bundle list. Generated `agents/`, `assets/agents/`, and manifest all include scout. |
| Install/verify | Manifest-driven installs require its exact `agents` set. The no-manifest legacy fallback adds scout to its explicitly named non-SDD compatibility list while `SDD_AGENTS` remains seven. |
| Doctor | Uses the installed manifest for exact installed-agent checks, identifies scout as read-only research, audits its deployed tools and explicit empty extension declaration, and diagnoses known package/schema drift where static evidence is available. It does not claim a per-run extension-isolation receipt. |
| Models | Filesystem discovery exposes installed scout; `AGENT_RECOMMENDATIONS` adds a cheap/low scout recommendation. Scout is not added to `SDD_AGENT_NAMES` or `SDD_AGENT_NAME_SET`. |
| Tests | Exact comparisons bind source scan → staged copies → manifest → install/doctor/model discovery, statically cover the supported 0.37.2 extension mapping and call schema, and separately assert the seven-item SDD set plus scout's negative lifecycle membership. |

### Affected areas and minimal paths

The scout design concerns:

- `ein-pi/core/agents/ein-scout.md`
- `ein-pi/agent/lib/scout-contract.ts`
- `ein-pi/agent/extensions/ein-ai.ts`
- `ein-pi/agent/assets/orchestrator.md`
- `ein-pi/agent/lib/model-config.ts`
- `ein-pi/agent/extensions/ein-doctor.ts`
- `installer/src/core/verify.ts`
- Focused scout, inventory, model, doctor, and seven-phase negative-membership tests

No package pin is added. The existing bundler should require no production change. `settings.json`, all seven SDD agent files, phase order, router, reconcile implementation, and chain definitions remain unchanged.

### Risks

- **Accepted package drift:** because `pi-subagents` is intentionally unpinned, a future version may change empty-list semantics or add an invocation override. Doctor/static checks diagnose known drift where possible, but no per-run proof exists.
- A nested/background/resumed run could evade direct-call normalization; beta rejects those forms.
- Tool budgeting may be mislabeled as read budgeting, recreating the current delta overclaim.
- Valid paths and lines do not prove semantic support or truthful uncertainty; consumers may over-trust an advisory report.
- Read builtins are not an OS-level repository sandbox. The accepted-report validator limits citations, not every byte the child may inspect.
- Manifest-driven inventory and legacy fallback may drift unless exact tests bind them.
- The 16 KiB report cap may be too small for broad research; beta should request narrower research rather than relax limits implicitly.

### Rollback

Remove `ein-scout.md`, the scout adapter/hook branches, its model/doctor/fallback inventory entries, and focused tests, then regenerate the template manifest/bundle. Because scout never enters SDD state or writes artifacts, rollback requires no lifecycle migration and leaves the seven-phase flow unchanged.

## B. Spec

### Requirement: supported launch normalization

The system **MUST** normalize every supported direct `ein-scout` call to explicit `context: fresh`, `maxRuntimeMs: 120000`, the defined turn budget, the hard 30 tool-call budget with `block: "*"`, the canonical output schema, and scout-specific local validation. It **MUST NOT** inject `extensions: []` into the call input or require an unavailable runtime capability receipt, and it **MUST** block alternate invocation forms.

**Given** a caller requests `ein-scout` with fork context or looser supported limits,  
**When** the parent `subagent` tool-call hook evaluates the request,  
**Then** a direct foreground call is overwritten with the supported invocation shape without an `extensions` input, while every alternate form is blocked.

### Requirement: supported extension and tool boundary

The canonical scout agent **MUST** declare exactly `read`, `grep`, and `find` and an explicitly empty extension list, and **MUST NOT** declare bash, write, edit, subagent, delivery, OpenSpec mutation, provider-path, or MCP tools. Beta **MAY** rely on the installed 0.37.2 mapping of that empty list to `--no-extensions` and the absence of a parent-call extension override, but **MUST NOT** represent that static contract as a per-run attestation.

**Given** the canonical agent, installed 0.37.2 source, and parent call schema are inspected,  
**When** the supported extension and tool contract is evaluated,  
**Then** the agent has the three research builtins, its explicit empty extension list maps to `--no-extensions`, callers have no extension override, and the result is recorded as a supported static contract rather than a per-run proof.

### Requirement: explicit drift policy

The system **MUST NOT** pin `pi-subagents` for this beta solely to preserve extension behavior. It **SHOULD** diagnose detectable package, schema, deployed-agent, or static-contract drift through doctor and contract checks, and **MUST** describe undetectable future drift as an accepted residual risk.

**Given** an unpinned future `pi-subagents` installation changes a statically inspectable assumption,  
**When** doctor or contract checks inspect the installation,  
**Then** they report the incompatibility where detectable without claiming that any individual run produced an isolation receipt.

### Requirement: honest bounded execution

The system **MUST** enforce a positive wall-clock timeout and a hard tool-call budget, **SHOULD** warn at the configured soft threshold, and **MUST NOT** describe that budget as an exact read, file, byte-read, token, or turn ceiling.

**Given** a scout continues researching until it reaches a configured bound,  
**When** the runtime reaches the hard tool-call budget or wall-clock timeout,  
**Then** further work is blocked or the run terminates and Ein accepts no partial unvalidated report.

### Requirement: deterministic report acceptance

The system **MUST** accept only one schema-valid scout report of at most 16384 UTF-8 bytes whose summary and every finding are referenced, whose references resolve to existing in-root files and valid line ranges, and whose uncertainty declaration is explicit. It **MUST** fail closed for malformed, oversized, unreferenced, missing, ambiguous, or path-escaping evidence.

**Given** a scout run returns output,  
**When** the parent post-invocation adapter validates the payload,  
**Then** only a byte-bounded report with valid required references and explicit uncertainty reaches Ein; every validation failure is returned as an error with no accepted findings.

### Requirement: advisory authority boundary

The scout report **MUST** remain advisory and **MUST NOT** create architecture, implementation, delivery, routing, reconciliation, chain, or OpenSpec lifecycle decisions. The schema **SHOULD** contain evidence and uncertainty only, without a recommendation or decision field.

**Given** a valid scout report is returned,  
**When** Ein decides architecture, implementation, lifecycle, or delivery,  
**Then** the parent or designated SDD phase makes that decision and the scout report serves only as cited input.

### Requirement: inventory without lifecycle membership

The system **MUST** distribute and diagnose `ein-scout` through the authoritative agent source and generated manifest, **MUST** make it discoverable for model routing, and **MUST** preserve exactly the seven existing SDD agents in phase order, router, reconciliation, state, and chain contracts.

**Given** source agents, a generated template, an installation, model discovery, doctor, and lifecycle contracts,  
**When** their inventories are compared,  
**Then** each installed-agent consumer includes scout, while every SDD membership check remains exactly `scope → map → design → tasks → apply → verify → close` and `phaseForAgent("ein-scout")` is null.

## C. Decisions

### Decision 1: split authority between supported call fields and agent frontmatter

The parent hook is authoritative for fresh context, direct foreground form, runtime/turn/tool budgets, output schema, and acceptance. The canonical `ein-scout.md` frontmatter is authoritative for the empty extension list because the parent call schema does not expose an extension override. Frontmatter `defaultContext: fresh` remains defense in depth because context is overridable.

### Decision 2: direct foreground beta only

Rather than recursively support parallel, chain, background, and resume result shapes, beta blocks them. This is the smallest boundary that associates one normalized invocation with one deterministically validated payload and keeps scout outside chain machinery.

### Decision 3: accept the supported unpinned extension contract

Do not pin `pi-subagents`. For beta, accept that installed 0.37.2 maps canonical `extensions: []` to `--no-extensions` and that its parent call schema provides no extension override. Future drift is an explicit residual risk handled by doctor/static diagnostics where possible, not by a nonexistent per-run capability probe.

### Decision 4: tool-call budget, not read-count fiction

Use the runtime's actual `toolBudget: { hard, soft, block }`, with `block: "*"`. A custom read-count proxy is rejected because the runtime cannot reliably distinguish a user-meaningful read across `read`, `grep`, and `find`.

### Decision 5: one deterministic report adapter at the trust boundary

JSON Schema handles shape; the local adapter handles raw UTF-8 payload size, reference paths/ranges, and acceptance. It normalizes only supported invocation fields. Extension capability probing is not an adapter responsibility because the runtime exposes no truthful per-run receipt.

### Decision 6: source scan plus generated manifest is inventory authority

Do not add another hand-maintained global installed-agent list. `core/agents` is the authoring source and the generated manifest is the distribution receipt. The legacy no-manifest list remains a clearly named compatibility fallback, tested against the authority. The independent SDD set remains seven.

### Responsibility boundaries

| Owner | Responsibility |
| --- | --- |
| `ein-scout.md` | Research behavior, evidence-only output instruction, strict static tools, explicit empty extensions, and defense-in-depth defaults. |
| `scout-contract.ts` | Supported direct-call normalization, tracking, report schema, and byte/reference/uncertainty validation; no extension input injection or runtime capability probe. |
| `ein-ai.ts` | Pi pre/post hook wiring and fail-closed report-result replacement; no duplicated policy. |
| Installed `pi-subagents` | Resolve agent frontmatter, fresh process launch, extension/tool plan, wall-clock, turn/tool budgets, and structured-output execution. |
| Doctor/static tests | Diagnose known frontmatter, schema, package, and inventory drift where inspectable; never claim per-run extension proof. |
| Bundle/manifest/install/models | Distribution and diagnostics only; no lifecycle authority. |
| Parent / SDD design phase | Architecture and solution decisions. |
| SDD router/reconcile/chain | Existing seven phases only; no scout changes. |

### Alternatives rejected

- **Pinning `pi-subagents`:** the user explicitly accepts unpinned drift for beta.
- **Injecting `extensions: []` into the tool call:** the installed parent schema does not expose the field.
- **Hard-blocking on a runtime extension probe:** no truthful per-run capability receipt is available.
- **Claiming static source checks prove each run:** overstates evidence; they only diagnose known contract drift.
- **Frontmatter-only fresh context:** caller override makes it insufficient, so the parent still normalizes `context`.
- **Tools allowlist without explicit empty agent extensions:** omitting the extension declaration would lose the supported 0.37.2 `--no-extensions` mapping.
- **Prompt-only “do not write” and citation rules:** not deterministic enforcement.
- **Bash with a read-only prompt or shell filter:** too broad and creates mutation/Git escape risk.
- **Generic acceptance verification:** cannot apply scout-specific predicates.
- **Adding scout to SDD naming/order:** conflates installation with lifecycle authority and violates the seven-phase invariant.
- **Semantic citation scoring:** would imply truth validation the local adapter cannot provide.

## D. Success Criteria

The change is acceptable when all of the following observable checks hold:

- A direct call requesting `context: fork` or looser supported limits is observed as the exact normalized invocation shape above, without an injected `extensions` field.
- The canonical and deployed `ein-scout.md` declare `extensions: []`; static evidence for installed 0.37.2 confirms that an explicitly empty list maps to `--no-extensions`.
- The parent `subagent` call schema exposes no extension override, so valid callers cannot weaken the canonical declaration through invocation.
- No beta check requires a per-run extension-isolation receipt/probe, and absence of such unavailable evidence does not hard-block launch or produce a false proof claim.
- `pi-subagents` remains unpinned; doctor/static checks report detectable contract drift and documentation names undetected future drift as accepted residual risk.
- Nested/chain/parallel/background/resume scout requests remain blocked before execution.
- The deployed scout declares exactly `read, grep, find`; bash, write, edit, subagent, delivery/OpenSpec mutation, provider, and MCP tools are absent.
- Focused adapter tests accept a valid report and reject malformed JSON/schema, more than 16384 UTF-8 bytes, missing or duplicate IDs, unreferenced findings, missing uncertainties, absolute/escaping/symlink paths, missing files, and invalid line ranges.
- Source, staged agent copies, generated manifest, manifest-driven install verification, legacy fallback, doctor, and model discovery all include scout.
- `SDD_AGENT_NAMES`, phase order, router/flow contracts, reconciliation, and chain remain exactly seven; explicit negative tests show scout has no membership.
- No test or documentation describes the hard budget as a read count or claims a per-run extension-isolation fact.
- No source or generated OpenSpec artifact can be written through the scout's declared research tool plan.

Required focused verification commands remain:

```bash
bun test tests/readonly-scout-contract.test.ts tests/agent-tools-contract.test.ts tests/model-config.test.ts tests/sdd-phase-runtime-contract.test.ts tests/sdd-flow-contract.test.ts tests/sdd-reconcile.test.ts
cd installer && bun run typecheck
cd installer && bun run bundle-template
```

The focused inventory test must be included in the `bun test` command under its final path. A manual installed-template check should confirm that `ein doctor` reports `ein-scout` as read-only research, checks the explicit empty frontmatter/static package contract without claiming a runtime receipt, and still describes exactly seven SDD phases.
