---
change: add-intent-channel
phase: verify
---

# Verify Report: Intent Channel (`/ein:intent`, `/ein:eh`)

status: pass
behavior_coverage: partial

---

## Executive Summary

All 17 design requirements (R1–R17) remain structurally verified and tested. Code is type-safe, tests are green (2816 pass, 0 fail; +9 new tests for post-apply correction), and both surfaces (Pi and Claude) correctly reference the shared skill without duplicating its protocol. Post-apply correction to argument handling is verified: `buildIntentKickoff()` now accepts a request and incorporates it; Pi handler passes args; Claude `.md` understands arguments as initial request. Observable behavior (R11, R12, R13 behavioral half) remains unconfirmed in this session: a manual live session is required.

---

## Changes Since Previous Verify Report

A post-apply correction fixed a defect found in a live Pi session:

### Defect

`/ein:intent` was discarding user arguments. The Pi handler was `async (_args, ctx)` — ignoring `args` — and `buildIntentKickoff()` had no parameter, so the command always started cold and wasted the first round asking "what do you want?" regardless of input. Additionally, SKILL.md did not define the cold-start protocol, and the model improvised, offering template-placeholder options (`[like this]`) that broke the promise of one-round delivery.

### Correction

Files modified:
- `ein-pi/agent/lib/intent-channel.ts`: `buildIntentKickoff()` signature changed from `buildIntentKickoff(): KickoffMessage` to `buildIntentKickoff(peticion?: string): KickoffMessage`. Trims input, incorporates non-empty strings as the request root, declares explicit cold-start when absent.
- `ein-pi/agent/extensions/ein-intent.ts`: `/ein:intent` handler now passes args: `buildIntentKickoff(args)` (line 40).
- `ein-pi/core/skills/local/intent-channel/SKILL.md`: Added two subsections under "Ronda 1":
  - "Arranque en frío" (lines 30–33): Defines cold-start behavior for requests without an initial prompt.
  - "Forma de las opciones" (lines 34–37): Clarifies that options are concrete, pre-written responses, never placeholder templates.
- `ein-cc/commands/ein/intent.md`: Reworded to avoid repeating reserved vocabulary; now simply states "Si el usuario pasó argumentos, entiéndelos como la petición inicial" (line 11).
- `tests/intent-channel.test.ts`: Added 3 new test cases validating correct behavior:
  - "con peticion, el texto la incluye como raiz del arbol" (line 106–109): Request incorporated into kickoff text.
  - "sin peticion, el texto declara arranque en frío explicito" (line 111–114): Cold-start declaration present.
  - "una peticion vacia o solo-espacios se trata como ausente" (line 116–121): Whitespace-only input treated as absent.

---

## Verification of Correction

### TDD Cycle Evidence (Post-Apply Continuation)

| Seam | RED | GREEN | Command Final |
|---|---|---|---|
| `buildIntentKickoff` includes request as root when provided | 3 tests initially fail against builder without parameter | Parameter `peticion?: string`, `trim()` normalizes empty/spaces to absent | `bun test tests/intent-channel.test.ts` → 15 pass |
| `/ein:intent` with vs. without request does not collide with no-restatement (R1) | First attempt in `intent.md` used "árbol de decisiones" and broke parity test | Rewritten without reserved vocabulary | `bun test tests/intent-channel-parity.test.ts` → 8 pass |

### Requirement Verification (Corrected Changes)

**R1 — One definition of the protocol [contract]**
- ✓ SKILL.md now contains cold-start and option-form definitions (lines 30–37) unique to the skill.
- ✓ `intent.md` does not restate these; it only references the skill and notes argument interpretation.
- ✓ Parity test suite confirms no vocabulary duplication: `bun test tests/intent-channel-parity.test.ts` → 8 pass.

**R3 — Both surfaces resolve to the same skill [parity]**
- ✓ Both Pi and Claude reference SKILL.md at their respective deployed paths.
- ✓ Skill identity resolves correctly; no collision with other local skills.
- ✓ Same test suite confirms: 8 pass.

**R4 — Zero fixed prompt cost [contract]**
- ✓ Grep across `ein-pi/core/AGENTS.md`, `ein-cc/CLAUDE.adapter.md`, `assets/orchestrator.md`, and generated `ein-cc/CLAUDE.md`: zero matches for `intent-channel`.
- ✓ Style contract tests unchanged (fixed list remains `["comment-style", "logging-style"]`).
- ✓ `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts` → 10 pass.

**Argument Handling (Correction-Specific)**
- ✓ `buildIntentKickoff(peticion?: string)` accepts optional request; `trim()` normalizes empty/spaces to absence.
- ✓ Pi handler passes args: `buildIntentKickoff(args)`.
- ✓ `/ein:eh` continues without args (correct: operates on last message only).
- ✓ Claude `.md` instructs: interpret arguments as initial request.
- ✓ Test coverage: 3 new tests validate all three cases (with request, without request, empty/spaces).

---

## Test Evidence Summary

