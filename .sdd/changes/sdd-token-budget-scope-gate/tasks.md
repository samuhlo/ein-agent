# SDD Tasks: sdd-token-budget-scope-gate

## // 000. RESUMEN

Endurecer sdd-init (fast path + budget), sdd-explore (SCOPE PACKET + ledger + webfetch condicional), orchestrator (Scope Gate Contract + fan-out limitado), y ein-sdd.chain (fail-safe). Tests de contrato en Bun/TS para verificar que los prompts contienen las reglas clave.

---

## // 001. TAREA 1 — Endurecer sdd-init.md

**Qué busca:** Que sdd-init tenga un fast path para config-only y declare presupuesto explícito.

**Por qué importa:** La mayoría de los sdd-init posteriores solo confirman que la config existe. Re-escanear todo el proyecto cada vez es gasto innecesario.

**Skills:** `comment-style` (para comentarios en el artifact y tests)

**Decisión arquitectonica:** No crear agente nuevo. El fast path es una rama lógica dentro del mismo sdd-init, no un dominio diferente.

**Alternativa a evitar:** Crear `sdd-config` separado. Multiplicaría el routing sin beneficio — init es idempotente y cubre ambos casos.

**Cómo se verificará:**
```bash
# El fast path se prueba manualmente: invocar con request "estado SDD"
# y verificar que no hace scouting de archivos del proyecto
```

---

- [x] 1.1 **Leer sdd-init.md actual** — revisar contenido completo antes de editar.

- [x] 1.2 **Añadir fast path config-only** — en la sección de reglas, agregar:
  ```
  ## Fast Path: Config-Only Init

  CUANDO el request es cualquiera de:
    - "reportar estado SDD"
    - "estado del proyecto"
    - "check SDD config"
    - o similar vago de solo-lectura

  ENTONCES:
    1. Leer openspec/config.yaml si existe
    2. Devolver resumen: stack, testing runner, strict_tdd, artifact store
    3. NO escanear src/, tests/, ni ningún archivo de código
    4. Marcar budget_used como { tokens: "~200", reads: 1 }

  CUANDO el request pide "init" completo o no está claro:
    Proceder con scouting normal de proyecto.
  ```
  Ubicar esta sección después de "Skill Resolution Contract".

- [x] 1.3 **Declarar budget en frontmatter** — en el frontmatter del archivo, añadir:
  ```yaml
  budget:
    default_max_tokens: 8000
    config_only_max_tokens: 500
  ```
  Esto documenta el límite esperado y permite al orchestrator saber qué pasar.

- [x] 1.4 **Documentar budget en artifact** — en la sección de output, aclarar que el artifact init.md incluye:
  ```
  budget_allocated:
    max_tokens: <number>
    max_runtime_ms: <number>
  ```
  Esto permite que el chain propague budgets entre fases.

---

## // 002. TAREA 2 — Endurecer sdd-explore.md

**Qué busca:** SCOPE PACKET obligatorio, ledger de reads, y webfetch desactivado por defecto.

**Por qué importa:** Sin scope packet, sdd-explore puede consumir tokens de forma ilimitada explorando archivos irrelevantes. webfetch activo en todas las llamadas añade coste de red innecesario.

**Skills:** `comment-style`

**Decisión arquitectonica:** SCOPE PACKET no es un artifact nuevo sino una sección dentro del task prompt. El explorador lo extrae y lo usa para filtrar reads. Si falta, falla con `scope_missing`.

**Alternativa a evitar:** Crear un paso de "scope validation" como fase separada del chain. Añadiría latencia y ceremony innecesaria; el gate vive mejor dentro del mismo explore.

**Cómo se verificará:**
```bash
# 1. Llamar a sdd-explore sin SCOPE PACKET y verificar que devuelve error
# 2. Llamar con SCOPE PACKET y verificar que el artifact incluye reads[], webfetch_used
```

---

- [x] 2.1 **Leer sdd-explore.md actual** — revisar contenido completo.

