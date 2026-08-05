# Design — core-parity

## A. Proposal

### Intent

Make Claude Code a deterministic, fail-closed adaptation of the canonical Ein coordinator and agent inventory while preserving the real differences between the Pi and Claude runtimes. Expose explicit OpenSpec synchronization through `cc-ein-sdd` and protect the adapted surfaces with fixture-based parity checks.

### Scope

In scope:

- Compile `cc-ein/CLAUDE.md` from `ein-pi/core/AGENTS.md` plus an explicit Claude-owned adaptation source.
- Validate agent tools, runtime references, and model routing before accepting or deploying generated output.
- Add an explicit `cc-ein-sdd sync <change>` command backed by `synchronizeOpenSpecFilesystem`.
- Add deterministic Bun parity coverage and bounded tracking updates to `EIN.md` and `docs/roadmap-beta.md`.

Out of scope:

- Making Pi and Claude use an identical coordinator document or identical tool/delegation semantics.
- Implicit synchronization from `status`, `check`, `close`, or `guard`.
- Installer-beta, release, Docker, network, live-Claude, unrelated CI, or broad core refactors.
- Filling the curated placeholders in `EIN.md` or rewriting the roadmap beyond core-parity state/evidence.

### Affected areas

- Canonical input: `ein-pi/core/AGENTS.md` and the inventory under `ein-pi/core/agents/`.
- Claude adaptation and compiler: `cc-ein/CLAUDE.adapter.md` (new explicit adaptation source) and `cc-ein/sync.ts`.
- Generated output: `cc-ein/CLAUDE.md` and its deployed copy under `CC_EIN_HOME`.
- Claude lifecycle CLI: `cc-ein/sdd-cli/cli.ts`.
- Shared synchronizer, reused without a second algorithm: `ein-pi/agent/lib/openspec-spec-sync-fs.ts`.
- Parity and CLI tests under `tests/`, following `tests/i18n-parity.test.ts` and existing OpenSpec test conventions.
- Tracking only: `EIN.md` and the core-parity section of `docs/roadmap-beta.md`.

### Risks

- An over-broad token scan could reject harmless prose; an under-broad scan could leave executable Pi references in Claude output.
- Generated-file ownership could overwrite manual edits unless provenance and the authoritative inputs are unmistakable.
- Routing inventory and adapter registries could become a second hidden source of truth if exact-set validation is incomplete.
- Error text from filesystem failures could vary by platform and weaken the CLI contract unless normalized.
- Deployment could become partially updated if validation occurs after writes rather than before promotion.

### Rollback

Revert the compiler, adaptation source, CLI dispatch, generated coordinator, tests, and bounded tracking changes together, regenerate from the previous inputs, and redeploy the previous known-good Claude surface. Validation failures never require rollback because they must occur before generated/deployed bytes are promoted. OpenSpec writes retain the existing shared synchronizer's snapshot restoration and conflict-without-overwrite behavior.

### Success criteria

- The checked-in and deployed Claude coordinator bytes are reproducible from the named canonical and adaptation inputs.
- Supported Pi tools and runtime references translate, while unknown tools, unresolved runtime references, and missing or stale routing fail before output promotion with source identity.
- `cc-ein-sdd sync <change>` has the exact output and exit contract defined below and directly uses the shared filesystem synchronizer.
- Repeated valid generation and OpenSpec synchronization are idempotent.
- Focused parity tests detect source, generated-output, mapping, token, routing, and CLI-outcome drift without external services.

## B. Spec

