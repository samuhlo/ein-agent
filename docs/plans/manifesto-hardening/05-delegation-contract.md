# 05 · Admitir la delegación que realmente se puede comprobar

Estado: diseño, no implementación. Base: `origin/main`, `3b9fa42`.
Principios: MANIFIESTO §§001 y 002. Dependientes: planes 10 y 11.

## A. Proposal

Una tarea no debe perder sus límites porque el agente escribió su nombre en una variable.
Hoy el escáner recoge literales `agent/task` de cualquier objeto del workflow. Un objeto con
`task` y agente dinámico se considera reconocido, aunque ningún gate identifica su agente.
El probe `/private/tmp/ein-manifest-delegation-probe.ts` demuestra que no se añade cap ni runtime.

La API instalada no proporciona aquí un hook público de Ein sobre cada `runs.run` resuelto.
No implementar un intérprete ni modificar `node_modules`: admitir un subconjunto estático,
cerrado y suficiente para las delegaciones ordinarias; rechazar el resto antes de arrancar.
El rechazo es de transporte: reexpresar la misma tarea autorizada no pide otra autorización.

## B. Spec · Given / When / Then

- Dado un single directo con agente y tarea literales, cuando se admite, todos los gates reciben
  el mismo item y el runner recibe la misma tarea, sin transformar su significado.
- Dado un workflow con agente dinámico o un miembro parcialmente conocido, cuando se analiza,
  entonces se rechaza el workflow completo antes de ejecutar cualquier rama.
- Dado un objeto señuelo con `agent` fuera de `runs.run/all`, entonces no se cuenta como child.
- Dado un workflow de lectura estático válido con tres scouts independientes, entonces mantiene
  su fan-out, resultados y validación por rama; no se fuerza una cadena secuencial.
- Dada una consulta literal `runs.status("id")`, entonces se permite sin inyectar política de ejecución.
- Dado un rechazo recuperable por variable/interpolación, entonces se comunica cómo reenviar
  los valores ya conocidos en la forma soportada, conservando tarea, cwd y autorización.
- Dado un valor que solo puede conocerse ejecutando código arbitrario, entonces no se evalúa;
  el padre resuelve el dato por una lectura autorizada o declara el dato pendiente.

## C. Decisions

### Parser existente y gramática cerrada

Usar `typescript.createSourceFile` y recorrer AST sin evaluación. TypeScript ya es dependencia
y se distribuye para los analizadores `cleaner-*`; ampliar su lista de imports reescritos en
`installer/scripts/bundle-template.ts`, sin añadir otra librería ni una dependencia de red.
Crear `ein-pi/agent/lib/delegation-admission.ts` como propietario del contrato.
Resultado discriminado: `execution`, `management`, `rejected`; nunca un array ambiguamente vacío.
El resultado de ejecución incluye items completos y script canónico, no fragmentos heurísticos.

Gramática admitida de workflow (máximo 64 KiB y 64 llamadas, además de límites específicos de scout):

- Secuencia de `await runs.run("id", { ...literal })` y último `return [await] runs.run(...)`.
- `return [await] runs.all([{ key:"id", ...literal }, ...])` como fan-out estático;
  `key` es obligatorio, único, y cumple `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`.
- Objeto child: `agent` y `task` strings no vacíos; restantes valores solo JSON literal.
- Strings simples, dobles o template SIN interpolación; preservar escapes decodificados.
- Sin variables, spreads, computed keys, getters, llamadas en valores, funciones, bucles,
  condiciones, acceso alternativo a `runs`, duplicación de claves ni statements ajenos.
- Gestión: llamada única `return [await] runs.status("id")`; otras formas se mantienen mediante
  los `action` estructurados que ya soporte el runner. No inventar métodos de gestión.

