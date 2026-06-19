# SDD Tasks: ein-linear-known-ids-budget

## // 000. RESUMEN

Endurecer `ein-linear.md` (tools, stateId gate, Known Issue IDs Mode) y `orchestrator.md` (LINEAR OPERATION PACKET) con tests de contrato. Objetivo: reducir ~400k tokens en operaciones de board con IDs exactos a ~4 llamadas por issue + 2 overhead.

---

## // 001. TAREA 1 — Limpiar tools en ein-linear.md

**Qué busca:** Que `ein-linear` solo exponga herramientas `linear_*` — sin bash ni file tools para operaciones de board.

**Por qué importa:** Un agente de Linear debe trabajar contra la API de Linear, no contra el filesystem. Tener `bash` disponible para un agente de board es un vector de riesgo innecesario y un indicador de scope creep.

**Skills:** `comment-style`

**Decisión arquitectonica:** Las herramientas `linear_*` son el conjunto correcto. File tools (`read, grep, glob, write, edit`) y `bash` pertenecen a `ein-git`, `ein-readme`, y los agentes SDD. La herramienta `linear_viewer` también se elimina — no existe en el MCP de Linear.

**Alternativa a evitar:** Mantener todas las tools "por si acaso". Esto diluye la especialización del agente y aumenta la superficie de ataque.

**Cómo se verificará:**
```bash
grep "^tools:" ein-pi/agent/agents/ein-linear.md
# Debe mostrar solo linear_*, sin bash, read, grep, glob, write, edit
```

---

- [x] 1.1 **Leer ein-linear.md completo** — revisar línea a línea antes de editar.

- [x] 1.2 **Limpiar frontmatter tools** — cambiar línea 4 de:
  ```yaml
  tools: read, grep, glob, write, edit, bash, linear_viewer, linear_list_projects, linear_list_issues, linear_create_issue, linear_update_issue, linear_search_issues, linear_create_comment, linear_list_teams, linear_get_team_states, linear_list_labels, linear_list_milestones, linear_list_members
  ```
  a:
  ```yaml
  tools: linear_get_issue, linear_update_issue, linear_search_issues, linear_create_issue, linear_create_comment, linear_list_teams, linear_get_team_states, linear_list_labels, linear_list_milestones, linear_list_members, linear_list_projects, linear_list_issues
  ```
  Nota: se reordena para agrupar por tipo de operación y se elimina `linear_viewer` (no existe en el MCP real), `read`, `grep`, `glob`, `write`, `edit`, `bash`.

- [x] 1.3 **Actualizar orchestrator.md** — en la fila de `ein-linear` en la Subagent Inventory (línea 11), actualizar la columna "Tools" para que coincida con el frontmatter limpio:
  ```
  | ein-linear | linear_get_issue, linear_update_issue, linear_search_issues, linear_create_issue, linear_create_comment, linear_list_teams, linear_get_team_states, linear_list_labels, linear_list_milestones, linear_list_members, linear_list_projects, linear_list_issues | ...
  ```

---

## // 002. TAREA 2 — Reemplazar stateId gate por enfoque pragmático

**Qué busca:** Eliminar la regla rígida que obliga a usar UUID siempre, y reemplazarla por un enfoque que use el schema de la herramienta y haga fallback a UUID solo si es necesario.

**Por qué importa:** La regla rígida contradice el comportamiento real del MCP: `linear_update_issue` acepta `state` como nombre o UUID. Forzar el lookup de UUID antes de cada update añade ~2 llamadas por operación, sin beneficio.

**Skills:** `comment-style`

**Decisión arquitectonica:** El nuevo flujo es: intentar con nombre directamente → si falla por formato de state, hacer lookup UUID → reintentar → si falla por otro motivo, parar con error exacto. Esto es "fail-fast on real error, not on hypotheticals".

**Alternativa a evitar:** Mantener la regla rígida "siempre UUID". Añade coste sin necesidad y fue invalidada por la experiencia real del usuario.