| Test File | Count | Status | Change |
|---|---|---|---|
| `tests/intent-channel.test.ts` | 15 | PASS | +3 new (correction) |
| `tests/intent-channel-parity.test.ts` | 8 | PASS | unchanged |
| `tests/style-contract.test.ts` | 5 | PASS | unchanged |
| `tests/style-parity-claude.test.ts` | 5 | PASS | unchanged |
| `tests/sdd-router.test.ts` | 56 | PASS | unchanged |
| Full suite (`bun test`) | 2816 | PASS | +9 new (post-apply total) |
| Typecheck (root) | — | CLEAN | — |
| Typecheck (installer) | — | CLEAN | — |

### TDD Cycle Evidence (Original Groups 001–005, Groups 006–007)

Per apply-progress.md, groups 001–005 follow RED → GREEN → TRIANGULATE → REFACTOR; groups 006–007 are verification assertions. All evidence remains valid; see apply-progress.md for full table.

---

## Verification Commands (Exact)

| Check | Command | Result |
|---|---|---|
| Intent-channel unit tests | `bun test tests/intent-channel.test.ts` | 15 pass |
| Parity tests | `bun test tests/intent-channel-parity.test.ts` | 8 pass |
| Zero prompt cost | `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts` | 10 pass |
| Router unchanged | `bun test tests/sdd-router.test.ts` | 56 pass |
| Full suite | `bun test` | 2816 pass |
| Typecheck (root) | `bun run typecheck` | clean |
| Typecheck (installer) | `cd installer && bun run typecheck` | clean |

All executed and green in current session.

---

## Requirement Coverage (All 17 Requirements)

### R1 — One definition of the protocol [contract]
**Status: VERIFIED** (reconfirmed post-correction)

- `ein-pi/core/skills/local/intent-channel/SKILL.md` is the single source of truth.
- New subsections (cold-start, option form) live only in SKILL.md, not in surface files.
- Parity test confirms no restatement of reserved vocabulary in `intent.md` or `ein-intent.ts`.

### R2 — Both commands in both runtimes [parity]
**Status: VERIFIED** (unchanged)

- Pi: Two `registerCommand` calls in `ein-intent.ts`; typecheck confirms `pi.sendUserMessage` signature match.
- Claude: Both `intent.md` and `eh.md` present with valid YAML frontmatter.

### R3 — Both surfaces resolve to the same skill [parity]
**Status: VERIFIED** (unchanged)

- Path resolution verified; skill name consistent across both runtimes.

### R4 — Zero fixed prompt cost [contract]
**Status: VERIFIED** (reconfirmed)

- No mention in coordinator files or agent configuration.

### R5 — User-invoked only [contract]
**Status: VERIFIED** (unchanged)

- SKILL.md § "Activación" declares exclusive user invocation; no agent prompt instructs these commands.

### R6 — Not a phase, not a gate [unit]
**Status: VERIFIED** (unchanged)

- Router test confirms phase transitions are identical with/without `intent.md` present.

### R7 — Optional by construction [contract]
**Status: VERIFIED** (unchanged)

- Standard lane requires neither command file.

### R8 — Nothing on disk before confirmation [unit + manual]
**Status: VERIFIED (structural), UNCONFIRMED (manual)**

- Builders return text only; no file I/O.
- Manual: Abandoned session must leave no files (requires live transcript).

### R9 — Safe artefact path [unit]
**Status: VERIFIED** (unchanged)

- `resolveIntentPath()` validates with `isSafeChangeName()`.

### R10 — Artefact shape [contract]
**Status: VERIFIED** (unchanged)

- SKILL.md defines frontmatter and section template.

### R11 — Rounds over frontier [manual]
**Status: UNCONFIRMED** (behavioral requirement)

- Structural: frontier protocol defined in SKILL.md; section addressability verified by tests.
- Observable: Round 1 composition (prerequisite-free only, numbered with recommendations, plain-text answerable as `"1A, 2B"`) requires live session transcript.

### R12 — Facts are found, decisions are asked [manual]
**Status: UNCONFIRMED** (behavioral requirement)

- Structural: SKILL.md rule documented; scout delegation named.
- Observable: Scout facts arriving with round 2 without delaying round 1 requires live session.

### R13 — `/ein:eh` restates, no action [contract + manual]
**Status: VERIFIED (structural), UNCONFIRMED (behavioral)**

- Structural: `eh.md` declares `allowed-tools: ""` (empty). SKILL.md § "/ein:eh" defines restatement-only contract.
- Manual (behavioral): Live run must produce plain-language restatement with no tool calls.

### R14 — Busy guard and installer visibility [contract]
**Status: VERIFIED** (unchanged)

- `ein-intent.ts` handler calls `guardIdleAndInject()`; manifest entry present.

### R15 — Attribution, out of the prompt [contract]
**Status: VERIFIED** (unchanged)

- SKILL.md attribution line present; absent from coordinator files.

### R16 — Language boundary [contract]
**Status: VERIFIED** (unchanged)

- Spanish vocabulary ("árbol de decisiones", "frontera", "ronda") in protocol files; English identifiers in code.