En single directo, exigir objeto de datos con agente/tarea completos; rechazar mezcla de
`workflowScript` con single/arrays. **Los arrays legacy `tasks`, `steps` y `chain` no se admiten**,
aunque `LEGACY_ITEM_KEYS` los reconozca hoy para inspección. El gateway devuelve
`legacy-delegation-reissue-required` antes de ejecutar; no los traduce silenciosamente.
El padre reemite sin nueva aprobación: `tasks` independientes como `runs.all` con keys explícitas;
`steps/chain` como llamadas `runs.run` en el orden original. Si una tarea usa `{previous}` u otra
sustitución dependiente, el padre espera el resultado real y pasa su valor literal al siguiente
single, sin fabricar salidas ni convertir la cadena en fan-out. Conservar cwd, límites y permisos.
No devolver éxito parcial por aceptar solo los elementos que el escáner reconoce.
Las claves de opciones permitidas
para este gateway quedan cerradas, contrastadas con `pi-subagents` instalado **0.68.0**:

- Child: `agent,task,cwd,context,timeoutMs,maxRuntimeMs,toolTimeoutMs,toolBudget,usageBudget,
  acceptance,agentContract,output,outputMode,outputSchema,skill,model,fast,worktree,baseRef,
  lane,extensionBindings,artifacts,includeProgress,sessionDir,phase,label`; `key` solo en `all`.
- Contenedor de ejecución: las opciones comunes anteriores más `workflowScript,async,
  globalConcurrencyLimit,maxSubagentSpawnsPerRun,preflight,chatProgress,isolation,agentScope`;
  `agent/task` solo para single; opciones exclusivas de child no se elevan por inferencia.
- Metadata Ein: `tdd` y `allowBudgetIncrease`; se consumen por política y se eliminan del payload
  público. `turnBudget` es compatibilidad legacy SOLO si la capacidad probada del runner la admite;
  0.68.0 no la declara en `SubagentParamProperties`, por lo que no se promete su ejecución.
- Gestión estructurada: `action,id,runId,dir,agent,capabilities`; conservar únicamente acciones
  `status/list/get` como consultas en este gate. Control `resume/interrupt` conserva su gate existente
  y binding a un run ya admitido; no se disfraza de consulta ni admite una task nueva.

Valores anidados deben ser JSON literal y cumplir el schema público correspondiente; desconocidas
se rechazan con el nombre exacto, no se pierden silenciosamente. No admitir `share`, `machine`,
`workflowScriptPath`, `workflow`, `runs.host` ni expansión dinámica por efecto colateral.
Si una actualización cambia este schema, parar con diagnóstico y adaptar fixtures explícitas;
no ampliar allowlist automáticamente ni tratar una clave ignorada como garantía aplicada.
No interpretar menciones de nombres de agente dentro de prosa como ejecuciones.

### Gateway y consumidores

`registerToolCallGate` admite al inicio de una ejecución `subagent`, antes de scout, grants,
participantes, acceptance, presupuesto y snapshot. Un rejected devuelve `block:true` y un código
`delegation-shape-unsupported`, con ubicación y campo que no pudo resolverse, sin ejecutar ramas.
Los consumidores existentes de `delegation-shape.ts` leen el resultado admitido; las funciones
públicas de nombres/items no descartan items incompletos ni vuelven a escanear heurísticamente.
Canonicalizar la forma estática admitida permite a `rewriteDelegationTasks` reescribir tareas
sin tocar texto parecido dentro de comentarios, objetos ajenos o expresiones ejecutables.
No confiar solo en WeakMap: si un hook modifica el input, recalcular digest/admisión antes de usarlo.

Permitir una reemisión por el padre en forma soportada; es la misma tarea, no un nuevo permiso.
No autoejecutar el contenido rechazado, no reintentar un child ya iniciado, no emitir grants
en la llamada bloqueada. Si la tarea ya es conocida, no escanear otra vez el repositorio.
Las protecciones del bash hijo y del runner permanecen; este plan no afirma sustituirlas.

## D. Acceptance

