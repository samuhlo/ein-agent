# 10 · Presupuesto de investigación medido y honestamente nombrado

Estado: diseño para implementar. Base: `origin/main`, `3b9fa42`.
Principios: MANIFIESTO §§001 y 002. Depende del gateway del plan 05.

## A. Proposal

Map y design no deben seguir investigando indefinidamente porque olvidaron contar lecturas.
Hoy `ensurePhaseContextBudget` añade una frase sobre 15.000 tokens/30 lecturas, sin contador;
además solo reconoce single directo y omite el workflow equivalente.
Mantener asignaciones orientativas de tokens y convertir el freno de investigación en un límite
que el runner ya sabe ejecutar, sin construir otro subsistema de presupuestos.

API comprobada del paquete instalado: `toolBudget: { hard, soft?, block? }`;
Versión inspeccionada: `pi-subagents@0.68.0`, `src/extension/schemas.ts` y `src/shared/types.ts`.
`src/runs/shared/tool-budget.ts` cuenta TODAS las llamadas y bloquea herramientas seleccionadas
cuando la siguiente supera `hard`. No equivale a contar solo lecturas ni tokens facturados.

## B. Spec · Given / When / Then

- Dadas tareas iguales en forma directa y workflow admitido, cuando se lanzan map/design,
  entonces ambas reciben el mismo presupuesto efectivo y la misma descripción de su alcance.
- Dado `hard:30`, cuando hay 30 llamadas y se intenta investigar de nuevo, el runner bloquea
  la investigación; la escritura del artefacto parcial y el mensaje final siguen disponibles.
- Dadas 30 llamadas de tipos mezclados, se aplica el mismo umbral total; no se anuncia
  «30 lecturas realizadas» ni «15.000 tokens consumidos» a partir de ese número.
- Dado un presupuesto explícito inferior, se respeta; uno superior no amplía silenciosamente
  el default del arnés. Una ampliación requiere nueva asignación explícita en el contrato.
- Dado un runtime que no soporta `toolBudget`, entonces no se anuncia límite duro activo;
  el lanzamiento falla como capacidad no disponible, conservando el trabajo previo.
- Dada una nueva delegación para continuar, no se afirma conservar un saldo de fase inexistente:
  se declara nueva asignación por ejecución y se pide solo la laguna concreta pendiente.

## C. Decisions

### Contrato real

`ensurePhaseContextBudget` consume items admitidos por 05. Para `sdd-map` y `sdd-design`
el default es `toolBudget:{ hard:30, soft:24, block:["read","grep","find","ls","bash"] }`.
`bash` se incluye porque map puede investigar mediante codegraph; design no dispone de bash.
El contador total permite un límite superior conservador de investigación, no una cuota exacta
por clase. Artefactos `write/edit` no están bloqueados, pero sí cuentan si el runner los cuenta.
La sintaxis de `block` es lista de NOMBRES exactos, no glob ni regex; la única alternativa es `"*"`.
Con hard=30 se permiten llamadas 1..30; el intento número31 de un nombre bloqueado se deniega.
No se promete tiempo ilimitado para escribir: el timeout de la ejecución sigue vigente.
No usar `block:"*"`: impediría guardar el mapa parcial, creando un bucle de reintentos.

Mantener `phase_budget.max_reads` como entrada legacy de un umbral de llamadas;
normalizarla y mostrar claramente ese significado. Introducir `max_tool_calls` como nombre
canónico; si aparecen ambos y difieren, error antes de ejecutar. Sin coerciones numéricas.
`max_tokens` sigue siendo una orientación de contexto, nunca cap duro ni saldo disponible.
No convertir tokens aproximados de texto en coste de inferencia observado.
Asignación explícita ordinaria solo estrecha el default; una ampliación se pasa por campo
`allowBudgetIncrease:true` del contrato admitido que el padre solo usa con autorización concreta.
No inferir esa autorización de una frase dentro de la tarea; el gateway retira este campo
de la llamada al runner después de resolver el presupuesto.

### Formas y reanudación

Single directo usa campos superiores; workflow estático escribe el presupuesto en cada child
map/design antes de emitir su script canónico. No contaminar apply/git de un workflow mixto.
Usar el serializador de 05, no regex. Conservar restricciones más fuertes del caller:
hard menor y unión de herramientas bloqueadas; `block:"*"` explícito se mantiene y se advierte
que puede impedir persistir artefactos, sin ampliarlo unilateralmente.
`soft = min(24, hard)` por defecto, o min(soft explícito, hard).