**Cómo se verificará:**
```bash
grep -n "stateId gate\|state.*UUID\|state.*name\|linear_update_issue" ein-pi/agent/agents/ein-linear.md
# No debe contener la regla rígida antigua
```

---

- [x] 2.1 **Leer sección Hard Gates de ein-linear.md** — líneas ~40-48.

- [x] 2.2 **Reemplazar Hard Gate #6 (stateId)** — cambiar:
  ```
  6. **stateId gate**: never pass a state name (e.g. `"Done"`) to `linear_update_issue`.
     Always call `linear_get_team_states` (or `linear_list_teams` + states) first to get
     the UUID for the desired state, then pass that UUID as `stateId`.
     Passing a name fails with `Entity not found in validateAccess: stateId`.
  ```
  Por:
  ```
  6. **Pragmatic state resolution**: `linear_update_issue` accepts `state` as name OR as
     UUID — inspect the tool schema. Pass the state name directly when the schema supports
     it. Only do a `linear_get_team_states` lookup when:
       a. The tool call fails with a state-validation error, OR
       b. The tool schema explicitly requires a UUID format.
     On failure: stop with the exact error message and the corrective action.
     Never force a UUID lookup before trying the direct name approach.
  ```

- [x] 2.3 **Eliminar `linear_get_team_states` del recipe determinista** — en el recipe de creación de issues (líneas 61-68), cambiar:
  ```
  4. `linear_get_team_states` → resolve **state UUID**.
  ```
  Por:
  ```
  4. Resolve state: use the tool schema to determine if `state` accepts a name directly.
     If yes, pass the name. If the schema requires UUID, do `linear_get_team_states` first.
  ```

---

## // 003. TAREA 3 — Añadir Known Issue IDs Mode

**Qué busca:** Nuevo modo de operación cuando el prompt trae IDs exactos — sin discovery, sin shell, max 4+2 calls por issue.

**Por qué importa:** La limpieza de Linear con IDs exactos consumió ~400k tokens porque el agente hizo preflight completo (listar proyectos, estados, labels, members) antes de las actualizaciones. Con IDs exactos, el agente debería poder actualizar directamente sin discovery.

**Skills:** `comment-style`

**Decisión arquitectonica:** El modo se activa automáticamente cuando el prompt contiene IDs en formato Linear (`SAM-XXX` o similar). El orquestador puede forzar el modo vía LINEAR OPERATION PACKET. El agente detecta el modo por presencia de IDs y aplica las restricciones.

**Alternativa a evitar:** Pedir al usuario que declare el modo manualmente. Eso añade fricción y el orchestrator ya sabe en el Plan Gate si tiene IDs exactos.

**Cómo se verificará:**
```bash
grep -n "Known Issue IDs Mode\|known_ids\|max.*call" ein-pi/agent/agents/ein-linear.md
# Debe existir la sección completa
```

---

- [x] 3.1 **Añadir sección Known Issue IDs Mode** — después de "Scope & token budget (mandatory)" (línea ~15), insertar:

  ```
  ## Known Issue IDs Mode (mandatory when exact IDs are present)

  **Trigger:** the task prompt contains exact Linear issue IDs (e.g. `SAM-367`, `SAM-368`)
  in the request — these are not ambiguous candidates, they are the precise targets.

  **When triggered:**
  - Do NOT list projects, teams, or labels
  - Do NOT scan the board with broad `linear_search_issues`
  - Do NOT use `bash`, `read`, `grep`, or any file tools
  - Do NOT run `linear_list_projects` or `linear_list_teams` for discovery
  - Only use: `linear_get_issue` (read-back), `linear_update_issue`, `linear_create_comment`

  **Max tool calls per issue:**
  - `4 calls max per issue`: 1× read-back + 1× update + 1× optional comment + 1× spare
  - `+ 2 overhead`: 1× resolve each ID if the prompt only gives names, 1× spare
  - Total budget: `issues.length × 4 + 2` calls maximum

  **Resolution recipe for named IDs:**
  1. If the prompt gives the exact ID (e.g. `SAM-367`): skip `linear_search_issues`
  2. `linear_get_issue` — fetch current state (read-back baseline)
  3. `linear_update_issue` — apply the mutation (state, assignee, labels, etc.)
  4. `linear_get_issue` — read-back to verify the change took effect
  5. Optional `linear_create_comment` — only for meaningful milestones or blockers

  **Error handling:**
  - If an ID does not resolve: stop immediately, report the exact ID and error
  - If the update fails: stop immediately with the issue ID, attempted change, and error
  - Never silently skip a failing issue and continue to the next

  **Forbidden:**
  - No `linear_list_projects` / `linear_list_teams` / `linear_list_labels` / `linear_list_milestones`
  - No `linear_get_team_states` unless the state schema explicitly requires UUID
  - No shell commands or file operations
  - No broad search — the IDs are the scope, not candidates to find
  ```