- El probe dinámico devuelve rejected y ningún efecto de lanzamiento/grant/persistencia.
- Caso mixto literal+dinámico se rechaza íntegro; no hereda presupuesto de la rama visible.
- Arrays `tasks/steps/chain`, tanto completos como parcialmente legibles, se rechazan sin efectos;
  la reemisión de lectura equivalente conserva orden o fan-out y no consume aprobación nueva.
- Comentarios, regex, template interpolado y objetos señuelo no generan agentes falsos.
- Single, secuencia estática, scout fan-out y status literal conservan comportamiento observable.
- Las tareas llegan byte a byte iguales tras decode/encode de strings legítimos.
- Fixture usa el paquete instalado solo mediante su API pública; cero parches en dependencias.
- El test comprueba efectos de gates y launcher, no solo cantidad de items del parser.

## E. Paquetes cerrados de ejecución

### 05.1 · Admisión pura y distribución del parser

Leer: `ein-pi/agent/lib/delegation-shape.ts`, `tests/delegation-shape.test.ts`,
`installer/scripts/bundle-template.ts`, `ein-pi/agent/lib/cleaner-script-regions.ts` y API instalada
de `pi-subagents` correspondiente al schema `workflowScript` y `runs.run/all/status`.
Crear producción: `ein-pi/agent/lib/delegation-admission.ts`.
Editar producción: `installer/scripts/bundle-template.ts` (añadir import al cierre TypeScript).
Crear `tests/delegation-admission.test.ts` con positivos y negativos de la gramática anterior.
Comando: `bun test tests/delegation-admission.test.ts tests/template-agent-inventory.test.ts`.
Parar si una opción legítima no figura en el schema real: documentar y añadir esa clave exacta,
sin admitir expresiones JS ni ampliar a evaluación dinámica.

### 05.2 · Gateway y consumidores únicos

Leer: salida 05.1, `ein-pi/agent/extensions/internal/ein-tool-call-gate.ts`,
`ein-pi/agent/lib/scout-contract.ts`, `ein-pi/agent/lib/sdd-preflight.ts`.
Editar producción: `ein-pi/agent/lib/delegation-shape.ts`,
`ein-pi/agent/extensions/internal/ein-tool-call-gate.ts` (dos archivos).
Pasos: integrar admisión antes de efectos; rechazar los tres arrays legacy; reutilizar items completos; reescritura canónica;
gestión separada; warning anterior se sustituye por rechazo con remedio, sin falso éxito.
Crear `tests/delegation-admission-gate.test.ts`; ampliar `tests/delegation-shape.test.ts`.
Comando: `bun test tests/delegation-admission.test.ts tests/delegation-admission-gate.test.ts tests/delegation-shape.test.ts`.
Parar ante un side effect previo al gateway y moverlo detrás, sin relajar rechazo.

### 05.3 · Recuperación del transporte y prueba del runner

Leer: `runtime/assets/orchestrator.md`, `runtime/agents/ein-scout.md`,
`tooling/verify-latest-pi-runtime.ts` y los fixtures anteriores.
Editar producción: `runtime/assets/orchestrator.md` (sustituir aviso de drift por reemisión acotada).
Crear `tooling/verify-delegation-admission.ts`: launcher fake que registra intentos y fixture
del runner real sin proveedor ni red cuando su API permita inyectar ejecución.
Comandos: `bun tooling/verify-delegation-admission.ts` y
`bun test tests/delegation-admission-gate.test.ts tests/tdd-apply-delegation-gate.test.ts`.
Si el runner requiere modelo para esa comprobación, informar la limitación; no fabricar un pase
end-to-end ni gastar proveedor sin la autorización del responsable de validación.

### Compatibilidad y reversión

La sintaxis dinámica antes tolerada pasa a necesitar reemisión estática; anunciarlo en el error,
sin abrir una pregunta de aprobación. No modificar checkpoints ni tareas persistidas.
Revertir la admisión como unidad, no dejar consumidores nuevos con parser antiguo.
Los planes 10/11 consumen este gateway; no desarrollar otro parser para sus presupuestos.
