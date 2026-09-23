# 03 · Recuperar la ejecución correcta

Estado: diseño listo para ejecutar; no implementado.
Base: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e` (alpha.9).
Dependencias: 01, 02, 05 y la integración de #452 o su equivalente actual en main.
Manifiesto: //002, //004 y //006. Solo implementar en una rama limpia.

## A. Proposal

Si falla una fase del cambio A, un archivo del cambio B no puede hacerla pasar
por terminada. Tampoco basta con que un borrador no esté vacío. La recuperación
exigirá un recibo de finalización ligado a ejecución, cambio, fase y contenido.

Anclas: `registerDelegationResultHook` y `rememberPhaseSnapshot` en
`ein-pi/agent/extensions/internal/ein-delegation-results.ts`;
`resolveDelegationPhase`, `snapshotPhaseArtifacts`, `reconcilePhaseFailure` y
`formatReconciliation` en `ein-pi/agent/lib/sdd-reconcile.ts`;
`registerToolCallGate` en `ein-pi/agent/extensions/internal/ein-tool-call-gate.ts`;
`registerAgentPromptHook` y `readExplicitSddChange` en las extensiones internas;
`readSddCompletionEvidence` compartido y recibo del plan 02.

Alcance: ejecución de fases SDD, finalización explícita y rescate tras fallo del
runner. Scout conserva #452; no reutilizar su recibo como prueba de fase.
No convertir requisitos editoriales de design en nuevas puertas de lint.
El recibo demuestra qué artefacto se finalizó, no que la solución sea correcta.

Riesgos: ID reutilizado, doble callback, escritura tardía de otro hijo, cierre
del proceso después de escribir pero antes de registrar el recibo y sesiones
antiguas sin la nueva procedencia. Todos tienen salida concreta en C.

## B. Spec

- MUST ligar recuperación a la invocación: Given A y B activos, When falla A
  y solo cambia el artefacto de B, Then A no se convierte en éxito.
- MUST exigir finalización: Given design no vacío pero sin recibo, When falla
  el runner, Then se informa «artefacto parcial disponible», no fase completa.
- MUST recuperar trabajo terminado: Given recibo completo y digest vigente,
  When falla el transporte posterior, Then se conserva la fase y el error original.
- MUST invalidar escrituras posteriores: Given recibo vigente, When cambia el
  artefacto o intent, Then no se rescata desde el recibo anterior.
- MUST aplicar las reglas de cada fase: Given apply parcial, tareas pendientes
  o verify sin recibo fresco de 02, When el hijo solicita complete, Then se rechaza.
- MUST mantener resultados parciales: Given recibo partial|blocked, When termina
  el hijo, Then las evidencias se conservan y la siguiente acción cubre solo la laguna.
- MUST permitir reanudación: Given caída tras finalizar, When se reabre la sesión,
  Then se consulta el recibo persistido y no se ejecuta otra vez la fase terminada.
- MUST ser idempotente: Given el mismo ID/token/digest, When se repite la entrega,
  Then no se consume otro intento ni se sobrescribe una revisión posterior.

## C. Decisions

Crear `shared/sdd/sdd-phase-receipt.ts` y su fachada Pi homónima. La factory
`createPhaseReceiptService({now,newToken,readVerification})` expone
`beginPhaseRun(input)`, `finishPhaseRun(input)`, `readPhaseRun(input)` y
`assessPhaseRecovery(input)`. Nueva composición Pi `sdd-phase-runtime.ts` inyecta
reloj/UUID y el lector de 02. Shared no ejecuta procesos ni importa implementaciones Pi.

Begin recibe `{cwd,change,phase,toolCallId}` solo desde el adaptador padre.
Valida raíz real y nombre seguro; genera nonce UUID; registra de forma exclusiva
`<changePath>/.phase-runs/<sha256(toolCallId)>/launch.json` con
`{version:1, toolCallId, nonce, root, change, phase, artifact, intentKey,
startedAt, initialArtifactSha256}`. Para scope se permite crear su directorio
ya explícitamente autorizado; no se crea un cambio si no hay un nombre inequívoco.
La ruta del artefacto sale del mapa canónico de fases, nunca del modelo.

El normalizador padre acepta una única fase y un único destino explícito.
Reutiliza las formas de `readExplicitSddChange`, pero rechaza coincidencias
contradictorias: reunir todos los marcadores change/intent_work y rutas de change
del task, exigir que indiquen el mismo nombre. No escoger la primera coincidencia.
Para workflowScript, usar la admisión de 05. Solo un child admitido y un destino
inequívoco reciben este manifest mediante `rewriteDelegationTasks`. Workflows
estáticos admitidos con varios hijos conservan su ejecución, pero esta versión
no les atribuye rescate automático de fase. Una forma dinámica rechazada por 05
no se vuelve a admitir aquí ni obtiene recibos inventados.

Begin se ejecuta después de los gates existentes y justo antes del lanzamiento.
Añade al task una línea reservada `ein_phase_run: <JSON compacto>` con version,
toolCallId, change, phase y nonce. No añadir campos desconocidos a subagent.
Re-normalizar el mismo toolCallId reutiliza el manifest si coincide; si no,
devuelve conflicto sin sobrescribirlo. Conservar la referencia en details de la
respuesta del padre, incluidos resultados fallidos; no abrir un almacén global.

El child registra `ein_sdd_phase_complete` desde `ein-phase-context-child.ts`.
Solo acepta `{status:"complete"|"partial"|"blocked", reason?:string}` y utiliza
el contexto ligado del manifest, no IDs, rutas, hash o cambio del modelo.
Antes de escribir, comprueba intent vigente, lectura segura del artefacto y lint.
Para apply exige además estado complete y cero tareas pendientes; para verify
exige outcome pass y freshness current de 02; para close valida summary y
readiness excepto el acto de archivar. No llamar a closeChange desde el hijo.
Para scope/map/design/tasks, complete es la declaración explícita de finalización
del ejecutor, contrastada con su contrato mecánico; no certificar calidad semántica.

El productor calcula el digest y escribe atómicamente `completion.json` junto
al manifest: `{version:1, toolCallId, nonce, change, phase, artifactSha256,
intentKey, status, finishedAt, reason?, verificationReceiptSha256?}`.
Verify referencia el digest del recibo de 02; no replica checks, superficie ni
otro formato de verificación. Repetir exactamente la finalización es idempotente;
otro digest para el mismo complete se rechaza y requiere nueva invocación.
Write/Edit ordinarios nunca generan un recibo por inferencia. El guard child
impide escribir `.phase-runs/**` fuera de esta herramienta.

El prompt compartido inyecta: finalizar solo cuando se haya terminado el trabajo,
antes del mensaje final; partial/blocked conservan progreso sin afirmar éxito.
Añadir la tool a las allowlists de las siete fases. No duplicar siete contratos.
Si la invocación es ad-hoc sin cambio, no ofrecer ni exigir el recibo.

**Consumo.** Sustituir el snapshot global del hook por la referencia de begin.
En resultado satisfactorio, adjuntar finalización observada; ausencia de recibo
se representa como ejecución terminada con finalización sin confirmar.
En error, rescatar únicamente complete con coincidencia de todas las claves,
digest actual e intent. El texto dice «artefacto finalizado y recuperado» y conserva
el error; no afirma haber probado semánticamente scope/design.

Sin recibo, conservar el artefacto como parcial y orientar a lectura acotada del
archivo y del resultado existente. No ordenar rehacerlo ni marcar complete.
Si ya se escribió el artefacto y el hijo sigue disponible, una continuación
acotada puede revisarlo y finalizar; si terminó, una nueva invocación debe revisar
solo ese artefacto antes de producir su propio recibo. Nunca firmar retroactivamente
con el ID fallido. La misma política se aplica al restaurar el registro de tool.

**Claude.** No prometer rescate del transporte de Task: no existe ese hook Pi.
La traducción de las fases nuevas retira únicamente la tool Pi de su allowlist
y su instrucción ligada de finalización; mantiene la continuidad por artefactos
y el recibo de verificación compartido de 02. No inventar un alias Bash inexistente.
El recibo de fase puede leerse como procedencia histórica; Claude no lo fabrica.

Compatibilidad: los runs anteriores sin manifest se degradan a evidencia parcial;
no migrarlos asignándoles un toolCallId inventado. Fases normales de sesiones
antiguas pueden continuar; solo se pierde su rescate automático no demostrado.
Rollback: retirar productor+consumidor juntos y conservar sidecars; jamás restaurar
la búsqueda global por mtime como fallback cuando un recibo falla.

## D. Acceptance

Pruebas negativas: artefacto único de B, borrador de A, dos hijos de igual fase,
nonce/ID cambiado, symlink, tarea con dos destinos, digest posterior, intent nuevo,
apply parcial, verify unbound/stale, report rehecho, tool_result repetido.
Controles positivos: complete mismo run, pérdida de transporte posterior,
restauración desde details persistidos y partial que conserva su motivo.
Llamar al hook real y observar isError/content/details; no probar solo la librería.
Invocar el child con un contexto ligado y comprobar que genera el recibo antes
de simular la caída; ninguna prueba escribirá completion.json a mano como único positivo.

## E. Execution packets

### 03A · Contrato y almacenamiento

- edit: `shared/sdd/sdd-phase-receipt.ts`, `ein-pi/agent/lib/sdd-phase-receipt.ts`
  y `ein-pi/agent/lib/sdd-phase-runtime.ts` (nuevos).
- tests: nuevo `tests/sdd-phase-receipt.test.ts`.
- steps: begin/finish/read/assess; paths seguros, nonces, idempotencia y referencia 02.
- verify: `bun test tests/sdd-phase-receipt.test.ts`
- stop: recuperación solo para la identidad completa, sin búsqueda global ni mtime.

### 03B · Cableado padre e hijo

- edit: `ein-pi/agent/extensions/internal/ein-delegation-results.ts`,
  `ein-pi/agent/extensions/internal/ein-tool-call-gate.ts`,
  `ein-pi/agent/extensions/internal/ein-phase-context-child.ts`,
  `ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts`.
- tests: nuevo `tests/phase-completion-hook.test.ts`; ampliar `tests/sdd-reconcile.test.ts`.
- steps: manifest tras gates, task marker, tool child, protección de sidecars,
  details persistidos y rescate por receipt; conservar el recibo scout de #452.
- verify: `bun test tests/phase-completion-hook.test.ts tests/sdd-phase-receipt.test.ts tests/scout-receipt.test.ts`
- stop: hook real rechaza B y rescata A terminado después de desconexión simulada.

### 03C · Retirar inferencia anterior y registrar consumidor

- edit: `ein-pi/agent/lib/sdd-reconcile.ts`, `ein-pi/agent/lib/subagent-envelope-contract.ts`.
- tests: adaptar `tests/sdd-reconcile.test.ts`, `tests/subagent-envelope-contract.test.ts`.
- steps: conservar resolución de fase; retirar snapshot global como fuente de
  aceptación; hacer el formateo honesto; declarar el consumidor nuevo en inventario.
- verify: `bun test tests/sdd-reconcile.test.ts tests/subagent-envelope-contract.test.ts`
- stop: ningún camino de rescate acepta un artefacto solo por existir o ser reciente.

### 03D · Allowlists y traducción, primera mitad

- edit: `runtime/agents/sdd-scope.md`, `runtime/agents/sdd-map.md`,
  `runtime/agents/sdd-design.md`, `ein-cc/sync.ts`.
- tests: `tests/agent-tools-contract.test.ts`; añadir traducción a los fixtures existentes.
- steps: tool en allowlist Pi; traducción Claude omite la tool exclusiva sin prometerla.
- verify: `bun test tests/agent-tools-contract.test.ts tests/style-parity-claude.test.ts`
- stop: ambas superficies compilan; no se anuncia un comando inexistente.

### 03E · Allowlists restantes y contrato de recuperación

- edit: `runtime/agents/sdd-tasks.md`, `runtime/agents/sdd-apply.md`,
  `runtime/agents/sdd-verify.md`, `runtime/agents/sdd-close.md`.
- tests: `tests/agent-tools-contract.test.ts`, `tests/template-agent-inventory.test.ts`.
- steps: completar allowlists; probar fase legacy/ad-hoc sin recibo y paquete instalado.
- verify: `bun test tests/agent-tools-contract.test.ts tests/template-agent-inventory.test.ts tests/prompt-budget.test.ts`
- verify: `bun run typecheck`
- stop: siete fases ligadas; ad-hoc conserva su vía; no se aumentan presupuestos de prompt.
