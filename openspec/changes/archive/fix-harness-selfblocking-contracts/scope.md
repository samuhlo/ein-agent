# Scope SDD: fix-harness-selfblocking-contracts

**Lane:** micro (skips `map` + `tasks`, keeps `design`/`apply`/`verify`/`close`)  
**TDD:** strict (ON)  
**Phase:** scope  
**Date scoped:** 2026-08-18

---

## Summary

El arnés SDD genera ciclos infinitos que bloquean entregas: el pasaje de participantes se autoinvalida al escribir checkpoints dentro del repo. 4 problemas encadenados y acotados (crítico, alto, medio, menor) con 4 capas de solución verificadas línea por línea.

---

## Problem Statement

### Problema 1: Sello del pasaje autoinvalidante (CRÍTICO — bloquea hoy)

**Localización verificada:**
- `ein-pi/agent/lib/project-state.ts:543` — calcula `stateRef` con `git status --untracked-files=all`
- `:577` — incluye en el hash el contenido de todo record con `worktreeStatus !== "."`
- `:439` — marca los untracked como `"?"`
- `ein-pi/agent/lib/continuity-checkpoint-store.ts:48` — escribe checkpoint en `openspec/changes/<change>/continuity.json` DENTRO del repo, sin ignorar
- `ein-pi/agent/lib/sdd-participants.ts:77` — captura `beforeStateRef: currentState` ANTES de publicar
- `:80` — publica el checkpoint (que Git ahora ve como untracked)
- `:122` — `admitSddParticipantCall` compara `state(cwd)` calculado DESPUÉS contra el guardado: nunca coinciden
- `:122` — responde "source state is stale" → `ein-cleaner` bloqueado, `sdd-verify` queda sin ejecutar

**Causa raíz:** El checkpoint se escribe dentro del repo pero no está ignorado. `git status` lo ve como untracked, el hash cambia, y el sello global se invalida.

**Evidencia de escape:** `tests/sdd-participants.test.ts:21` — el fixture escribe a mano `openspec/changes/*/continuity.json` en `.gitignore`; el producto nunca lo hace (`ein-pi/agent/lib/gitignore.ts:25` gestiona solo `.pi/ein/`, `.piagents/`, `.pi-subagents/`, `.codegraph/`).

---

### Problema 2: Scout paralelo rechazado DESPUÉS de ejecutarse (ALTO)

**Localización verificada:**
- `ein-pi/agent/assets/orchestrator.md:152` — autoriza "up to three distinct fresh scouts" en paralelo
- `ein-pi/agent/lib/scout-contract.ts:71` — fuerza `async: false` SOLO en forma `workflowScript`
- `:74` — forma directa NO lleva `async: false`
- `:38-51` — `unsupportedForm()` rechaza scouts paralelos DESPUÉS de ejecutarse (coste real: 3 delegaciones quemadas en una run)

**Causa raíz:** Contradicción prompt↔código. El rechazo llega tarde. `normalizeScoutLaunch` no valida en el LANZAMIENTO si ya hay un toolCallId pendiente en `tracking`.

---

### Problema 3: Contradicción prompt↔código en formato apply-progress (MEDIO)

**Localización verificada:**
- `ein-pi/agent/lib/sdd-participants.ts:31` (`changedScope`) — línea 34 parsea encabezado "files changed|changed files|archivos modificados|cambiados"
- `:37` — extrae paths entre backticks: `[...section.matchAll(/`([^`]+)`/g)]`
- `ein-pi/core/agents/sdd-apply.md:64` — prohíbe "never a dump of full file lists"

**Causa raíz:** El gate bloqueó y el padre tuvo que editar el artefacto a mano — un ciclo que reescribe artefactos del propio arnés (MANIFIESTO // 009.2). No existe especificación oficial del formato que `changedScope` parsea.

---

### Problema 4: Memory-receipts genera invalidación residual (MENOR)

**Localización verificada:**
- `ein-pi/agent/lib/sdd-memory-save.ts:134` — escribe `memory-receipts.jsonl` dentro de `changeDir` = `openspec/changes/<change>/`

**Causa raíz:** Otra fuente de invalidación del sello global, hermana del problema 1. Se cierra junto con el sello acotado.

---

## Authorized Scope (4 bounded layers, no alternatives proposed)

### Layer 1: gitignore.ts — registrar checkpoints

**File:** `ein-pi/agent/lib/gitignore.ts`

**Change:**
- Línea 25: Añadir `"openspec/changes/*/continuity.json"` a `ENTRIES`
- Línea 21: Corregir comentario de cabecera para incluir el patrón nuevo
- Test: `ensureEinGitignore()` cubrirá la nueva entrada (test existente `tests/gitignore.test.ts`)
- Fixture repair: `tests/sdd-participants.test.ts:21` debe llamar a `ensureEinGitignore(cwd)` en vez de escribir la línea a mano

**Why:** Cierra la invalidación de checkpoints. Git ignore deja de verlos untracked.

---

### Layer 2: Scoped state sealing — sello acotado al changeset, no al árbol

**File:** `ein-pi/agent/lib/sdd-participants.ts`

**Change:**
- Función `changedScope()` (línea 27) YA inspecciona paths acotados con `dev/ino/mode`
- Reemplazar `beforeStateRef: currentState` (línea 77) con sello del scope acotado, igual al `applyId` pero para el state pre-checkpoint
- Cambiar línea 122: comparar el sello acotado en vez del global
- Elimina problema 4 como efecto secundario (memory-receipts ahora dentro de scope acotado)

**Why:** Sello inmune al árbol global; solo rompe si el changeset concreto cambió.

---

### Layer 3: Scout contract — rechazar en el lanzamiento, no después de ejecutar

**Files:** `ein-pi/agent/lib/scout-contract.ts`, `ein-pi/agent/assets/orchestrator.md`

**Change:**
- `orchestrator.md:152` — SUSTITUIR (no añadir prosa — presupuesto, MANIFIESTO // 004) por: "Scouts run sequentially, one per turn; `normalizeScoutLaunch` fails at launch if a toolCallId is already pending in `tracking`"
- `scout-contract.ts:71-74` — Forzar `async: false` TAMBIÉN en forma directa (línea 74)
- Validar en `normalizeScoutLaunch()` — si `tracking` ya contiene una entrada sin cerrar para ese sessionKey, fallar el LANZAMIENTO con mensaje claro
- Documentar la condición de retiro del guardarraíl: "When scouts have measurable queueing cost in practice, revisit parallelism"

**Why:** Falla rápido, sin quemar delegaciones. Prompt y código alineados.

---

### Layer 4: apply-progress grammar — especificar el formato exacto que parsea changedScope

**Files:** `ein-pi/core/agents/sdd-apply.md`, `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md`

**Change:**
- `sdd-apply.md:64` — Añadir excepción explícita y acotada: "The `## Files changed` section is required for SDD participant admission. List each file path (relative, `/` separator, canonical) wrapped in backticks: `` `path/to/file.ts` ``"
- `SDD_ARTIFACT_GRAMMAR.md` — Documentar el parsing exacto que hace `changedScope()` (líneas 27-59)

