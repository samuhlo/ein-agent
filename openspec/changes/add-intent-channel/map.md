---
status: pass
scope_status: bounded
change: add-intent-channel
phase: map
created: 2026-08-28T10:51:00Z
---

# MAP: Add Intent Channel

## Executive Summary

Mapped the five critical surfaces required for `/ein:intent` and `/ein:eh` to execute identically in both runtimes:

1. **Claude command surface**: `.md` files with frontmatter in `ein-cc/commands/ein/`, synced by `ein-cc/sync.ts` to `~/.claude-ein/commands/ein/`.
2. **Pi command surface**: Deterministic handlers via `pi.registerCommand("ein:<name>", { handler })`, with optional prompt injection via `pi.sendUserMessage()` — a **parity lever** not yet available in Claude side.
3. **Skills mechanism**: Local skills in `ein-pi/core/skills/local/<name>/SKILL.md`, distributed to both adapters.
4. **Paridade tests**: Prior art exists in `sdd-aliases.test.ts` and `claude-project-settings.test.ts`.
5. **ein-scout delegation**: Non-blocking fact-finding with schema validation; contracts in `scout-contract.ts`.
6. **Preflight location and form**: Single-file record per change at `openspec/changes/<change>/preflight.json`; TDD + lane decided once per change, reused across phases.

Critical asymmetry flagged: **Pi's `pi.sendUserMessage()` allows commands to inject prompts to the model; Claude's `.md` instruction files are static**. Design phase must resolve how `/ein:intent` branches differently in each runtime or unifies the behavior.

## Surfaces in Scope

### 1. Claude Runtime Command Surface (`ein-cc`)

**Location**: `ein-cc/commands/ein/*.md`

**How commands are declared and deployed**:
- Each command is a `.md` file with YAML frontmatter + Markdown content.
- Frontmatter keys observed:
  - `description` (string, required): One-line user-facing description.
  - `allowed-tools` (string, optional): CSV of tool names (`Bash`, `Read`, `Write`, etc.) the command may invoke.
  - `argument-hint` (string, optional): Usage hint (e.g., "status|refresh|clear|to pi|to claude").
- Content is the instruction (prompt) served to Claude as-is.

**Examples**:
- `status.md`: Reads `ein-cc-sdd status`, presents the result to the user in their language.
- `handoff.md`: Brief note that continuity is deterministic; handler lives in Pi.
- `settings.md`: Sync point for project settings injection.

**Synchronization**: `ein-cc/sync.ts`:
- `listClaudeCommands()` (line 529): reads `.md` files from `ein-cc/commands/ein/`, returns sorted list.
- Sync operation (lines 669, 705): writes each file to `${CLAUDE_CONFIG_DIR}/commands/ein/`.
- `${CLAUDE_CONFIG_DIR}` defaults to `~/.claude-ein` (can be overridden by `EIN_CC_HOME`).
- Idempotent: can re-run without state pollution.

**Test precedent**: `tests/claude-project-settings.test.ts:92–100` validates that every listed command exists as a valid `.md` file with frontmatter.

---

### 2. Pi Runtime Command Surface (`ein-pi`)

**Location**: Typically in `ein-pi/agent/extensions/` (e.g., `ein-ai.ts`, `ein-continuity.ts`).

**How commands are registered and dispatched**:
- Each command is registered via `pi.registerCommand("<name>", { description, handler })`.
- `handler` is an async function: `async (args: string, ctx: ExtensionContext) => Promise<void>`.
- Handler is **deterministic logic**, not a prompt injection. Example: `ein-continuity.ts:33–73` registers `ein:handoff` with a branching handler that manages continuity state.

**Prompt injection mechanism** (critical asymmetry):
- Pi provides `pi.sendUserMessage(prompt: string)` to allow a handler to inject a message/instruction into the session.
- Examples:
  - `ein-ai.ts`: calls `pi.sendUserMessage(result.prompt)` to inject SDD phase instructions.
  - `ein-doctor.ts`: uses `pi.sendUserMessage()` to send diagnostic output.
  - `ein-linear.ts`: sends crafted messages for Linear workflow steps.
  - `ein-skill-registry.ts`: injects skill info.
- This means a Pi handler **can** dynamically craft and inject a prompt, whereas Claude's `.md` instructions are static.

**Test precedent**: `tests/sdd-aliases.test.ts` verifies that `ein:sdd-audit`, `ein:sdd-check`, `ein:sdd-close`, and `ein:sdd-next` are registered with correct handlers.

---