### R17 — First round addressable [contract]
**Status: VERIFIED** (unchanged)

- SKILL.md contains `### Ronda 1 (first round)` sub-section.

---

## Behavior Coverage Assessment

The change introduces two new user-facing commands with protocol-driven behavior. Coverage is stratified:

- **Structural coverage: VERIFIED** — Tests confirm file presence, YAML validity, section ordering, vocabulary keywords, path resolution, tool allowlist, and correct argument handling in builders and handlers.

- **Argument handling coverage: VERIFIED** — Three new unit tests confirm:
  - Requests are incorporated into kickoff text when provided.
  - Cold-start is declared explicitly when no request is given.
  - Empty or whitespace-only requests are treated as absence.
  - Builder correctly normalizes input via `trim()`.

- **Observable behavior coverage: PARTIAL** — R11 (frontier logic), R12 (scout fact-finding non-blocking delivery), R13 (restatement-only behavior) remain unexercised in this session. They require a live transcript. One live Pi session without initial request has been conducted (prior verify phase), confirming round delivery works; live session *with* initial request and `/ein:eh` invocation not yet executed.

**Gap precision**: Test coverage verifies the *implementation* of argument handling (code paths for request incorporation, cold-start declaration, normalization). Observable behavior (whether a real user issuing `/ein:intent "fix bug X"` receives a round 1 already modeling that request, and whether scout facts appear in round 2 without blocking round 1) requires live transcript evidence.

---

## Observations

### Previous Observation (Commit `db36b72`)

During `sdd-scope`, an unauthorized local commit was created. This is noted for process review; code is correct and delivery is unaffected.

### Post-Apply Correction Impact

The correction directly addresses a discovered defect and is validated by:
1. Three new, focused unit tests (RED → GREEN cycle).
2. Parity test suite (reconfirmed green, ensuring no vocabulary restatement).
3. Full test suite (2816 pass, no regressions).
4. Typecheck (root and installer clean).

The correction does not alter the structural contract (R1–R7, R9–R10, R14–R17) nor the zero-cost guarantee (R4). It refines the observable behavior (argument incorporation) within the bounds of the protocol already defined in SKILL.md.

---

## Next Recommended

1. **For rollout**: Structural and code verification is complete; delivery is safe.
2. **For full behavioral confirmation**: Perform manual verification transcript (one `/ein:intent "concrete request"` session + one `/ein:eh` invocation) if complete behavioral sign-off before production deployment is required. This would fully close R11, R12, and R13's behavioral half.

---

## Verification Details

### Post-Apply Correction: Argument Handling

**Builder change (ein-pi/agent/lib/intent-channel.ts)**:
```typescript
// Before: export function buildIntentKickoff(): KickoffMessage
// After:  export function buildIntentKickoff(peticion?: string): KickoffMessage

export function buildIntentKickoff(peticion?: string): KickoffMessage {
    const trimmed = peticion?.trim();
    const base = `Ejecuta el protocolo...`;
    if (!trimmed) {
        return {
            text: `${base} No hay petición inicial: arranque en frío -- la ronda 1 es una sola pregunta abierta...`,
        };
    }
    return {
        text: `${base} Petición inicial del usuario, raíz del árbol: "${trimmed}".`,
    };
}
```

**Pi handler change (ein-pi/agent/extensions/ein-intent.ts)**:
```typescript
// Before: buildIntentKickoff()
// After:  buildIntentKickoff(args)

handler: async (args, ctx: ExtensionContext): Promise<void> => {
    guardIdleAndInject(pi, ctx, buildIntentKickoff(args));
},
```

**Claude command change (ein-cc/commands/ein/intent.md)**:
Now explicitly states (lines 11–13):
```
Si el usuario pasó argumentos, entiéndelos como la petición inicial y modela
la primera ronda sobre ella. Si no pasó nada, arranca en frío tal como
describe la skill.
```

**SKILL.md additions**:
- **Lines 30–33** ("Arranque en frío"): Explicitly defines cold-start for requests without initial prompt.
- **Lines 34–37** ("Forma de las opciones"): Clarifies options are concrete, never template-placeholders.

**Test additions (tests/intent-channel.test.ts)**:
- Line 106–109: Verifies request incorporation.
- Line 111–114: Verifies cold-start declaration.
- Line 116–121: Verifies empty/whitespace normalization.

### Unchanged (Verified from Original Report)

All other 17 requirements remain in their verified state. See original verify-report.md for full evidence tables and reasoning. This re-run confirms:

- All original tests still pass.
- No new regressions introduced.
- Typecheck remains clean.
- R4 (zero fixed prompt cost) reconfirmed via grep.

---

## Summary

**Status: PASS** — All structural requirements verified, all code tests green, corrected argument-handling logic validated by new unit tests and parity suite.

**Behavior Coverage: PARTIAL** — Structural and code-level verification complete; observable behavior (live session with request, scout integration, `/ein:eh` restatement) unconfirmed but protocol is sound and runtime gates are in place.

**Safe for delivery**: Yes. Correction addresses discovered defect, is validated by tests, and does not alter structural contract or configuration cost.