### Canonical context

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/specs/sdd-lifecycle/spec.md` | `7fca9adb82460b90024474ea4eb105a99a4bcc0fe78ff1c7c5f181af508e73e6` | 13,428 |

Selection total: one file and 13,428 bytes, within the three-file and 32 KiB canonical-context limit.

### Requirement: Generated Claude coordinator

The system **MUST** generate `cc-ein/CLAUDE.md` from `ein-pi/core/AGENTS.md` plus `cc-ein/CLAUDE.adapter.md`, **MUST** identify both inputs in a generated-file header, and **MUST NOT** treat `cc-ein/CLAUDE.md` as an authoritative hand-maintained brain. The generated document **MUST** retain exactly one ordered `<!-- ein:harness-discipline:start -->` / `<!-- ein:harness-discipline:end -->` block supplied by the Claude adaptation, and **MUST** preserve Claude-native tools, `cc-ein-sdd`, and Claude-specific delegation/configuration rather than rewriting Pi and Claude into one runtime.

**Scenario — canonical source and explicit adaptation generate Claude**

- **Given** the canonical coordinator and Claude adaptation inputs are valid,
- **When** core synchronization compiles the Claude coordinator,
- **Then** the output contains deterministic shared policy, a visibly bounded Claude adaptation, the preserved harness-discipline block, and no independently authored coordinator content.

### Requirement: Unknown tools fail closed

The system **MUST** translate each parsed canonical agent `tools` entry through an exact tool mapping or an explicitly registered prefix mapping. It **MUST** reject every unmatched tool before generated or deployed bytes change, identify the source path, agent, and tool in a stable `PARITY_UNKNOWN_TOOL` diagnostic, and **MUST NOT** copy the unmatched spelling into Claude frontmatter.

**Scenario — unmapped agent tool is rejected**

- **Given** a canonical agent declares an unmapped tool,
- **When** synchronization translates agent frontmatter,
- **Then** synchronization exits unsuccessfully with `PARITY_UNKNOWN_TOOL`, names the source agent and tool, leaves previously accepted outputs unchanged, and emits no parity-success claim.

### Requirement: Runtime references use bounded validation

The system **MUST** validate runtime references with a finite, declarative registry rather than semantic or substring guessing:

1. Parsed frontmatter tool identifiers are validated as whole values.
2. Whole `ein_[A-Za-z0-9_]+` identifiers in Markdown are lexed with source location; each occurrence **MUST** have a source-scoped registry disposition of `translate`, `remove`, or `literal`. A `literal` disposition **MUST** name the exact token and source scope and include a rationale; blanket wildcards are forbidden.
3. Pi-only prose concepts **MUST** use explicit `ein:runtime-ref` markers with registered IDs. Existing known Pi-only signatures such as intercom/supervisor asks, `completionGuard`, `turnBudget`, `acceptance-report`, `pi-subagents`, and `.pi/ein/*` **MUST** either be marked or be rejected by exact, boundary-aware legacy detectors.
4. The generated Claude body **MUST** contain neither unresolved runtime markers nor unregistered whole `ein_*` identifiers.

Unknown registry entries, unresolved markers, and unmarked known Pi-only signatures **MUST** fail with `PARITY_UNTRANSLATED_TOKEN` and a source path plus line/column. The validator **MUST NOT** match substrings inside larger identifiers or infer runtime meaning from ordinary natural-language words.

**Scenario — untranslated token or marked concept is rejected without prose guessing**

- **Given** canonical content contains an unregistered whole `ein_*` reference, an unknown runtime marker, or an exact known Pi-only signature outside its declared adaptation,
- **When** the Claude surface is compiled,
- **Then** compilation fails at the located reference and does not accept generated output, while unrelated prose and explicitly scoped literals remain valid.

### Requirement: Routing matches the canonical inventory

The system **MUST** derive the canonical agent identity set from the sorted canonical agent files and parsed `name` values, compare it bidirectionally with the Claude model/effort routing keys, and require exactly one valid route per canonical agent. A missing route **MUST** fail as `PARITY_ROUTING_MISSING`; a route without a canonical agent **MUST** fail as `PARITY_ROUTING_STALE`. Both diagnostics **MUST** identify the agent, and routing validation **MUST** complete before output promotion.

**Scenario — missing and stale routes are observable**

- **Given** the canonical inventory and Claude routing declarations differ in either direction,
- **When** synchronization builds Claude agent frontmatter,
- **Then** synchronization fails with the applicable named routing diagnostic and does not claim a complete Claude agent surface.

### Requirement: Generation and parity checks are deterministic

The compiler **MUST** sort inventory-driven inputs, use UTF-8 with LF endings and one final newline, and omit timestamps, absolute host paths, random values, and environment-dependent ordering from generated coordinator and agent bytes. It **MUST** validate all coordinator, tool, token, and routing inputs before promoting any generated/deployed surface. A deterministic parity check **MUST** compare compiled bytes with checked-in generated bytes and **MUST** name the mismatched surface.

**Scenario — repeated compilation and drift check**

- **Given** unchanged canonical inputs, adaptation inputs, and generated surfaces,
- **When** compilation and parity checking run repeatedly,
- **Then** every run produces identical bytes and passes; changing a source, mapping, runtime disposition, route, or generated byte causes a named failure.

### Requirement: Explicit Claude OpenSpec sync contract

The system **MUST** expose only the explicit command `cc-ein-sdd sync <change>` for this operation and **MUST** call `synchronizeOpenSpecFilesystem(cwd, change)` directly. Handled outcomes **MUST** write exactly one compact JSON object followed by `\n` to stdout, write nothing to stderr, use the key order shown below, sort `domains`, use repository-relative slash-separated paths, and omit stacks, timestamps, temporary names, and absolute paths. `canonicalChanged` describes canonical spec bytes only; a conflict can still write its report.

| Outcome | Exit | Exact JSON shape |
|---|---:|---|
| Synchronized | `0` | `{"command":"sync","change":"<change>","ok":true,"outcome":"synchronized","canonicalChanged":<boolean>,"domains":["<sorted-domain>"],"report":"openspec/changes/<change>/sync-report.md","code":null,"message":null}` |
| Conflict | `2` | `{"command":"sync","change":"<change>","ok":false,"outcome":"conflict","canonicalChanged":false,"domains":["<sorted-domain>"],"report":"openspec/changes/<change>/sync-report.md","code":"OPENSPEC_CONFLICT","message":"canonical OpenSpec bytes were not changed"}` |
| Malformed/input | `3` | `{"command":"sync","change":"<change>","ok":false,"outcome":"malformed","canonicalChanged":false,"domains":[],"report":null,"code":"<MALFORMED_OPENSPEC|CHANGE_NOT_FOUND|UNSAFE_CHANGE_NAME>","message":"<stable-owned-diagnostic>"}` |
| Operational failure | `4` | `{"command":"sync","change":"<change>","ok":false,"outcome":"operational_failure","canonicalChanged":false,"domains":[],"report":null,"code":"OPERATIONAL_ERROR","message":"<normalized-repository-relative-diagnostic>"}` |
| Wrong arity | `64` | `{"command":"sync","change":null,"ok":false,"outcome":"usage","canonicalChanged":false,"domains":[],"report":null,"code":"USAGE","message":"usage: cc-ein-sdd sync <change>"}` |

`<change>` is the validated supplied name. Malformed OpenSpec syntax/contract data maps to `MALFORMED_OPENSPEC`; an absent named change maps to `CHANGE_NOT_FOUND`; an unsafe name maps to `UNSAFE_CHANGE_NAME`. Filesystem/process failures, including incomplete rollback, map to `OPERATIONAL_ERROR`. The CLI **MUST** preserve the shared synchronizer's conflict no-overwrite behavior, report publication, idempotence, atomic replacement, and rollback behavior rather than reimplementing them.

**Scenario — CLI distinguishes synchronized, conflict, malformed, and operational outcomes**

- **Given** fixture changes representing a valid delta, a canonical conflict, malformed content, and a filesystem failure,
- **When** Claude invokes `cc-ein-sdd sync <change>`,
- **Then** each fixture uses the exact JSON channel and exit code above, success updates through the shared synchronizer, conflict preserves canonical bytes, and errors do not claim synchronization.

### Requirement: Existing lifecycle commands do not synchronize

The system **MUST** keep `status`, `check`, `close`, and `guard` behavior unchanged except that help/dispatch may list `sync`. These commands **MUST NOT** call the filesystem synchronizer or write canonical specs as a side effect; close readiness remains governed by existing canonical lifecycle evidence.

**Scenario — synchronization remains explicit**

- **Given** a change has pending or conflicting OpenSpec evidence,
- **When** `status`, `check`, `close`, or `guard` runs,
- **Then** the existing command reports or enforces its current lifecycle result without modifying canonical specs or a sync report.

## C. Decisions

### 1. Canonical policy and runtime adaptation remain separate

`ein-pi/core/AGENTS.md` owns shared coordinator policy. `cc-ein/CLAUDE.adapter.md` owns Claude-only coordinator prose, native tool/delegation terminology, `cc-ein-sdd` guidance, configuration differences, and the existing harness-discipline block. `cc-ein/CLAUDE.md` is a generated projection with this fixed provenance header:

```md
<!-- GENERATED: source=ein-pi/core/AGENTS.md adapter=cc-ein/CLAUDE.adapter.md; DO NOT EDIT -->
```

The generated document visibly encloses adapter-owned content in `<!-- ein:claude-adaptation:start -->` and `<!-- ein:claude-adaptation:end -->`. Shared policy is not duplicated into the adapter, and Pi-only instructions are translated, removed, or replaced only through declared adaptation rules.

**Trade-off:** This introduces one small adaptation source, but prevents both full-document duplication and a false claim that Pi and Claude are the same runtime.

### 2. Validation is lexical and declarative, not heuristic

The compiler parses structured frontmatter, lexes exact whole `ein_*` identifiers with locations, and resolves explicit runtime markers. It does not run broad substring searches or attempt natural-language classification. Exact source-scoped literal dispositions cover genuine documentation examples without allowing a global escape hatch; the current broad `CC_NOTE` exemption is not an acceptance mechanism.

**Boundary:** Canonical authors identify runtime-specific prose with markers; the compiler owns registry enforcement and residual-output validation; the Claude adapter owns the translated/replacement text.

### 3. Inventory is canonical; routing is adaptation policy

Agent files and parsed names define membership. Claude model/effort choices remain legitimate Claude adaptation data, but their key set must equal canonical membership in both directions. Sorted enumeration makes diagnostics and output stable.

### 4. Validation precedes promotion

Coordinator, agent, tool, runtime-token, and routing checks operate on compiled in-memory or staged bytes. Only a fully valid set may replace checked-in/generated and deployed surfaces. A failure returns a required failure, keeps prior accepted bytes, and never emits the parity-success result. Optional MCP setup warnings remain separate and cannot downgrade parity validation.

### 5. The Claude CLI is a thin adapter over the shared synchronizer

The CLI owns argument validation, outcome classification, stable JSON formatting, and exit codes. `synchronizeOpenSpecFilesystem` continues to own delta loading, planning, serialization, atomic canonical writes, report publication, conflict handling, and rollback. This boundary avoids a bridge script and a divergent synchronization algorithm.

### 6. Parity tests exercise both positive and mutation fixtures

Fixture-based Bun tests compare canonical inputs, adaptation inputs, compiler output, and checked-in generated output. Mutations cover unknown tools, unresolved tokens/markers, missing and stale routes, changed canonical policy, altered generated bytes, deterministic repeated generation, and the five CLI contract rows. Tests also assert one ordered harness-discipline block and preserve Claude-specific terms rather than expecting textual identity with Pi.

### 7. Tracking remains evidence-only

`EIN.md` is tracked byte-for-byte without completing its curated placeholders. `docs/roadmap-beta.md` records only core-parity state and evidence actually produced by later phases; it does not imply installer-beta or premature verification completion.

### Alternatives rejected

- **Keep two full coordinator documents:** rejected because shared policy drift remains invisible and manual copying stays authoritative.
- **Use `AGENTS.md` verbatim for Claude:** rejected because it erases legitimate tool, delegation, CLI, and configuration differences.
- **Continue unknown-tool passthrough or `CC_NOTE` exemptions:** rejected because unsupported names can look successfully synchronized.
- **Regex every runtime-looking English word:** rejected because generic words such as “ask” create false positives; exact identifiers, markers, and boundary-aware known signatures are bounded and reviewable.
- **Allow a wildcard literal exemption for `ein_*`:** rejected because it recreates silent passthrough.
- **Keep routing only as an unchecked hardcoded table:** rejected because both missing and stale entries remain silent.
- **Add sync side effects to status or close:** rejected because observation/close readiness must not mutate canonical evidence.
- **Wrap the Pi tool or create a second sync engine:** rejected because it adds a bridge and risks behavioral divergence from the shared filesystem synchronizer.
- **Human-readable ad hoc CLI lines:** rejected because stable JSON plus dedicated exits gives Claude agents and close gates an unambiguous contract.

### Responsibility boundaries

| Responsibility | Owner |
|---|---|
| Shared coordinator policy | `ein-pi/core/AGENTS.md` |
| Claude-only coordinator content and harness block | `cc-ein/CLAUDE.adapter.md` |
| Translation, registries, routing-set validation, deterministic generation, promotion gate | `cc-ein/sync.ts` |
| Generated coordinator bytes | `cc-ein/CLAUDE.md` |
| CLI argument/outcome adapter | `cc-ein/sdd-cli/cli.ts` |
| OpenSpec planning, writes, report, conflict and rollback | `synchronizeOpenSpecFilesystem` |
| Behavioral regression contract | Bun parity and existing OpenSpec/lifecycle tests |
| Delivery/task slicing | Later SDD phases, not this design |

### Applied skills

The Ein discipline, architecture, and document-writer guidance apply: the design keeps SDD boundaries, chooses the smallest explicit adaptation seam, and uses precise active prose. The Hono skill is not applicable because no Hono API is involved. The frontend-design skill is not applicable because the change has no user interface.

## D. Success Criteria

Acceptance requires all of the following observable evidence:

- `cc-ein/CLAUDE.md` equals deterministic compiler output from the declared source and adapter, contains the provenance and adaptation markers, and contains exactly one valid harness-discipline block.
- Two valid generation runs produce byte-identical coordinator and agent surfaces; a canonical source edit changes the next compiled output without manual copying.
- Positive translation fixtures preserve supported native/MCP/SDD mappings and current model/effort choices.
- Unknown-tool, unresolved-token/runtime-marker, missing-route, and stale-route fixtures fail with the named diagnostic and source identity before any accepted bytes change.
- CLI fixtures match the exact stdout/stderr and exit contract for synchronized, idempotent synchronized, conflict, malformed, missing/unsafe change, operational failure, and wrong arity outcomes.
- Conflict fixtures leave canonical spec bytes unchanged; operational fixtures demonstrate the shared rollback behavior; no handled failure reports success.
- `status`, `check`, `close`, and `guard` regression fixtures show no implicit synchronization.
- `EIN.md` retains its curated and AUTO content, while the roadmap diff is confined to truthful core-parity state/evidence.

Known verification commands for later phases are:

```bash
bun test tests/core-parity.test.ts
bun test tests/agent-frontmatter-json.test.ts tests/agent-tools-contract.test.ts tests/openspec-specs.test.ts tests/sdd-close.test.ts tests/harness-discipline.test.ts
bun test
```

A temporary `CC_EIN_HOME` dry/deployment check must compare two generated trees and verify that a rejected fixture leaves the prior tree unchanged. No test, build, sync, or typecheck is executed in this design phase.