### 3. Shared Skills Mechanism

**Location**: `ein-pi/core/skills/local/<name>/`

**Skill structure**:
- Each skill is a directory containing `SKILL.md`.
- Frontmatter (YAML):
  - `name`: skill identifier (hyphenated, matches directory name).
  - `description`: one-line summary.
  - `license`: "internal" or external license.
- Body: Markdown with practical instructions; read by both adapters as part of their injected context.

**Examples**:
- `comment-style/SKILL.md`: Code commenting guidelines.
- `logging-style/SKILL.md`: Event logging format rules.
- `architecture/SKILL.md`: System design principles.

**Distribution**:
- Skills live in the core repository.
- Both Pi and Claude adapters load them (likely via prompt injection or context loading at startup).
- No registration index observed yet; skills are discovered by directory traversal or explicitly named in agent configuration.

**Test precedent**: None found for skills loading/distribution symmetry; this is a gap to address in design.

---

### 4. Tests of Parity (Prior Art)

**Key test files**:

1. **`tests/sdd-aliases.test.ts`** (lines 16–49):
   - Scans `ein-pi/agent/extensions/ein-ai.ts` for `registerCommand()` invocations.
   - Verifies that canonical commands (`ein:sdd-audit`, `ein:sdd-close`, `ein:sdd-next`) are registered.
   - Checks that handlers match expected functions.
   - **Pattern**: Assert that Pi-side commands exist and are wired correctly.

2. **`tests/claude-project-settings.test.ts`** (lines 92–100):
   - Calls `listClaudeCommands()` to fetch `.md` files in `ein-cc/commands/ein/`.
   - Validates that every command has frontmatter (`---`) and proper structure.
   - **Pattern**: Assert that Claude-side commands exist and are valid.

3. **`tests/agent-tools-contract.test.ts`** (indirectly):
   - Cross-validates that Pi tools/commands match what Claude delegates to them.

**Design opportunity**: No test currently enforces that a command name (e.g., `/ein:intent`) exists in **both** runtimes with aligned behavior. This is a gap that strict TDD will fill.

---

### 5. ein-scout Contract

**Location**: `ein-pi/agent/lib/scout-contract.ts`

**Invocation**: Subagent delegation via `pi.subagent({ agent: "ein-scout", ... })` or inclusion in a workflow script.

**Output contract**:
- Type: `ScoutFanout` with `version: "ein-scout-fanout/v1"`.
- Payload: JSON with `branches: [{ task, report }]` and `dropped: string[]`.
- Report schema: `{ version, summary, summaryReferenceIds, findings, references, uncertainties }`.
- References: `{ id, path, startLine, endLine, supports }` — concrete citations in the codebase.

**Constraints**:
- `SCOUT_REPORT_MAX_BYTES = 16_384`: Output is capped at 16 KB.
- `OFF_CONTRACT_LIMIT = 2`: Two off-contract failures in one turn disable the scout for that turn.
- `MAX_FANOUT_BRANCHES = 3`: A scout can fan out to at most 3 parallel branches.

**Validation** (two levels):
- **Internal coherence** (strict): Schema, unique IDs, no orphaned references.
- **Disk citations** (tolerant): References are validated against actual files; marginal errors (line number slightly off) are trimmed; fatal errors (wrong file) discard the finding but don't reject the whole report.

**Dispatch**: Intent's `/ein:intent` command will call `pi.subagent()` to delegate fact-finding to ein-scout without blocking the next round of questions.

**Test precedent**: `tests/readonly-scout-contract.test.ts`.

---

### 6. Preflight: Location, Form, and Future Gates

**Current structure**:
- File: `openspec/changes/<change>/preflight.json`.
- Form (example from `add-intent-channel`):
  ```json
  {
    "tdd": "strict",
    "decidedBy": "claude",
    "decidedAt": "2026-08-28T08:39:03.262Z"
  }
  ```
- **Decision scope**: One preflight per change; **not** per phase.
- **Questions** (currently):
  - `tdd`: "strict" (all tasks under TDD gate) or "off" (UI/visual work, no TDD).
  - `lane`: "standard" (7 phases) or "micro" (skips map/tasks, keeps verify/close as gates).

**Management**:
- Read/write via `ein-pi/agent/lib/sdd-preflight-record.ts`:
  - `readPreflightRecord(changeDir)`: loads preflight.json if it exists.
  - `readChangeStance(cwd, change)`: retrieves both tdd + lane.
  - `writePreflightRecord(changeDir, stance)`: persists the answers.