- [x] 2.2 **Retirar webfetch del frontmatter** — cambiar la línea de tools de:
  ```yaml
  tools: read, grep, glob, webfetch
  ```
  a:
  ```yaml
  tools: read, grep, glob
  ```
  webfetch se activa solo por SCOPE PACKET o por request explícito.

- [x] 2.3 **Añadir regla SCOPE PACKET** — después de "Skill Resolution Contract", agregar:
  ```
  ## SCOPE PACKET Contract

  ANTES DE EXPLORAR, el task prompt DEBE contener:

  SCOPE PACKET = """
  scope: <descripción bounded del change, 1-3 frases>
  change_name: <nombre del change>
  budget:
    max_tokens: <número>
    max_reads: <número, opcional>
  webfetch: <true | false — true SOLO si el request lo pide>
  excluded: <áreas fuera de scope, opcional>
  """

  SI el SCOPE PACKET falta o está incompleto:
    - Devolver: { status: "error", code: "scope_missing", message: "..." }
    - NO explorar ningún archivo
    - Marcar artifact como exploration-error.md

  CUANDO webfetch: true:
    - Añadir webfetch a la lista de tools activas
    - Documentar urls_fetched[] en el ledger
  ```

- [x] 2.4 **Añadir Ledger al output contract** — en la sección de result contract, expandir para incluir:
  ```
  ledger:
    reads: [{ path, lines, estimated_tokens }]
    webfetch_used: boolean
    webfetch_urls: [string]  # solo si webfetch_used
    budget_consumed: { tokens, reads }
  ```

- [x] 2.5 **Añadir fail-fast si budget agotado** — dentro de la lógica de exploración:
  ```
  SI reads.length >= budget.max_reads
    O tokens_estimados >= budget.max_tokens
  ENTONCES:
    - Detener exploración
    - Devolver artifact con reads parciales + budget_exceeded: true
    - NO continuar leyendo más archivos
  ```

---

## // 003. TAREA 3 — Endurecer orchestrator.md

**Qué busca:** Scope Gate Contract, no pasar raw prompt, limitar fan-out, no context:fresh por defecto para explore normal.

**Por qué importa:** El orchestrator es el origen de todas las llamadas SDD. Si aquí no se construye el scope packet, ninguna fase posterior puede confiar en tenerlo.

**Skills:** `comment-style`

**Decisión arquitectonica:** Scope Gate vive en el orchestrator, no en el chain ni en los agentes. El orchestrator es el único que tiene la visión global del request del usuario.

**Alternativa a evitar:** Poner el gate dentro de sdd-explore como auto-check. Eso significaría que el agente hace work que el orchestrator debería haber hecho, y gastar tokens explorando antes de saber si el scope es válido.

**Cómo se verificará:**
```bash
# 1. Grep orchestrator.md por "Scope Gate"
# 2. Verificar que la sección limita fan-out a 3 ramas
# 3. Verificar que no usa context:fresh para explore normal
```

---

- [x] 3.1 **Leer orchestrator.md** — identificar la sección "Parallel read-only fan-out" (líneas ~32-51).

- [x] 3.2 **Crear nueva sección "Scope Gate Contract"** — insertar después de la sección "Chain Inventory" (antes de "Identity Contract"). Contenido:
  ```
  ## Scope Gate Contract

  ANTES DE invocar `sdd-explore` (directo o vía chain):
    1. **Construir SCOPE PACKET** desde el request del usuario
       - Extraer `scope`, `change_name` del request
       - Asignar `budget: { max_tokens: 15000, max_reads: 30 }` por defecto
         (override si el request es explícito sobre límites)
       - Determinar `webfetch: true` SOLO si el request menciona web, URLs, o documentación externa

    2. **Validar scope antes de delegar**
       - Si el scope es vago ("refactor todo", "arregla todo", "mejora el código"):
         - Rechazar: responder al usuario pidiendo clarificación
         - NO delegar a sdd-explore sin scope válido
       - Si el scope está claro pero es demasiado amplio (>50 archivos potenciales):
         - Sugerir descomposición en slices antes de proceder

    3. **Presentar SCOPE PACKET al subagente**
       - Incluir el SCOPE PACKET completo en el task prompt, no solo {task}
       - Formato: envolver {task} dentro del SCOPE PACKET estructurado

    4. **NO usar context:"fresh"** para explore normal
       - `context: "fresh"` carga contexto nuevo desde cero — es costoso (~2000 tokens extra)
       - Usar `context: "fork"` o no especificar para exploración normal
       - Reserve `context: "fresh"` solo para auditorías, revisiones de PR, o incidentes
  ```

