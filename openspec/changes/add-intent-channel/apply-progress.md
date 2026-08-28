---
change: add-intent-channel
phase: apply
---

status: complete

## Summary

All 7 groups implemented per tasks.md, in order (001 → 002 → {003,004} → 005 →
006 → 007). Purely additive except the one manifest line. No edits to any
forbidden file (`sync.ts`, `CLAUDE.md`, `CLAUDE.adapter.md`, `AGENTS.md`,
`orchestrator.md`, `style-contract.ts`, `~/.claude-ein/`, `~/.pi-ein/`).

## Files changed

`ein-pi/agent/lib/intent-channel.ts`
`ein-pi/core/skills/local/intent-channel/SKILL.md`
`ein-pi/agent/extensions/ein-intent.ts`
`ein-pi/agent/extensions-manifest.json`
`ein-cc/commands/ein/intent.md`
`ein-cc/commands/ein/eh.md`
`tests/intent-channel.test.ts`
`tests/intent-channel-parity.test.ts`
`tests/sdd-router.test.ts`

## TDD Cycle Evidence (groups 001, 002, 003/004, 005)

| Group | Behavior seam | RED | GREEN | TRIANGULATE | Final focused command |
|---|---|---|---|---|---|
| 001 | pure module exports resolve names/paths/builders | import of `intent-channel.ts` failed — module missing | module created, all unit assertions pass | safe/unsafe names ×6, legacy fallback dir, both skill-path resolvers | `bun test tests/intent-channel.test.ts` → 12 pass |
| 001/002 | SKILL.md structural contract (frontmatter, sections, vocab, attribution, first-round heading) | contract tests failed reading nonexistent SKILL.md | SKILL.md written, all 6 contract tests pass | initial miss on exact vocabulary phrase ("los hechos los busco yo...") caught and fixed | same run above |
| 003 | Pi registers both commands with busy guard | n/a (built directly per group order; grep gate below is the acceptance check) | `grep -c registerCommand` = 2; typecheck initially failed (`ctx.sendUserMessage` doesn't exist — it's `pi.sendUserMessage`), fixed | — | `bun run typecheck` → 0 errors |
| 004 | Claude command files declare frontmatter, `eh.md` empty `allowed-tools` | n/a (structural files, verified by grep) | both files present, `allowed-tools: ""` on eh.md | — | `grep 'intent-channel'`/`grep allowed-tools` |
| 005 | command presence parity | ran against already-built surfaces (order note sequences 005 after {003,004}); no RED observed for presence, but the "triangulation" test explicitly injects a fake one-sided command name and asserts the divergence is caught | 3 tests green | fake `ein:only-on-one-side` correctly detected as missing-on-Claude | `bun test tests/intent-channel-parity.test.ts` → 8 pass |
| 005 | skill identity resolves to same source, no collision, no silent bogus match | same as above | 3 tests green | second local skill (`comment-style`) resolves to a distinct, non-colliding pair; bogus name doesn't match | same run |
| 005 | no protocol restatement in surfaces | initial RED: descriptions in `intent.md`/`ein-intent.ts` accidentally repeated "árbol de decisiones" / "frontera" — real failure, fixed by rewording | 2 tests green after rewording | — | same run |

Groups 006 and 007 are verification groups per the tasks.md note: no RED to
record, only assertions against unchanged behavior.

## Group 006 — zero-cost / router-unchanged verification

- R4 (zero fixed prompt cost): `grep -rn intent-channel` across `ein-pi/core/AGENTS.md`,
  `ein-cc/CLAUDE.adapter.md`, generated `ein-cc/CLAUDE.md`, `assets/orchestrator.md`
  → zero matches. `bun test tests/style-contract.test.ts tests/style-parity-claude.test.ts`
  → 10 pass (fixed list unchanged).
- R6/R7 (router untouched by intent.md, phase optional): added a new
  `describe("intent.md es invisible para el router (R6/R7)")` block to the
  existing `tests/sdd-router.test.ts` (no separate `sdd-router-audit.test.ts`
  exists in this repo, so the case landed in the one router suite that does).
  4 parametrized states × with/without `intent.md`, plus an artifact-map
  absence check and a no-block check on empty state.
  `bun test tests/sdd-router.test.ts` → 56 pass (was 50; +6 new cases).

## Group 007 — integration checks

- `bun ein-cc/sync.ts --dry` → `comandos desplegados: 5` (was 3: handoff,
  settings, status; now +intent,+eh) and `skills copiadas: ~51` (+1 for
  `intent-channel`). Note: sync's dry-run log doesn't print individual
  filenames (only counts), so the task's literal
  `grep -E '(intent|eh|SKILL)'` matched nothing on stdout; the deployment
  claim is verified instead via the count delta, since editing sync.ts's
  logging was out of scope.
