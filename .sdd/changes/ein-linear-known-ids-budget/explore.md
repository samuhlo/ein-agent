# SDD Explore: ein-linear-known-ids-budget

## // 000. RESUMEN

Exploración del cambio `ein-linear-known-ids-budget`: endurecer `ein-linear.md` (herramientas, stateId gate, Known Issue IDs Mode) y `orchestrator.md` (LINEAR OPERATION PACKET), más tests de contrato. El objetivo es reducir el consumo de tokens en operaciones de board con IDs conocidos de ~400k a un máximo de ~4 llamadas por issue.

---

## // 001. HALLAZGOS

### 1.1 `ein-linear.md` — Frontmatter tools

**Línea 4 del archivo:**
```yaml
tools: read, grep, glob, write, edit, bash, linear_viewer, linear_list_projects, linear_list_issues, linear_create_issue, linear_update_issue, linear_search_issues, linear_create_comment, linear_list_teams, linear_get_team_states, linear_list_labels, linear_list_milestones, linear_list_members
```

**Problemas:**
- `bash` presente — para operaciones de board no debería tener shell
- `read, grep, glob, write, edit` — herramientas de sistema de archivos; el agente de Linear trabaja contra la API de Linear, no contra archivos locales
- La tabla del orchestrator (line 11) solo lista `linear_*` tools, pero el frontmatter incluye file tools — hay discrepancia

**Decisión:** Reducir tools a solo las `linear_*` necesarias para operaciones de board. Las file tools van solo para `ein-git`, `ein-readme`, y los agentes SDD.

### 1.2 `ein-linear.md` — Hard Gate #6 (stateId)

**Línea 47:**
```
**stateId gate**: never pass a state name (e.g. `"Done"`) to `linear_update_issue`.
Always call `linear_get_team_states` (or `linear_list_teams` + states) first to get
the UUID for the desired state, then pass that UUID as `stateId`.
Passing a name fails with `Entity not found in validateAccess: stateId`.
```

**Problema real:**
- `linear_update_issue` del MCP de Linear acepta `state` como nombre o como UUID
- El usuario验证ó que pasando `state: "Canceled"`funcionó correctamente
- La regla rígida de "siempre UUID" contradice el comportamiento real del MCP
- Forzar `linear_get_team_states` antes de cada update añade ~2 llamadas innecesarias

**Decisión:** Reemplazar la regla rígida por un enfoque pragmático:
1. Usar el schema de la herramienta directamente — si acepta `state`, pasar el nombre
2. Si la herramienta exige UUID Y falla, hacer lookup del UUID y reintentar
3. Si falla por otro motivo, parar con error exacto

### 1.3 `ein-linear.md` — Sin Known Issue IDs Mode

**Situación actual:**
- El agente siempre hace preflight completo: busca proyectos, issues, estados
- No distingue entre operación de descubrimiento (scope ambiguous) y operación dirigida (IDs exactos proporcionados)
- Esto causó ~400k tokens en una limpieza simple donde los IDs ya estaban disponibles

**Decisión:** Crear sección `Known Issue IDs Mode` con:
- Trigger: prompt trae IDs exactos de Linear (formato `SAM-XXX`)
- Comportamiento: no listar proyectos, no escanear board, no broad search, no shell
- Max calls: `4 por issue + 2 overhead`
- Solo herramientas: `linear_get_issue` (read-back), `linear_update_issue`, `linear_create_comment`, `linear_search_issues` (resolución de ID único)

### 1.4 `orchestrator.md` — Sin LINEAR OPERATION PACKET

**Situación actual:**
- El orchestrator pasa tareas a `ein-linear` sin metadata de modo
- No hay concepto de "modo IDs exactos" vs "modo descubrimiento"
- El Plan Gate ya resolve IDs antes de delegar, pero la información de modo no se empaqueta

**Decisión:** Crear `LINEAR OPERATION PACKET` como sección en orchestrator.md para updates con IDs exactos, incluyendo:
- `mode: "known_ids"` — activa Known Issue IDs Mode
- `issues: [ID1, ID2, ...]` — lista exacta
- `protected: [...]` — issues que NO se deben tocar
- `budget: { max_calls_per_issue: 4, overhead: 2 }`
- `no_shell: true`, `no_discovery: true`

---

## // 002. ARCHIVOS A TOCAR

| Archivo | Cambio | Riesgos |
|---------|--------|---------|
| `ein-pi/agent/agents/ein-linear.md` | 1) Quitar file tools del frontmatter 2) Reemplazar stateId gate 3) Añadir Known Issue IDs Mode | Ninguno — cambio additive y correctivo |
| `ein-pi/agent/assets/orchestrator.md` | Añadir LINEAR OPERATION PACKET en subagent delegation | Ninguno — sección nueva |
| `tests/ein-linear-budget.test.ts` | Crear test de contrato | Ninguno — archivo nuevo |

---

## // 003. DECISIONES TOMADAS

1. **Tools de ein-linear**: reducir a solo `linear_*` tools — `bash, read, grep, glob, write, edit` no pertenecen a un agente de board
2. **stateId gate**: cambiar de regla rígida UUID a enfoque pragmático con fallback
3. **Known Issue IDs Mode**: nuevo modo con max 4+2 calls por issue
4. **LINEAR OPERATION PACKET**: sección en orchestrator para comunicar modo y budget a ein-linear
5. **Skill injection**: NO se toca (punto 5 excluido por el usuario)

---

## // 004. RIESGOS

- **Riesgo bajo**: los cambios son todos additive o correctivos — no eliminan funcionalidad existente, solo restringen comportamientoproblemático
- **Riesgo de regresión en stateId**: si hay algún contexto donde el MCP realmente exige UUID y no acepta nombre, el nuevo enfoque con fallback lo cubre (reintenta con UUID si falla)
- **Tests nuevos**: los tests de contrato verifican patrones en los archivos .md — si alguien edita el archivo y borra una regla, el test falla

---

## // 005. SIGUIENTE

Generar `.sdd/changes/ein-linear-known-ids-budget/tasks.md` con las tareas concretas y el orden de aplicación.
