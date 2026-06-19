# SDD Apply: ein-linear-known-ids-budget

## // 000. RESUMEN

Implementadas las 5 tareas del change `ein-linear-known-ids-budget`: limpieza de tools en `ein-linear.md`, reemplazo del stateId gate rígido por resolución pragmática, adición del Known Issue IDs Mode, y LINEAR OPERATION PACKET en `orchestrator.md`, más tests de contrato en `tests/ein-linear-budget.test.ts`.

---

## // 001. TAREA 1 — Tools en ein-linear.md

**Archivos tocados:**
- `ein-pi/agent/agents/ein-linear.md` (línea 4)
- `ein-pi/agent/assets/orchestrator.md` (línea 11)

**Qué cambió:**
- Frontmatter `tools:` reducido de 18 tools (incluyendo `bash`, `read`, `grep`, `glob`, `write`, `edit`, `linear_viewer`) a solo 12 `linear_*` tools
- Tabla Subagent Inventory en orchestrator.md actualizada para reflejar el nuevo conjunto

**Por qué:**
Un agente de Linear que tiene `bash` o file tools disponibles es un vector de riesgo innecesario. Las tools `linear_*` son el conjunto correcto para operaciones de board. La herramienta `linear_viewer` no existe en el MCP real y fue eliminada.

---

## // 002. TAREA 2 — Pragmatic state resolution

**Archivos tocados:**
- `ein-pi/agent/agents/ein-linear.md` (líneas 82-85, 94, 104)

**Qué cambió:**
- Hard Gate #6 (`stateId gate: never pass a state name`) reemplazado por `Pragmatic state resolution`
- Nueva lógica: intentar con nombre directamente → si falla por state-validation error, hacer lookup UUID → reintentar → si falla por otro motivo, stop con error exacto
- Metadata completeness actualizada para reflejar `name or UUID per tool schema`
- Recipe determinista actualizado: ya no hace `linear_get_team_states` por defecto antes de crear

**Por qué:**
La regla rígida contradecía el comportamiento real del MCP. Forzar UUID lookup antes de cada update añadía ~2 llamadas sin beneficio. El nuevo enfoque es fail-fast on real error, not on hypotheticals.

---

## // 003. TAREA 3 — Known Issue IDs Mode

**Archivos tocados:**
- `ein-pi/agent/agents/ein-linear.md` (nueva sección, líneas 22-56)

**Qué cambió:**
Nueva sección `## Known Issue IDs Mode (mandatory when exact IDs are present)` insertada después de `Scope & token budget`, con:
- Trigger automático por presencia de IDs exactos (`SAM-XXX`)
- Max 4 calls por issue + 2 overhead = `issues.length × 4 + 2` total
- Recipe: read-back → update → read-back → optional comment
- Forbidden: no discovery, no shell, no broad search, no curl/direct API

**Por qué:**
La limpieza de Linear con IDs exactos consumió ~400k tokens porque el agente hacía preflight completo antes de updates. Con IDs exactos, el agente debe poder operar directamente sin discovery.

---

## // 004. TAREA 4 — LINEAR OPERATION PACKET

**Archivos tocados:**
- `ein-pi/agent/assets/orchestrator.md` (nueva sección, líneas 125-159)

**Qué cambió:**
Nueva sección `## LINEAR OPERATION PACKET` insertada después de `Scope Gate Contract`, con:
- Formato textual que incluye `mode: known_ids`, `issues`, `protected`, `budget`, `constraints`
- Reglas de uso que activan Known Issue IDs Mode en ein-linear
- Diferenciación clara vs Scope Gate

**Por qué:**
El Plan Gate ya resuelve IDs antes de delegar, pero la información de modo no se empaquetaba. EI PACKET es un contrato textual que fuerza disciplina de hand-off.

---

## // 005. TAREA 5 — Tests

**Archivos tocados:**
- `tests/ein-linear-budget.test.ts` (nuevo archivo)

**Tests incluidos:**
1. ein-linear.md tools contract (3 tests): verifica que frontmatter no contiene `bash`, `read`, `grep`, `glob`, `write`, `edit` y solo tiene `linear_*`
2. ein-linear.md Known Issue IDs Mode contract (6 tests): verifica presencia de sección, max calls, overhead, prohibiciones
3. ein-linear.md pragmatic state resolution contract (4 tests): verifica ausencia de regla rígida UUID y presencia de fallback
4. orchestrator.md LINEAR OPERATION PACKET contract (5 tests): verifica presencia de PACKET, `mode: known_ids`, constraints

---

## // 006. DESVIACIONES

1. La sección "Forbidden" del Known Issue IDs Mode incluye `No \`curl\`, direct API, or env/token discovery for board updates` — requisito explícito del usuario para prohibir shell/API directa.

2. La tarea 1.3 de actualizar orchestrator.md se ejecutó junto con la Tarea 1, no como paso separado.

---

## // 007. RIESGOS

- **Riesgo bajo**: los cambios son additive y correctivos — no eliminan funcionalidad existente, solo restringen comportamiento problemático
- **Regresión en stateId**: si hay algún contexto donde el MCP realmente exige UUID y no acepta nombre, el nuevo enfoque con fallback lo cubre (reintenta con UUID si falla)
- **Tests nuevos**: los tests de contrato verifican patrones en los archivos .md como guardrails permanentes

---

## // 008. VERIFICACIÓN PENDIENTE

```bash
bun test tests/ein-linear-budget.test.ts
grep "^tools:" ein-pi/agent/agents/ein-linear.md
grep "Known Issue IDs Mode" ein-pi/agent/agents/ein-linear.md
grep "Pragmatic state" ein-pi/agent/agents/ein-linear.md
grep "LINEAR OPERATION PACKET" ein-pi/agent/assets/orchestrator.md
grep "mode: known_ids" ein-pi/agent/assets/orchestrator.md
```