---

## // 004. TAREA 4 — Añadir LINEAR OPERATION PACKET en orchestrator.md

**Qué busca:** Sección nueva en orchestrator que comunica modo, budget y constraints a `ein-linear` cuando se delegan updates con IDs exactos.

**Por qué importa:** El Plan Gate ya resolve los IDs antes de delegar, pero la información de modo no se empaquetaba. Con el LINEAR OPERATION PACKET, `ein-linear` sabe exactamente qué modo aplicar sin tener que inferirlo.

**Skills:** `comment-style`

**Decisión arquitectonica:** El PACKET es una sección documental en el orchestrator que el usuario/orquestador usa como guía para construir el task prompt. No es un formato machine-readable complejo — es un contrato textual que fuerza disciplina.

**Alternativa a evitar:** Crear un formato JSON/YAML estructurado como "protocol buffer". Añadiría complejidad sin beneficio — el orchestrator pasa texto libre al subagente.

**Cómo se verificará:**
```bash
grep -n "LINEAR OPERATION PACKET\|known_ids\|no_shell\|no_discovery" ein-pi/agent/assets/orchestrator.md
# Debe existir la sección
```

---

- [x] 4.1 **Leer orchestrator.md** — identificar ubicación para nueva sección (recomendado: después de "Scope Gate Contract").

- [x] 4.2 **Añadir sección LINEAR OPERATION PACKET** — después de "Scope Gate Contract" (~línea 125), insertar:

  ```
  ## LINEAR OPERATION PACKET

  Cuando delegas a `ein-linear` para updates con IDs exactos, construye el task con este formato:

  ```
  LINEAR OPERATION PACKET
  ─────────────────────
  mode: known_ids
  issues: [SAM-367, SAM-368, SAM-369]
  protected: [SAM-343]           # issues que NO se deben tocar
  budget:
    max_calls_per_issue: 4
    overhead: 2
    total_max: issues.length × 4 + 2
  constraints:
    no_shell: true
    no_discovery: true           # no listar proyectos/equipos/board
    no_broad_search: true        # los IDs son el scope, no candidatos
  operation: <update | cancel | comment>
  desired_state: <state name, e.g. "Canceled">
  ─────────────────────
  ```

  **Reglas de uso:**
  - `mode: known_ids` activa el **Known Issue IDs Mode** en `ein-linear`
  - `issues` es la lista exacta — no necesita discovery
  - `protected` marca los IDs que no se deben tocar (ej: ya cancelados)
  - `constraints.no_discovery` prohíbe listar proyectos/equipos
  - `constraints.no_shell` prohíbe cualquier command/bash/file tool
  - `desired_state` se pasa como nombre, no como UUID — `ein-linear` usa el schema
  - Si falta el PACKET y el task tiene IDs exactos, `ein-linear` aplica Known Issue IDs Mode por detección automática

  **Diferencia con Scope Gate:**
  - Scope Gate: valida que el request del usuario tiene scope antes de invocar `sdd-explore`
  - LINEAR OPERATION PACKET: empaqueta metadata de modo para `ein-linear` cuando ya se tienen IDs exactos
  ```

---

## // 005. TAREA 5 — Tests de contrato