- `bun run typecheck` (root) → clean, after fixing `ctx.sendUserMessage` →
  `pi.sendUserMessage` (the only real type error found in this apply).
- `cd installer && bun run typecheck` → clean.
- `bun test` (full suite) → 2807 pass, 0 fail, 202 files.

## Deviations from design

- None beyond the wording adjustments in group 005's TRIANGULATE step
  (removing two vocabulary phrases from the Claude/Pi surface files so R1's
  no-restatement test passes honestly).

## Manual verification (R11–R13)

Not performed in apply — explicitly deferred to `sdd-verify`/`verify-report.md`
per the tasks.md manual-verification section; these require a live transcript,
which this phase does not run.

## Remaining tasks

None. All 17 checkboxes in `tasks.md` are ticked.

## Continuación — fix: `/ein:intent` descartaba la petición

status: complete

Bug encontrado probando el comando en vivo: `buildIntentKickoff()` no
aceptaba argumento y el handler Pi ignoraba `args`, así que `/ein:intent` y
`/ein:intent <texto>` inyectaban el mismo texto fijo — siempre arranque en
frío. Además el SKILL.md no definía ese arranque en frío ni prohibía
plantillas con huecos entre corchetes como "opción".

### TDD Cycle Evidence

| Seam | RED | GREEN | Comando final |
|---|---|---|---|
| `buildIntentKickoff` incluye la petición como raíz cuando llega | 3 tests nuevos fallan contra el builder sin parámetro | parámetro opcional `peticion?: string`, `trim()` normaliza vacío/espacios a ausente | `bun test tests/intent-channel.test.ts` → 15 pass |
| `/ein:intent` con petición vs sin ella no colisiona con no-restatement (R1) | primer intento en `intent.md` usó "árbol de decisiones" y rompió `intent-channel-parity.test.ts` | reescrito sin vocabulario reservado | `bun test tests/intent-channel.test.ts tests/intent-channel-parity.test.ts` → 23 pass |

### Files changed (continuación)

`ein-pi/agent/lib/intent-channel.ts`
`ein-pi/agent/extensions/ein-intent.ts`
`ein-pi/core/skills/local/intent-channel/SKILL.md`
`ein-cc/commands/ein/intent.md`
`tests/intent-channel.test.ts`

### Verificación

- `bun test` (completo) → 2816 pass, 0 fail, 202 files.
- `bun run typecheck` (raíz) → limpio.
- `cd installer && bun run typecheck` → limpio.
- `buildEhKickoff` sin cambios (opera sobre el último mensaje, no petición).

## Continuación — fix: SKILL.md sin sección de ejecución (herramientas)

status: complete

Bug encontrado en una sesión real de `/ein:intent`: el SKILL.md describe el
protocolo de conversación pero no dice con qué herramientas se ejecuta. El
coordinador improvisó y exploró directo en su propio contexto (`codegraph
explore`, `read` repetido, un `bun -e` que reimplementaba `isSafeChangeName`
en vez de usar `resolveIntentPath`), pese a que la regla "los hechos los
busco yo, las decisiones son tuyas" ya exigía delegar en `ein-scout`. Se
añadió una sección `## Ejecución` corta (3 reglas, redacción neutral de
runtime) antes de `## Activación`: delegar siempre hallazgos de repo en
`ein-scout`, usar solo `resolveIntentPath` para nombre/ruta del artefacto
(prohibido reimplementar `isSafeChangeName` inline), y no salir a shell para
datos que el entorno ya da (timestamp incluido).

### TDD Cycle Evidence

| Seam | RED | GREEN | Comando final |
|---|---|---|---|
| SKILL.md declara la sección `## Ejecución` con las tres reglas de herramientas | test nuevo contra el SKILL.md sin la sección falla (`## Ejecución` ausente) | sección añadida antes de `## Activación`; se verifica presencia de `ein-scout`, `resolveIntentPath` y "shell", no prosa exacta | `bun test tests/intent-channel.test.ts` → 16 pass |

### Files changed (continuación 2)

`ein-pi/core/skills/local/intent-channel/SKILL.md`
`tests/intent-channel.test.ts`

### Verificación

- `bun test tests/intent-channel.test.ts tests/intent-channel-parity.test.ts` → 24 pass (paridad confirma que ningún vocabulario reservado se filtró a otra superficie).
- `bun test` (completo) → 2817 pass, 0 fail, 202 files.
- `bun run typecheck` (raíz) → limpio.
- `cd installer && bun run typecheck` → limpio.
- No se tocó `intent-channel.ts`, ni ficheros Claude, ni `fix-overlay-repaint-recovery`.
