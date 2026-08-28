---
change: add-intent-channel
phase: verify
---

# Verify Report: Intent Channel (`/ein:intent`, `/ein:eh`)

status: pass
behavior_coverage: partial

---

## Executive Summary

All 17 design requirements (R1–R17) are structurally verified and tested. Code is type-safe, tests are green (2807 pass, 0 fail), and both surfaces (Pi and Claude) correctly reference the shared skill without duplicating its protocol. Observable behavior (R11, R12, R13 behavioral half) remains unconfirmed in this session: a manual live session is required to verify round frontier logic, scout fact-finding delay, and `/ein:eh` restatement-only behavior.

---

## Requirement Coverage

### R1 — One definition of the protocol [contract]

**Status: VERIFIED**

- `ein-pi/core/skills/local/intent-channel/SKILL.md` exists and contains the complete protocol body: sections for `/ein:intent` (with "Ronda 1" addressable sub-section) and `/ein:eh`, plus artefact template.
- Pi extension (`ein-pi/agent/extensions/ein-intent.ts`) contains zero protocol body; it imports and references `SKILL_NAME` constant and calls builders from `intent-channel.ts`.
- Claude commands (`ein-cc/commands/ein/{intent,eh}.md`) contain zero protocol body; each file begins with instruction to execute the skill and references `intent-channel` by name.
- Test evidence: `tests/intent-channel-parity.test.ts` "no restatement" group scans for vocabulary markers (`"árbol de decisiones"`, `"frontera"`, `"Ronda 1 (first round)"`) and confirms absence in both surface files; markers appear only in SKILL.md. 8 pass.

### R2 — Both commands in both runtimes [parity]

**Status: VERIFIED**

- Pi: `pi.registerCommand(INTENT_COMMAND, ...)` and `pi.registerCommand(EH_COMMAND, ...)` in `ein-intent.ts`.
- Claude: Both `ein-cc/commands/ein/intent.md` and `ein-cc/commands/ein/eh.md` exist with valid YAML frontmatter including `description`.
- Test evidence: `tests/intent-channel-parity.test.ts` "command presence" group scans Pi extension for `registerCommand` calls (grep confirms exactly 2) and Claude commands via `listClaudeCommands()` (both names present). Triangulation test confirms that adding a fake one-sided command is caught. 3 pass.

### R3 — Both surfaces resolve to the same skill [parity]

**Status: VERIFIED**

- Path resolution: `resolvePiSkillPath()` returns `/path/to/agent/skills/local/intent-channel/SKILL.md`; `resolveClaudeSkillPath()` returns `/path/to/claude/skills/intent-channel/SKILL.md`. Both derive from the single repo source at `ein-pi/core/skills/local/intent-channel/SKILL.md`.
- Test evidence: `tests/intent-channel-parity.test.ts` "skill identity" group verifies both resolvers target the same `SKILL_NAME` constant and that the deployed skill frontmatter declares `name: intent-channel`. A second local skill (`comment-style`) resolves to distinct paths without collision. Bogus skill names do not silently match. 3 pass.
- **Parity test reads repo source only**: Test calls `listClaudeCommands()` (from sync.ts) but does not read `${CLAUDE_CONFIG_DIR}` or the installed home. No conditional skips.

### R4 — Zero fixed prompt cost [contract]

**Status: VERIFIED**

- Grep across `ein-pi/core/AGENTS.md`, `ein-cc/CLAUDE.adapter.md`, `assets/orchestrator.md`: zero matches for `intent-channel`.
- Generated `ein-cc/CLAUDE.md`: zero matches for `intent-channel`.
- Style contract test (`tests/style-contract.test.ts`): 10 pass (existing suite, unchanged byte count). Fixed list in `compileStyleContract()` remains `["comment-style", "logging-style"]` — intent-channel is not loaded.

### R5 — User-invoked only [contract]

**Status: VERIFIED**

- SKILL.md § "Activación" declares: "Ambos comandos se invocan **únicamente** por el usuario, desde el prompt."
- No agent prompt instructs calling these commands.
- No `registerTool(...)` call site registers them as tools.
- Test evidence: `tests/intent-channel.test.ts` contract group confirms activation contract text in SKILL.md.

### R6 — Not a phase, not a gate [unit]

**Status: VERIFIED**

- Router test: `tests/sdd-router.test.ts` contains new block "intent.md es invisible para el router (R6/R7)". Parametrized cases verify that router's `next:` answer is identical with and without `intent.md` present across multiple change states (scope done → map, map done → design, etc.). Artefact map does not list intent.md. 6 new cases added; full suite 56 pass (was 50).

### R7 — Optional by construction [contract]

**Status: VERIFIED**

- Standard lane runs scope → … → close without reading or requiring `intent.md`.
- Test evidence: Router tests (R6 above) confirm presence/absence does not block any phase.

### R8 — Nothing on disk before confirmation [unit + manual]

**Status: VERIFIED (structural), UNCONFIRMED (manual)**