- [x] 3.3 **Limitar fan-out a 3 ramas** — en la sección "Parallel read-only fan-out", cambiar:
  ```
  // CURRENT: "emit several subagent calls in a single turn"
  // NEW: máximo 3 llamadas concurrentes
  ```
  Añadir como hard cap:
  ```
  **Hard limit:** máximo 3 ramas paralelas por fan-out.
  **Costo warning:** cada rama con context:"fresh" suma ~2000 tokens.
    No hacer fan-out si el costo total supera el budget de la fase.
  ```

- [x] 3.4 **Quitar webfetch del toolset por defecto** — en la tabla de subagentes, cambiar la fila de `sdd-explore`:
  ```
  | sdd-explore | read, grep, glob | SDD exploration phase for ambiguous or large features |
  ```
  (quitar webfetch — se activa solo por SCOPE PACKET)

---

## // 004. TAREA 4 — Endurecer ein-sdd.chain.md

**Qué busca:** Fail-safe que pare el chain si falta scope antes de sdd-explore.

**Por qué importa:** Si el orchestrator no construye el SCOPE PACKET correctamente, el chain actual sigue adelante y sdd-explore recibe un task abierto. Mejor parar y reportar.

**Skills:** ninguna skill nueva necesaria

**Decisión arquitectonica:** El fail-safe vive en la definición del chain, no en un agente intermediario. Esto permite que el gate sea visible y auditable como parte del artifact del chain.

**Alternativa a evitar:** Crear un validador de scope como paso adicional del chain. Eso añadiría latencia y diluiría la responsabilidad.

**Cómo se verificará:**
```bash
# grep "scope_missing" ein-sdd.chain.md
# grep "fail-safe" ein-sdd.chain.md
```

---

- [x] 4.1 **Leer ein-sdd.chain.md** — revisar estructura actual de los pasos.

- [x] 4.2 **Añadir fail-safe en sdd-explore** — modificar la definición del paso `sdd-explore`:
  ```
  ## sdd-explore

  reads: init.md
  output: exploration.md
  outputMode: file-only
  progress: true

  FAIL-SAFE:
    ANTES DE EXPLORAR, verificar que init.md contiene:
      - scope: <string> (no vacío)
      - budget: { max_tokens, max_reads? }

    SI falta scope:
      - output: exploration-error.md
      - status: scope_missing
      - message: "Scope not found in init.md. Cannot proceed to explore."
      - DETENER CHAIN — no invocar sdd-design

    CUANDO scope existe pero budget max_reads > 50:
      - Warning en artifact: "Scope too broad; consider decomposition"
      - Continuar con exploración pero registrar risk
  ```

- [x] 4.3 **Propagar budget al artifact** — asegurar que el artifact exploration.md incluye:
  ```
  budget_allocated: <from SCOPE PACKET>
  budget_consumed: <from ledger>
  scope_status: <valid | scope_missing | too_broad>
  ```

---

## // 005. TAREA 5 — Tests de contrato en Bun/TS

**Qué busca:** Verificar que los prompts/archivos contienen las reglas clave del contract.

**Por qué importa:** Las reglas de scope/packet son contractuales. Si alguien edita el orchestrator y borra el Scope Gate Contract, los tests deben fallar.