- Pi decision point: `ein-pi/agent/extensions/ein-ai.ts` (via `createEinAiExtension`), where the session's first SDD phase invocation checks/prompts.
- Claude decision point: Same `preflight.json`, read by the coordinator, no re-asking if already recorded.

**Persistence contract**:
- Once written, a preflight is never re-asked in the same change (even if the session ends and restarts).
- The recorded stance is canonical; no override without user/coordinator instruction.

**Future gate (work beyond this change, noted for map only)**:
- Intent channel will add a **third axis**: auto-launch the intent session on change activation (vs. requiring `/ein:intent` command).
- Location: Same `preflight.json`, new key (e.g., `"intentChannel": true|false`).
- **Micro lane tie-in**: Lane `micro` will skip `map` and `tasks`; a future preflight could auto-set `intentChannel: false` for micro (no intent session unless user asks).
- Files to watch:
  - `ein-pi/agent/lib/sdd-preflight.ts` (lines 1–100+): orchestrates TDD + lane questions and rendering.
  - `ein-pi/agent/lib/sdd-preflight-record.ts`: file I/O and persistence.
  - `ein-pi/agent/extensions/ein-ai.ts`: where the questions are asked (search for `SddChangeStanceAnswers`).
  - Test coverage: `tests/sdd-preflight-*.test.ts`.

---

## Design-Phase Decisions Deferred

### Asymmetry: Prompt Injection in Pi vs. Static Instructions in Claude

**Finding**: Pi handlers can call `pi.sendUserMessage(prompt)` to inject dynamic prompts into the session. Claude has no equivalent in the `.md` command infrastructure—commands are static instructions.

**Impact on `/ein:intent`**:
- Pi side can craft a prompt-based decision tree dynamically, using `pi.sendUserMessage()` after each user response.
- Claude side must either (a) execute inline prompt generation (less ideal), (b) delegate to a skill (not yet specified), or (c) use the `.md` file to guide the model in a single round (limits interactivity).

**Not resolved in MAP phase**. Design must decide:
1. Do both runtimes share identical observable behavior (same questions, same order)?
2. Does `/ein:intent` exist as a command in both, or only Pi (with Claude delegating to Pi via handoff)?
3. If both exist, how does Claude's static `.md` handle multi-round branching?

---

## Ledger

```yaml
reads:
  - path: openspec/changes/add-intent-channel/scope.md
    lines: 61
    estimated_tokens: 1200
  - path: ein-cc/commands/ein/status.md
    lines: 18
    estimated_tokens: 200
  - path: ein-cc/commands/ein/handoff.md
    lines: 7
    estimated_tokens: 100
  - path: ein-cc/commands/ein/settings.md
    lines: ~30
    estimated_tokens: 300
  - path: ein-cc/sync.ts
    lines: 533-705 (partial)
    estimated_tokens: 2500
  - path: ein-pi/agent/extensions/ein-continuity.ts
    lines: 1-97
    estimated_tokens: 1500
  - path: ein-pi/core/skills/local/comment-style/SKILL.md
    lines: 1-80 (partial)
    estimated_tokens: 1000
  - path: tests/sdd-aliases.test.ts
    lines: 1-61
    estimated_tokens: 800
  - path: tests/claude-project-settings.test.ts
    lines: 1-100 (partial)
    estimated_tokens: 1200
  - path: ein-pi/agent/lib/scout-contract.ts
    lines: 1-100 (partial)
    estimated_tokens: 1500
  - path: openspec/changes/add-intent-channel/preflight.json
    lines: 6
    estimated_tokens: 50
  - path: ein-pi/agent/lib/sdd-preflight.ts
    lines: 1-100 (partial)
    estimated_tokens: 1500

webfetch_used: false
budget_consumed:
  tokens: 11950
  reads: 12
budget_source: effective-default
```

---

## Risks

1. **Prompt injection asymmetry**: Pi can dynamically inject prompts; Claude cannot (yet). Design must decide if `/ein:intent` runs identically in both or degrades in one.
2. **Skills distribution untested**: No test verifies that a skill declared in `ein-pi/core/skills/local/` reaches both Pi and Claude. This is a gap in parity verification.
3. **Preflight extensibility**: Adding a third axis (intent channel activation) requires touching `preflight.json` schema and all consuming code. Path is clear, but not yet validated.

---

## Next Recommended Phase

**`sdd-design`**: Resolve the prompt injection asymmetry and decide on `/ein:intent` / `/ein:eh` surface contract (single behavior or runtime-specific). Use this map as the ground truth for making that call.