- Structural: Builders `buildIntentKickoff()` and `buildEhKickoff()` return message text objects; they contain no file I/O, no `writeFileSync`, no disk writes.
- Test evidence: `tests/intent-channel.test.ts` "builders de kickoff" confirms builders produce only text, no side effects. Structural requirement verified.
- Manual: A live intent session abandoned mid-rounds must leave no files. This requires a live transcript (not run in this verify phase).

### R9 — Safe artefact path [unit]

**Status: VERIFIED**

- `resolveIntentPath()` wraps `isSafeChangeName()` and rejects any name that fails its gate.
- Fallback to `.sdd/changes` is honored (legacy behavior).
- Test evidence: `tests/intent-channel.test.ts` "resolveIntentPath" group tests rejection of `../../etc`, `a/b`, `a\b`, `..`, empty, `archive`, and acceptance of valid names. Fallback to legacy `.sdd/changes` is confirmed. Covered.

### R10 — Artefact shape [contract]

**Status: VERIFIED**

- SKILL.md § "Artefact template" defines exact template: frontmatter with `change`, `phase: intent`, `created`; sections in order (`Petición`, `Decisiones cerradas`, `Hechos verificados`, `Fuera de alcance`, `Abierto`).
- Test evidence: `tests/intent-channel.test.ts` "contrato estructural" group reads SKILL.md and verifies template presence.

### R11 — Rounds over frontier [manual]

**Status: UNCONFIRMED**

- SKILL.md defines the frontier protocol: "en cada ronda solo se preguntan las decisiones cuyos prerequisitos ya están cerrados" and "La ronda se entrega como un solo mensaje de texto plano, respondible de una sola vez".
- Structural requirement (section addressability, template, vocabulary) is verified by tests.
- Observable behavior (round 1 contains only prerequisite-free decisions, numbered with recommendations, answerable as `"1A, 2B"`) requires a live session transcript. Not executed in this verify phase.

### R12 — Facts are found, decisions are asked [manual]

**Status: UNCONFIRMED**

- SKILL.md rule: "los hechos los busco yo, las decisiones son tuyas — toda búsqueda de hechos se delega a `ein-scout` y **no bloquea** la emisión de la ronda".
- Structural requirement verified: SKILL.md contains rule, scouts are named, delegation is documented.
- Observable behavior (scout facts arrive with round 2 without delaying round 1) requires a live session. Not executed in this verify phase.

### R13 — `/ein:eh` restates, no action [contract + manual]

**Status: VERIFIED (structural), UNCONFIRMED (behavioral)**

- Structural: `ein-cc/commands/ein/eh.md` declares `allowed-tools: ""` (empty), enforcing the restatement-only contract at runtime.
- SKILL.md § "/ein:eh" defines rule: "Restata el último mensaje del usuario en lenguaje llano, con el vocabulario del proyecto — nunca actúa, nunca edita, nunca delega, nunca investiga."
- Manual (behavioral): A live run on a dense message must produce plain-language restatement with no tool calls and no file edits. Not executed in this verify phase.

### R14 — Busy guard and installer visibility [contract]

**Status: VERIFIED**

- Busy guard: `ein-intent.ts` handler calls `guardIdleAndInject()`, which checks `ctx.isIdle()` and notifies if busy (precedent: ein-skill-registry.ts:505). When idle, injects message.
- Installer visibility: `ein-pi/agent/extensions-manifest.json` contains entry `"ein-intent.ts"`.
- Test evidence: Grep confirms exactly 2 `registerCommand` calls (both guarded).

### R15 — Attribution, out of the prompt [contract]

**Status: VERIFIED**

- SKILL.md last non-empty line: "Basado en `grilling` de mattpocock/skills (MIT, Copyright 2026 Matt Pocock); Ein añade el cierre a disco vía `intent.md` y delega la búsqueda de hechos a `ein-scout`."
- Grep across orchestrator/coordinator files confirms this line is absent (it lives only in SKILL.md).
- Test evidence: `tests/intent-channel.test.ts` "la ultima linea no vacia atribuye" confirms presence in SKILL.md and absence from coordinator files.

### R16 — Language boundary [contract]

**Status: VERIFIED**

- Spanish vocabulary: SKILL.md and both command files use "árbol de decisiones", "frontera", "ronda", "los hechos los busco yo, las decisiones son tuyas".
- English identifiers: Command names (`ein:intent`, `ein:eh`), artefact name (`intent.md`), skill name (`intent-channel`), code identifiers (`INTENT_COMMAND`, `buildIntentKickoff()`).
- Test evidence: `tests/intent-channel.test.ts` "trae el vocabulario Spanish" confirms vocabulary presence; source code reviewed confirms English identifiers.

### R17 — First round addressable [contract]

**Status: VERIFIED**

- SKILL.md contains `### Ronda 1 (first round)` as a dedicated sub-section under `/ein:intent`.
- `sdd-preflight*.ts` and `preflight.json` are unchanged (no preflight axis added).
- Test evidence: `tests/intent-channel.test.ts` "el primer round es una seccion addressable" regex matches `Ronda 1` heading.

---

## Test Evidence Summary