**Skills:** `comment-style`, `vitest` (para patrones de tests)

**Decisión arquitectonica:** Tests que leen los archivos .md como strings y verifican patrones con regex. No es testing funcional sino verificación estática de contract.

**Alternativa a evitar:** Tests de integración completos que instancien los agentes. Serían demasiado frágiles y lentos. La verificación de patrones string/regex es suficiente.

**Cómo se verificará:**
```bash
bun test tests/sdd-scope-packet.test.ts
bun test tests/sdd-chain-failsafe.test.ts
bun test tests/orchestrator-scope-gate.test.ts
```

---

- [x] 5.1 **Crear tests/sdd-scope-packet.test.ts** — verificar que sdd-explore.md contiene:
  - `SCOPE PACKET` como texto
  - `scope_missing` como código de error
  - `budget` en el contract
  - `ledger` en el contract
  - `webfetch` condicional (heredado del frontmatter actualizado)

- [x] 5.2 **Crear tests/sdd-chain-failsafe.test.ts** — verificar que ein-sdd.chain.md contiene:
  - `FAIL-SAFE` o `fail-safe`
  - `scope_missing`
  - `DETENER CHAIN` o equivalente

- [x] 5.3 **Crear tests/orchestrator-scope-gate.test.ts** — verificar que orchestrator.md contiene:
  - Sección "Scope Gate Contract"
  - Mención de "max 3 ramas" o "hard limit" para fan-out
  - NO `context: "fresh"` como default para explore normal
  - SCOPE PACKET como requisito antes de invocar sdd-explore

- [x] 5.4 **Crear tests/sdd-init-budget.test.ts** — verificar que sdd-init.md contiene:
  - Fast path (sección "Fast Path" o "Config-Only")
  - `budget` en frontmatter
  - `budget_allocated` en output

---

## // 006. ORDEN DE APLICACIÓN

1. **Primero**: Tarea 1 (sdd-init) — cambios pequeños, sin dependencias.
2. **Segundo**: Tarea 2 (sdd-explore) — cambios en el agente que recibe el SCOPE PACKET.
3. **Tercero**: Tarea 3 (orchestrator) — quien construye el SCOPE PACKET.
4. **Cuarto**: Tarea 4 (chain) — fail-safe que depende de que el contract esté definido.
5. **Quinto**: Tarea 5 (tests) — verifican que todo lo anterior cumple el contract.

**Por qué este orden:** sdd-init no tiene dependencias. sdd-explore depende de que el SCOPE PACKET esté definido (Tarea 2). orchestrator depende de saber qué es un SCOPE PACKET (Tarea 2). chain depende de que el contract exista (Tareas 2 y 3). Los tests verifican todo al final.

---

## // 007. VERIFICACIÓN FINAL

```bash
# Tests de contrato
bun test tests/sdd-scope-packet.test.ts
bun test tests/sdd-chain-failsafe.test.ts
bun test tests/orchestrator-scope-gate.test.ts
bun test tests/sdd-init-budget.test.ts

# Smoke test: invocar sdd-init en modo config-only
# Smoke test: invocar sdd-explore sin scope y verificar error scope_missing
# Smoke test: invocar sdd-explore con scope válido y verificar artifact
```

---

## // 008. NOTAS PARA APRENDER

- **SCOPE PACKET no es un artifact nuevo**: es una sección dentro del task prompt. Evita crear un paso adicional en el chain.
- **Budget es un contrato entre fases**: el orchestrator lo propone, init lo confirman, explore lo consume y lo reporta. Si falta, el chain para.
- **webfetch es la herramienta más cara**: cada fetch de URL externa puede consumir 2000-5000 tokens. Desactivarla por defecto fuerza al usuario a pedirla explícitamente.
- **Fan-out sin scope es costoso**: 3 ramas con `context:"fresh"` = ~6000 tokens extra solo en context loading, antes de leer un solo archivo.
