# SDD Explore: sdd-token-budget-scope-gate

## // 000. RESUMEN

Exploración de endurecimiento del flujo SDD (sdd-init, sdd-explore) y del orquestador para controlar el gasto de tokens mediante gates de scope y budgets explícitos. El objetivo es que las fases SDD no consuman tokens de forma descontrolada por falta de scoping o por herramientas siempre disponibles sin configuración.

## // 001. HALLAZGOS CLAVE

### 1.1 sdd-init — Estado actual

El agente `sdd-init.md` es minimalista (25 líneas). Carece de:

- **Fast path**: no distingue entre requests config-only (que solo leen `openspec/config.yaml`) y requests full SDD.
- **Presupuesto explícito**: no hay noción de `budget`, `maxTokens` o `maxRuntimeMs` que el orquestador deba pasar.
- **Exit early**: cuando `openspec/config.yaml` ya existe y es estable, el agente podría terminar rápido en lugar de reinspeccionar todo.

### 1.2 sdd-explore — Estado actual

El agente `sdd-explore.md` también es minimalista (24 líneas). Problemas:

- **webfetch siempre disponible**: la tool `webfetch` está en el frontmatter aunque no siempre se necesite. Explorar con webfetch activo es costoso.
- **Sin SCOPE PACKET**: no existe un contrato formal que obligue al llamador (orquestador) a pasar un scope estructurado antes de explorar.
- **Sin ledger**: no hay noción de qué archivos se leyeron ni cuánto costaron.
- **Sin budget tracking**: no hay forma de que el agente sepa cuándo parar.

### 1.3 orchestrator.md — Estado actual

El orchestrator (548 líneas) tiene:

- **Fan-out paralelo ilimitado**: la sección "Parallel read-only fan-out" permite emitir múltiples llamadas concurrentes a `sdd-explore` con `context: "fresh"`. Esto es caro y no tiene gate de scope.
- **Sin Scope Gate Contract**: no hay una regla que diga "antes de llamar a sdd-explore, el orquestador debe construir un SCOPE PACKET".
- **Raw prompt forwarding**: cuando se delega a `sdd-explore`, se pasa `{task}` directamente sin transformación ni validación de scope.
- **context:fresh como default**: para explore normal (no fan-out), el orchestrator no especifica `context`, dejando la decisión al subagente.

### 1.4 ein-sdd.chain.md — Estado actual

El chain (48 líneas) es secuencial pero:

- **No hay fail-safe por scope faltante**: si el orchestador omite el scope al invocar la cadena, `sdd-explore` recibe una tarea abierta y explora sin límites.
- **No hay budget inheritance**: no se propagan límites de tokens/runtime entre fases.

## // 002. RUTA PROPUESTA

### 2.1 sdd-init — Fast path config-only + presupuesto

```
CUANDO openspec/config.yaml existe
  Y el request es "solo leer config" o "reportar estado SDD"
  ENTONCES devolver resumen directo sin inspeccionar proyecto

CUANDO se pide init completo
  RECIBIR { budget: { maxTokens?, maxRuntimeMs? } }
  PUBLICAR budget en el artifact init.md como "budget_allocated"
```

- **Por qué**: el 80% de los `sdd-init` posteriores solo necesitan confirmar que la config existe. No hay que re-escanear todo.
- **Alternativa descartada**: crear un agente separado `sdd-config`. Cuesta más en routing y no lo justifica — init es idempotente, no es un dominio diferente.

### 2.2 sdd-explore — SCOPE PACKET obligatorio + ledger + webfetch condicional

```
ANTES DE EXPLORAR, el llamador DEBE proporcionar:

SCOPE PACKET = {
  scope: string,          // descripción bounded del change
  change_name: string,     // ej. "mi-feature"
  files?: string[],       // archivos específicos a tocar (opcional)
  excluded?: string[],    // áreas fuera descope (opcional)
  budget: {
    maxTokens: number,     // límite en tokens de entrada
    maxReads?: number,     // opcional: máximo de archivos a leer
  },
  webfetch: boolean,       // true SOLO si el request lo pide explícitamente
}
```