**Qué busca:** Verificar que `ein-linear.md` y `orchestrator.md` contienen las reglas contractuales del cambio.

**Por qué importa:** Las reglas son contractuales — si alguien edita `ein-linear.md` y borra el Known Issue IDs Mode, el test debe fallar. Los tests actúan como guardrails permanentes.

**Skills:** `comment-style`, `vitest`

**Decisión arquitectonica:** Tests que leen los archivos .md como strings y verifican patrones con `toContain` / regex. No es testing funcional — es verificación estática de contract. Patrón idéntico a `tests/sdd-scope-packet.test.ts`.

**Alternativa a evitar:** Tests de integración que instancien el agente. Serían demasiado frágiles y lentos. La verificación de patrones string es suficiente y rápida.

**Cómo se verificará:**
```bash
bun test tests/ein-linear-budget.test.ts
```

---

- [x] 5.1 **Crear `tests/ein-linear-budget.test.ts`** — archivo nuevo con estos tests:

  ```typescript
  // =============================================================================
  // TESTS: ein-linear-known-ids-budget contract
  // Verifica que ein-linear.md contiene:
  //   - tools: SIN bash, read, grep, glob, write, edit
  //   - Known Issue IDs Mode con max_calls_per_issue
  //   - Pragmatic state resolution (no rigid UUID rule)
  //   - Prohibición de shell/curl para board updates
  // Verifica que orchestrator.md contiene:
  //   - LINEAR OPERATION PACKET
  // =============================================================================

  import { describe, expect, test } from "bun:test";
  import { readFileSync } from "node:fs";
  import { join } from "node:path";

  const LINEAR_MD = join(import.meta.dir, "../ein-pi/agent/agents/ein-linear.md");
  const ORCH_MD = join(import.meta.dir, "../ein-pi/agent/assets/orchestrator.md");
  const linearContent = readFileSync(LINEAR_MD, "utf8");
  const orchContent = readFileSync(ORCH_MD, "utf8");

  describe("ein-linear.md — tools contract", () => {
    test("NO contiene bash en frontmatter tools", () => {
      const frontmatterMatch = linearContent.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();
      const frontmatter = frontmatterMatch![1];
      expect(frontmatter).not.toContain("bash");
    });

    test("NO contiene read, grep, glob, write, edit en frontmatter tools", () => {
      const frontmatterMatch = linearContent.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();
      const frontmatter = frontmatterMatch![1];
      expect(frontmatter).not.toContain("read,");
      expect(frontmatter).not.toContain("grep,");
      expect(frontmatter).not.toContain("glob,");
      expect(frontmatter).not.toContain("write,");
      expect(frontmatter).not.toContain("edit,");
    });

    test("SÍ contiene solo linear_* tools en frontmatter", () => {
      const frontmatterMatch = linearContent.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();
      const frontmatter = frontmatterMatch![1];
      const toolsLine = frontmatter.split("\n").find(l => l.startsWith("tools:"));
      expect(toolsLine).toBeDefined();
      expect(toolsLine!).toMatch(/^tools:(\s*linear_\w+,?)+$/);
    });
  });

  describe("ein-linear.md — Known Issue IDs Mode contract", () => {
    test("contiene Known Issue IDs Mode", () => {
      expect(linearContent).toContain("Known Issue IDs Mode");
    });

    test("contiene max_calls_per_issue o max.*4.*issue", () => {
      expect(linearContent).toMatch(/max.*4.*per.*issue|4.*calls.*per.*issue/);
    });

    test("contiene overhead: 2 o + 2 overhead", () => {
      expect(linearContent).toMatch(/\+ 2 overhead|overhead.*2/);
    });

    test("prohíbe shell/no_shell para board updates", () => {
      expect(linearContent).toContain("no_shell");
    });

    test("prohíbe discovery/no_discovery para IDs exactos", () => {
      expect(linearContent).toMatch(/no_discovery|no.*discovery/);
    });

    test("prohíbe broad_search para IDs exactos", () => {
      expect(linearContent).toMatch(/no_broad_search|no.*broad.*search/);
    });
  });

  describe("ein-linear.md — pragmatic state resolution contract", () => {
    test("NO contiene la regla rígida stateId gate UUID", () => {
      // La regla antigua decía "never pass a state name" y "always call get_team_states first"
      expect(linearContent).not.toMatch(/never pass a state name.*to linear_update_issue/);
      expect(linearContent).not.toMatch(/always call.*get_team_states.*first/);
    });

    test("SÍ contiene Pragmatic state resolution o equivalente", () => {
      expect(linearContent).toMatch(/Pragmatic state resolution|state.*schema|state.*name.*UUID/);
    });

    test("contiene fallback a UUID si schema requiere", () => {
      expect(linearContent).toMatch(/fallback|requires UUID|if.*fails/);
    });

    test("contiene stop on failure con error exacto", () => {
      expect(linearContent).toMatch(/stop.*error|error.*exact|failure/);
    });
  });

  describe("orchestrator.md — LINEAR OPERATION PACKET contract", () => {
    test("contiene LINEAR OPERATION PACKET", () => {
      expect(orchContent).toContain("LINEAR OPERATION PACKET");
    });

    test("contiene mode: known_ids", () => {
      expect(orchContent).toContain('mode: known_ids');
    });

    test("contiene constraints no_shell", () => {
      expect(orchContent).toContain("no_shell: true");
    });

    test("contiene constraints no_discovery", () => {
      expect(orchContent).toContain("no_discovery: true");
    });

    test("contiene budget max_calls_per_issue: 4", () => {
      expect(orchContent).toMatch(/max_calls_per_issue.*4|4.*calls.*per.*issue/);
    });
  });
  ```