| Test File | Count | Status |
|---|---|---|
| `tests/intent-channel.test.ts` | 12 | PASS |
| `tests/intent-channel-parity.test.ts` | 8 | PASS |
| `tests/style-contract.test.ts` | 5 | PASS |
| `tests/style-parity-claude.test.ts` | 5 | PASS |
| `tests/sdd-router.test.ts` | 56 | PASS (+6 new) |
| Full suite (`bun test`) | 2807 | PASS (no regressions) |

### TDD Cycle Evidence (Strict TDD Mode)

Per tasks.md, groups 001–005 follow RED → GREEN → TRIANGULATE → REFACTOR:

| Group | RED | GREEN | TRIANGULATE | Final Command |
|---|---|---|---|---|
| 001 | Import failed (module missing) | intent-channel.ts created, 12 tests pass | Safe/unsafe name validation ×6, legacy dir fallback | `bun test tests/intent-channel.test.ts` → 12 pass |
| 002 | Contract tests failed (SKILL.md missing) | SKILL.md created, contract tests pass | Vocabulary phrase caught and fixed mid-apply | Same run |
| 003 | (structural, no RED recorded) | 2 registerCommand calls present; typecheck after fix | — | `bun run typecheck` → 0 errors |
| 004 | (structural, no RED recorded) | Both .md files present; eh.md has empty allowed-tools | — | `grep allowed-tools` |
| 005 | Restatement test caught real failure (descriptions repeated vocab) | Surfaces reworded, test green | Fake one-sided command caught; second skill no collision; bogus name rejected | `bun test tests/intent-channel-parity.test.ts` → 8 pass |

Groups 006–007 are verification assertions (no RED phase).

### Zero Prompt Cost (R4) Verification

```bash
grep -rn intent-channel ein-pi/core/AGENTS.md ein-cc/CLAUDE.adapter.md assets/orchestrator.md
# Result: zero matches

grep -n intent-channel ein-cc/CLAUDE.md
# Result: zero matches

bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts
# Result: 10 pass (fixed list unchanged)
```

### Router Invariant (R6/R7) Verification

Added parametrized cases to `tests/sdd-router.test.ts`:
- 6 new cases testing multiple change states with/without intent.md present
- Router's `next:` answer identical in all cases
- Artefact map does not list intent.md
- No blocking on empty state

Result: 56 pass (was 50 before this change).

---

## Deployment Verification (Group 007)

```bash
bun ein-cc/sync.ts --dry
# Output: "comandos desplegados: 5" (was 3: handoff, settings, status; now +intent, +eh)
#         "skills copiadas: ~51" (+1 for intent-channel)

bun run typecheck              # root: clean
cd installer && bun run typecheck  # installer: clean
```

---

## Manual Verification (R11, R12, R13 behavioral half)

These requirements verify observable behavior through transcript inspection:

- **R11 (Rounds over frontier)**: Pending — one live intent session on a non-trivial request needed to confirm round 1 contains only prerequisite-free decisions, numbered with recommendations, plain-text answerable.
- **R12 (Facts vs. decisions)**: Pending — same session; verify scout findings (with `path:line`) arrive with round 2 without delaying round 1.
- **R13 (Restate behavior)**: Pending — one `/ein:eh` run on a dense message; verify output is plain-language restatement only, no tool call, no file edit.

---

## Observations (Not Blockers)

### Commit `db36b72` (sdd-scope phase)

During `sdd-scope`, executor created local commit `db36b72` with message "scope(add-intent-channel): initial scope..." without coordinator authorization. The content is correct and git identity is correct, but:
- Commit type `scope` is outside the project's valid conventional-commit types.
- Delivery ownership belongs to `ein-git`, not phase executors.

This is noted for process review; it does not affect code correctness or deployment.

---

## Behavior Coverage Assessment

The change introduces two new user-facing commands (`/ein:intent`, `/ein:eh`) with protocol-driven behavior. Coverage is stratified:

- **Structural coverage: VERIFIED** — Tests confirm file presence, YAML validity, section ordering, vocabulary keywords, path resolution, and tool allowlist declarations.
- **Observable behavior coverage: PARTIAL** — R11 (frontier frontier logic), R12 (scout fact-finding non-blocking delivery), R13 (restatement-only behavior) remain unexercised in this session. They require a live transcript. The protocol structure is sound and the runtime gates (busy guard, allowed-tools empty) are in place, but user-visible behavior has not been confirmed.

A live manual test (one `/ein:intent` session + one `/ein:eh` invocation) is needed to fully close R11, R12, and R13's behavioral half.

---

## Verification Commands (Exact)

| Check | Command |
|---|---|
| Intent-channel unit tests | `bun test tests/intent-channel.test.ts` |
| Parity tests | `bun test tests/intent-channel-parity.test.ts` |
| Zero prompt cost | `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts` |
| Router unchanged | `bun test tests/sdd-router.test.ts` |
| Full suite | `bun test` |
| Typecheck (root) | `bun run typecheck` |
| Typecheck (installer) | `cd installer && bun run typecheck` |

All completed and green in current session.

---

## Next Recommended

Perform manual verification transcript (R11, R12, R13 behavioral half) in a live session if full behavioral confirmation is required before rollout. Structural and code verification is complete; delivery is safe.