- Si el SCOPE PACKET falta o está incompleto, `sdd-explore` debe regresar con error `scope_missing` y no explorar.
- **Ledger**: al finalizar, el agente reporta reads[], tokens_estimados, y webfetch_used.
- **webfetch retirement**: se retira del frontmatter por defecto. Se activa solo cuando `webfetch: true` en el packet o cuando el usuario lo pide explícitamente en el request original.

### 2.3 orchestrator.md — Scope Gate Contract + fan-out limitado

**Scope Gate Contract (nueva sección):**

```
ANTES DE INVOCAR sdd-explore (directo o en chain):
  1. Construir SCOPE PACKET desde el request del usuario
  2. Si scope es vago/abierto ("refactor todo", "arregla los bugs"):
     - Rechazar o pedir clarificación en lugar de delegar sin scope
  3. Verificar que budget es razonable (< 50 archivos leídos para explore normal)
  4. NO usar context: "fresh" para explore normal — usar context: "fork" o no especificar
```

- **Fan-out limitado**: el orchestrator solo puede hacer fan-out paralelo cuando cada rama tiene un SCOPE PACKET independiente y delimitado. Máximo 3 ramas concurrentes.
- **No raw prompt**: nunca pasar `{task}` directamente a `sdd-explore`. Siempre construir un prompt que incluya el SCOPE PACKET.

### 2.4 ein-sdd.chain.md — Fail-safe si falta scope

```
ANTES DE sdd-explore en el chain:
  SI reads[0] (init.md) no contiene "scope" O el chain invocation
     no incluye SCOPE PACKET en el task
  ENTONCES:
     - Marcar phase como "scope_missing"
     - Escribir artifact de error con instrucciones
     - NO continuar a sdd-design
     - Reportar al orquestador
```

- **Por qué fail-safe**: un explore sin scope es la principal fuente de gasto token runaway. Es mejor parar y pedir scope que explorar 200 archivos innecesarios.

### 2.5 Tests de contrato en Bun/TS

Tests que verifican que los prompts/artefactos contengan las reglas clave:

1. **prompt-contiene-scope-packet.test.ts**: verifica que el texto pasado a `sdd-explore` incluya `scope:`, `budget:`, `change_name:`.
2. **prompt-sin-raw-task.test.ts**: verifica que el texto NO contenga `{task}` sin expandir o sin SCOPE PACKET envolvente.
3. **chain-failsafe-scope.test.ts**: verifica que `ein-sdd.chain.md` declare el gate fail-safe.
4. **orchestrator-scope-gate.test.ts**: verifica que `orchestrator.md` tenga la sección Scope Gate Contract.
5. **webfetch-retired.test.ts**: verifica que `sdd-explore.md` NO tenga `webfetch` en tools del frontmatter por defecto.

## // 003. ARCHIVOS AFECTADOS

| Archivo | Cambio |
| ------- | ------ |
| `ein-pi/agent/agents/sdd-init.md` | Fast path + budget en frontmatter y reglas |
| `ein-pi/agent/agents/sdd-explore.md` | SCOPE PACKET, ledger, webfetch condicional |
| `ein-pi/agent/assets/orchestrator.md` | Scope Gate Contract + límites fan-out |
| `ein-pi/agent/chains/ein-sdd.chain.md` | Fail-safe scope_missing |
| `tests/sdd-scope-packet.test.ts` | Nuevo: contrato SCOPE PACKET |
| `tests/sdd-chain-failsafe.test.ts` | Nuevo: fail-safe del chain |

## // 004. RIESGOS

- **Riesgo**: añadir demasiadas reglas a `sdd-explore` puede romper flows existentes donde se le llama directamente sin SCOPE PACKET.
  - **Mitigación**: el fail-safe vive en el chain; la llamada directa sigue funcionando pero sin garantía de budget.
- **Riesgo**: el orchestrator actual pasa `{task}` en muchos lugares. Cambiar esto puede romper invocaciones antigas.
  - **Mitigación**: hacer el cambio backward-compatible: si no hay SCOPE PACKET, generar uno implícito desde `{task}` con budget por defecto, pero registrar un warning.
- **Riesgo**: tests de contrato que leen archivos .md como strings pueden ser frágiles si el formato cambia.
  - **Mitigación**: usar regex específicos sobre las líneas relevantes, no parsing completo de markdown.