**Why:** No derivar el scope desde git (descartado para este cambio). Fijar la especificación como excepción documentada a la regla "compact".

---

## Out of Scope

- Tocar el `stateRef` global de `project-state.ts` para que mienta a otros consumidores
- Derivar el scope desde `git diff` (arquitectura diferente)
- Cerrar el cambio `update-astro-documentation` (va aparte, run en Pi)

---

## Spec delta routing

El cambio altera comportamiento observable en dos dominios canónicos distintos, así que el delta va estructurado y repartido:

- `specs/sdd-lifecycle/spec.md` — sello del pasaje acotado al scope declarado (capas 1, 2 y 4: seal `sdd-scope-v1:`, aceptación de sellos legacy, evidencia de participantes que sobrevive al refresh, checkpoint fuera del `git status`, gramática de `## Files changed`).
- `specs/scout-routing/spec.md` — contrato de lanzamiento del scout (capa 3: rechazo en el lanzamiento, foreground forzado en la forma directa, fan-out secuencial en el prompt).

No se fusionan en un único dominio porque `readonly-scout-remains-outside-sdd-lifecycle` (spec canónico `scout-routing`) prohíbe expresamente meter maquinaria de scout en el ciclo SDD. Por llevar delta estructurado, este documento no lleva —intencionadamente— ninguna declaración `spec_delta: none`.

---

## Testing Capabilities (verified in this session)

### Unit Tests
- **Command:** `bun test`
- **Framework:** Bun v1.3.14
- **Evidence:**
  - `tests/gitignore.test.ts`: 7/7 passing
  - Full suite: 94 test files detected, smoke run confirms execution
- **Applicable:** All 4 layers have test fixtures or can use existing ones

### Typecheck
- **Command:** `cd installer && bun run typecheck`
- **Tool:** TypeScript 5.9.3, strict mode enabled
- **Evidence:** No errors in current run (2026-08-18)
- **Applicable:** TypeScript sources across all layers

### Integration Test Hooks
- `tests/sdd-participants.test.ts` — fixture repair + new layer 2 behavior
- `tests/gitignore.test.ts` — coverage of `gitignoreBlock()` with new entry

---

## Budget Packet

```yaml
scope: |
  Fix 4 enchaîned harness self-blocking bugs in SDD participant sealing,
  scout launch contract, and apply-progress grammar. Micro lane (4 bounded
  code layers + test fixtures), strict TDD.

budget_allocated:
  max_tokens: 15000        # normal change baseline
  max_reads: 30            # file inventory + verification already done
  max_runtime_ms: 90000    # Bun test + typecheck + git operations
```

---

## References

**Verified line-by-line:**
- `ein-pi/agent/lib/project-state.ts:439, 543, 577`
- `ein-pi/agent/lib/continuity-checkpoint-store.ts:48`
- `ein-pi/agent/lib/sdd-participants.ts:27-59, 77, 80, 122`
- `ein-pi/agent/lib/gitignore.ts:21, 25`
- `ein-pi/agent/lib/scout-contract.ts:38-51, 71, 74`
- `ein-pi/agent/lib/sdd-memory-save.ts:134`
- `ein-pi/agent/assets/orchestrator.md:152`
- `ein-pi/core/agents/sdd-apply.md:64`
- `tests/sdd-participants.test.ts:21`
- `tests/gitignore.test.ts:7 passing`

**Authority:** MANIFIESTO.md (product contract)