---

## // 006. ORDEN DE APLICACIÓN

1. **Primero**: Tarea 1 (clean tools) — cambio pequeño, sin dependencias.
2. **Segundo**: Tarea 2 (stateId pragmatic) — cambio correctivo, no afecta otras tareas.
3. **Tercero**: Tarea 3 (Known Issue IDs Mode) — necesita que las tasks 1 y 2 estén completas para coherencia.
4. **Cuarto**: Tarea 4 (LINEAR OPERATION PACKET) — independiente de 1-3, pero lógicamente precede a los tests.
5. **Quinto**: Tarea 5 (tests) — verifican que todo lo anterior cumple el contract.

**Por qué este orden:** Tareas 1 y 2 son cambios aislados en el frontmatter y los gates. La Tarea 3 usa la estructura de las anteriores. La Tarea 4 es independiente. Los tests van al final como verificación.

---

## // 007. VERIFICACIÓN FINAL

```bash
# Tests de contrato
bun test tests/ein-linear-budget.test.ts

# Verificación manual de artifacts
grep "^tools:" ein-pi/agent/agents/ein-linear.md
grep "Known Issue IDs Mode" ein-pi/agent/agents/ein-linear.md
grep "Pragmatic state" ein-pi/agent/agents/ein-linear.md
grep "LINEAR OPERATION PACKET" ein-pi/agent/assets/orchestrator.md
grep "mode: known_ids" ein-pi/agent/assets/orchestrator.md
```

---

## // 008. NOTAS PARA APRENDER

- **Tools definen el alcance**: un agente con `bash` en tools puede ejecutar shell. Si no lo necesita, no lo expongas.
- **Reglas rígidas vs pragmáticas**: una regla como "siempre UUID" parece segura pero se convierte en coste cuando contradice la realidad del MCP. El enfoque pragmático: intenta lo simple → fallback → para en error real.
- **Known Issue IDs Mode no es una optimizacion — es un contrato**: el agente tenía la información (IDs exactos) pero no la disciplina para usarla. El modo codifica esa disciplina.
- **400k tokens en limpieza**: el primer intento hizo todo el discovery (equipos, proyectos, estados, labels, members) antes de actualizar 5 issues. El segundo intento funcionó porque pasó estados por nombre directamente. La diferencia fue el enfoque, no la cantidad de IDs.