Un resume nativo conserva su semántica del runner; el plan no inventa persistencia propia.
Una nueva llamada child recibe nueva asignación POR EJECUCIÓN, se presenta como tal y reutiliza
el artefacto parcial. Retirar la promesa «Resuming this phase does not reset its consumption»
del helper, mientras no exista un contador acumulado probado entre ejecuciones.
No renovar automáticamente cuotas al detectar agotamiento ni reexplorar lo ya citado.
Una decisión futura de techo compartido entre fases requiere otro diseño, no cabe aquí.

### Evidencia de límites

Conservar `details.results[].toolBudget` y `toolBudgetBlocked` del runner sin reinterpretación.
El resultado parcial no se transforma en `complete` por haber escrito un Markdown válido.
La explicación del padre nombra presupuesto agotado y lagunas, reutilizando evidencia aceptada.
El hard runtime temporal existente permanece separado: diez minutos no prueban 30 lecturas.

## D. Acceptance

- Direct/workflow producen opciones equivalentes; mixed no modifica agentes ajenos.
- Test del runner instalado comprueba llamada 30/31 y capacidad de escribir después del bloqueo.
- Contador con `write` previo demuestra que la unidad es llamadas, no lecturas.
- Tokens orientativos nunca aparecen como consumo comprobado o límite garantizado.
- Parcial anterior se conserva al bloquear; la continuación no repite todas las lecturas.
- No dependencias nuevas, no cambios en `node_modules`, no nuevo archivo global de saldos.

## E. Paquetes cerrados de ejecución

### 10.1 · Normalización y cableado

Leer: `ein-pi/agent/lib/sdd-phase-context-budget.ts`, contrato admitido de 05,
`ein-pi/agent/extensions/internal/ein-tool-call-gate.ts`, `ein-pi/agent/lib/scout-contract.ts`
y API instalada `pi-subagents/src/runs/shared/tool-budget.ts`.
Editar producción: `ein-pi/agent/lib/sdd-phase-context-budget.ts`,
`ein-pi/agent/lib/delegation-admission.ts` y `ein-pi/agent/extensions/internal/ein-tool-call-gate.ts`.
Pasos: normalizar campos; calcular mínimos; inyectar por child; devolver metadatos de unidad real;
retirar marker de ampliación antes del runner. No cambiar el presupuesto de scouts.
Crear `tests/phase-tool-budget.test.ts`; actualizar `tests/sdd-start-change.test.ts`.
Comando: `bun test tests/phase-tool-budget.test.ts tests/sdd-start-change.test.ts tests/delegation-admission.test.ts`.
Parar si el schema instalado no transmite presupuesto por child; no caer a una frase simulando límite.

### 10.2 · Política coherente

Leer: `runtime/agents/sdd-map.md`, `runtime/agents/sdd-design.md`,
`runtime/agents/sdd-scope.md`, `runtime/assets/orchestrator.md`.
Editar esos cuatro archivos de política: explicar unidad, cierre parcial, tokens orientativos
y nueva asignación de ejecución; retirar pseudocódigo que promete contador duro de tokens.
Ampliar `tests/phase-tool-budget.test.ts` con la descripción de unidad y la
conservación de artefactos parciales. Comandos: `bun test tests/phase-tool-budget.test.ts tests/prompt-budget.test.ts`
y `bun run typecheck`.

### 10.3 · Comprobación de la frontera del runner

Crear `tooling/verify-phase-tool-budget.ts`; editar `tooling/verify-latest-pi-runtime.ts`
para invocarlo con la ruta del paquete temporal que ya instala ese verificador.
El nuevo probe recibe esa ruta como argumento; no busca ni modifica el hogar personal.
El probe registra 30 llamadas y la 31 bloqueada, luego permite `write` en raíz temporal.
Comandos: `bun test tests/phase-tool-budget.test.ts` y `bun tooling/verify-latest-pi-runtime.ts`.
Probar con interfaz pública inyectable sin proveedor; si no existe, registrar ese bloqueo de validación,
sin presentar un test de la función `shouldBlockToolForBudget` como ejecución completa del runner.

### Compatibilidad y reversión

El campo legacy sigue legible, pero su descripción cambia a unidad real; no reescribir mapas antiguos.
Los ledgers antiguos son declaraciones históricas, no balances para nuevas llamadas.
Revertir helper y política juntos; mantener la admisión de 05.
No implementar un contador token/coste nuevo como «arreglo» de una prueba que falla.
