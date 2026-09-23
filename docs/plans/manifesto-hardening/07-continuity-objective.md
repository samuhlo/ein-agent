# 07 · El objetivo sobrevive a respuestas y relevos

Estado: diseño para ejecución; no implementado ni cambio SDD activo.
Base inspeccionada: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e`.
Depende de: ninguna implementación de 06 u 08; se integra antes de 06.
Responsable de ejecución: ejecutor acotado; las decisiones siguientes están cerradas.

## A. Propuesta

El checkpoint guardará el objetivo semántico del trabajo, no el último mensaje.
«Sí, continúa» seguirá siendo una respuesta y no reemplazará «Exportar contactos».
Un objetivo nuevo corto, incluso «Sí», será válido si se fija mediante la acción semántica explícita.
No se clasificarán respuestas mediante listas de palabras, longitud o regex.

Hoy `continuity-handoff-lifecycle.ts:151,180-183` copia cualquier input admisible a `objective`.
Los productores son `ein-continuity.ts:78-80` y `continuity-runner.ts:74-79,99`.
El consumidor del dato perdido es `continuity-resume-brief.ts:95`.
Reproducción: `/private/tmp/ein-manifest-continuity-probe.ts`, apartado `objective`.
Manifiesto: §§000, 003, 005 y 006.

No se crea `.ein/work-objective.json` ni un motor de almacenamiento genérico.
La autoridad continúa siendo el checkpoint existente; `intent.md` aporta el objetivo cuando hay acuerdo.
No se cambia la autoridad de autorización de apply, Git, ni la verificación de cierre.

## B. Especificación por escenarios

- Dado un objetivo explícito A, cuando llegan «sí», una pregunta o una corrección parcial, entonces `captureInput` no cambia A.
- Dado A, cuando el coordinador registra el nuevo objetivo B con la revisión vigente, entonces B sustituye A y conserva procedencia.
- Dado el objetivo literal «Sí» registrado por esa acción, entonces se acepta igual que cualquier objetivo admisible.
- Dado un acuerdo confirmado, cuando `publish`/`record` termina, entonces el objetivo del checkpoint procede de `material.objective` y `materialKey`.
- Dado un checkpoint v1, cuando se abre con la versión nueva, entonces se conserva su objetivo marcado como legado, sin inventar confirmación.
- Dado Git cambiado tras una caída, cuando se rehidrata, entonces no se borra el objetivo por invalidar progreso o verificación.
- Dadas dos actualizaciones sobre la revisión R, cuando una publica R2, entonces la otra devuelve conflicto; no sobrescribe R2.
- Dado un objetivo inválido o demasiado grande, cuando se intenta fijar, entonces se conserva el anterior y se informa del motivo.

## C. Decisiones y contrato cerrado

1. Añadir `ContinuityCheckpointV2` en el módulo existente `continuity-checkpoint.ts`.
   Mantener los campos v1 y añadir `objectiveEvidence`; `version` pasa a 2 para nuevas escrituras.
   `objectiveEvidence.kind`: `legacy`, `unknown`, `pi-observed`, `claude-attested`, `intent` o `intent-draft`.
   Para observado/atestiguado: `requestId` no vacío y `recordedAt` ISO.
   Para intent: `work`, `materialKey` y `agreementRevision`; draft añade la misma identidad con `kind:intent-draft`.
   `unknown` identifica únicamente el texto genérico del arnés; no un objetivo del usuario.
2. Exportar `ContinuityCheckpoint = ContinuityCheckpointV1 | ContinuityCheckpointV2`.
   Validar primero el hash y forma originales de v1; no recalcular su hash como si ya fuera v2.
   `readContinuityCheckpoint` devuelve el registro leído con su revisión original.
   Una escritura nueva deriva v2 y hace CAS contra esa revisión original.
   `legacy` conserva exactamente el objetivo válido de v1; no se intenta deducir si era un «sí» accidental.
3. Añadir en `continuity-handoff-lifecycle.ts` `setObjective(request, expectedRevision)`.
   `request = { objective, evidence }`; la revisión esperada es `absent` o el hash observado.
   Retorno cerrado: `set | unchanged | conflict | invalid | unavailable`.
   Mantener máximo 512 bytes y el filtro de secretos/rutas privadas ya existente.
   El setter no trunca objetivos ni altera los demás hechos del checkpoint.
4. Añadir `setContinuityObjective(cwd, request, expectation)` en `continuity-objective.ts`.
   Es una fachada de la derivación y escritor existentes, no otro almacén.
   El lifecycle y los productores de intent llaman a esa misma función.
   Antes de cada refresh, releer objetivo/procedencia de disco y mantener CAS; no reutilizar una copia antigua para sobreescribirlos.
5. `captureInput` queda como observación efímera de la petición para el adaptador.
   No modifica `facts.objective`, no extrae objetivos y no persiste conversación en el checkpoint.
   Eliminar la expansión `...(capturedInput ... objective)` de `refreshOnce`.
6. Separar la hidratación del objetivo de la frescura del trabajo.
   Un checkpoint válido puede aportar objetivo aunque cambie Git; tareas/resultado de pruebas siguen rederivándose.
   Si cambió el cambio SDD seleccionado, no arrastrar un objetivo vinculado a otro `work`.
   En ese caso usar el acuerdo del nuevo cambio o `unknown`, dejando el checkpoint anterior intacto.
7. Pi publica la herramienta `ein_continuity_objective` en `ein-continuity.ts`.
   Parámetros: `{ objective, expectedRevision }`; el adaptador obtiene `requestId` del último mensaje humano real.
   La herramienta es el productor semántico usado por el coordinador al reconocer una nueva tarea o corrección de objetivo.
   No toma un ID de respuesta inventado de los parámetros del modelo.
8. Claude publica `ein-cc-sdd objective show` y `ein-cc-sdd objective set < objective.json`.
   JSON: `{ objective, expectedRevision, requestId, requestText }`.
   `requestId/requestText` son una atestación del coordinador, con procedencia `claude-attested`, no un recibo Pi.
   `show` entrega revisión/objetivo/procedencia y no escribe.
   El CLI no requiere que exista un cambio SDD ni ejecuta `preflight`.
9. Productores canónicos: `runIntentDiscovery` tras publicar un acuerdo confirmado y `runIntentCommand` tras `record`.
   Pasan el `material.objective` leído del acuerdo efectivamente escrito; no una segunda interpretación.
   Un fallo al actualizar continuidad devuelve aviso visible, sin afirmar que se deshizo el acuerdo ya publicado.
   El siguiente refresh reintenta desde el acuerdo confirmado seleccionado, con revisión actual; nunca desde texto de usuario.
10. `intent-draft` está previsto para 06, pero 07 no inicia ni guarda borradores.
    Un objetivo provisional no autoriza implementación y se presenta como provisional en el brief.
    La futura cancelación de 06 invalida esa referencia, no elimina objetivos de otro trabajo.
11. El brief incluye `objectiveEvidence` para v2; v1 se presenta como legado.
    El texto fiable exige releer el acuerdo fuente cuando exista; no trata el objetivo como autorización.
    Las lecturas antiguas de v1 siguen cubiertas; una versión vieja puede rechazar v2, nunca reinterpretarlo silenciosamente como v1.
12. Mantener el escritor atómico de `continuity-checkpoint-store.ts`: lock exclusivo, CAS, temp, fsync y rename.
    No introducir otra política de bloqueo; un lock abandonado conserva el fallo explícito actual.
    Cambios de contrato en lectores estrictos se hacen en el mismo paquete que v2.

## D. Aceptación verificable

- El probe reproduce el defecto antes del cambio y conserva A después, sin prohibir B corto.
- Pi y Claude producen el mismo `objective` y distinto `objectiveEvidence.kind` acorde a su fuente real.
- Reiniciar con Git modificado conserva objetivo y no asciende verificación obsoleta a correcta.
- Una carrera CAS no pierde una corrección reciente.
- Checkpoints v1 válidos siguen legibles; v1 corrupto no se «migra» a bueno.
- El CLI adhoc no crea `openspec/changes/`.
- Una actualización de intent fallida informa qué escritura sí ocurrió.
- No se escribe en hogares instalados durante pruebas; usar fixtures temporales.

## E. Paquetes de ejecución

### 07.1 · Contrato v2 y lectores

Leer/editar exactamente: `ein-pi/agent/lib/continuity-checkpoint.ts`, `ein-pi/agent/lib/continuity-checkpoint-store.ts`, `ein-pi/agent/lib/continuity-readiness.ts`, `ein-pi/agent/lib/continuity-resume-brief.ts`.
Crear/editar pruebas: `tests/continuity-checkpoint.test.ts`, `tests/continuity-checkpoint-store.test.ts`, `tests/continuity-readiness.test.ts`, `tests/continuity-resume-brief.test.ts`.
Pasos: introducir unión v1/v2; verificar hashes por versión; admitir procedencia exacta; proyectarla en brief.
Antes: v1 sin procedencia. Después: v1 legible y nuevas escrituras v2 con procedencia.
Comando: `bun test tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts tests/continuity-readiness.test.ts tests/continuity-resume-brief.test.ts`.
Parar si una lectura v1 cambia el disco o si CAS usa la revisión convertida en vez de la persistida.

### 07.2 · Setter y refresh sin pérdida semántica

Leer/editar: `ein-pi/agent/lib/continuity-handoff-lifecycle.ts`, `shared/ports/continuity.ts`.
Crear: `ein-pi/agent/lib/continuity-objective.ts`.
Editar: `shared/README.md`; declarar el puente `shared/ports/continuity.ts::../../ein-pi/agent/lib/continuity-objective.ts` con dueño y retirada.
Actualizar ese único permiso en `tests/architecture-boundaries.test.ts`; `continuity-objective.ts` pertenece a Pi y no requiere fachada shared/sdd.
Leer sin editar: el contrato/escritor del paquete 07.1 y `ein-pi/agent/lib/continuity-sdd-facts.ts`.
Editar: `tests/continuity-handoff-lifecycle.test.ts`; crear `tests/continuity-objective.test.ts`.
Pasos: añadir setter; quitar objetivo automático de `captureInput`; rehidratar objetivo independiente de stateRef; releerlo antes del CAS.
Pruebas: A→«sí» conserva A; setter→«Sí» acepta; dos escritores; stateRef cambiado; selección SDD distinta.
Comando: `bun test tests/continuity-handoff-lifecycle.test.ts tests/continuity-objective.test.ts tests/architecture-boundaries.test.ts`.
Parar si se necesita un segundo archivo de autoridad o si se vuelve a clasificar lenguaje humano mediante regex.

### 07.3 · Productores Pi

Leer/editar: `ein-pi/agent/extensions/ein-continuity.ts`, `ein-pi/agent/lib/intent-discovery.ts`.
Editar pruebas: `tests/ein-continuity-extension.test.ts`, `tests/intent-discovery.test.ts`.
Pasos: registrar herramienta semántica; asociar mensaje humano real; publicar objetivo desde acuerdo confirmado; informar fallo secundario.
Antes: todos los mensajes escriben objetivo. Después: solo setter o acuerdo canónico lo hacen.
Comando: `bun test tests/ein-continuity-extension.test.ts tests/intent-discovery.test.ts`.
Parar si se fabrican recibos o si un error secundario presenta una confirmación ya guardada como no guardada.

### 07.4 · Productores Claude

Leer/editar: `ein-cc/sdd-cli/cli.ts`, `ein-cc/sdd-cli/intent-command.ts`.
Crear: `ein-cc/sdd-cli/objective-command.ts`.
Leer: `shared/ports/continuity.ts`; crear `tests/claude-continuity-objective.test.ts`.
Pasos: añadir despacho `objective`; leer stdin solo en `set`; validar CAS y atestación; enlazar `record` con setter.
Comando: `bun test tests/claude-continuity-objective.test.ts tests/claude-intent-lifecycle.test.ts`.
Probar mediante subprocess del CLI en directorio temporal, no solo invocando la función.
Parar si el CLI necesita crear preflight, si registra una atestación como `pi-observed`, o si omite la revisión esperada.

### 07.5 · Descubrimiento y empaquetado

Leer/editar: `runtime/assets/orchestrator.md`, `ein-cc/CLAUDE.adapter.md`, `ein-cc/CLAUDE.md`, `installer/src/core/cc-payload-inventory.ts`.
Añadir una instrucción breve del productor semántico sustituyendo la instrucción que trate el último input como objetivo, si existe.
Incluir `ein-cc/sdd-cli/objective-command.ts` en el inventario exacto consumido; verificar dependencias en staging aislado.
Regenerar contenido Claude con `compileClaudeSurface()` de `ein-cc/sync.ts` y aplicar solo el archivo generado del repo; no ejecutar instalación.
Comandos: `bun -e 'import {checkGeneratedParity} from "./ein-cc/sync.ts"; checkGeneratedParity()'` y `bun run typecheck`.
Repetir únicamente los tests afectados por ajustes finales y `git diff --check`.
Entrega esperada: cambio revisable con fixtures v1/v2, resultados del probe corregido y límites de la migración declarados.

## Precisiones verificadas durante la implementación · 22 de septiembre

- La herramienta Pi permite consultar objetivo/revisión antes de set; así el
  coordinador obtiene un expectedRevision real sin inventarlo.
- La procedencia manual puede guardar observedAgreementRevision, calculada por
  el setter. Refresh conserva una corrección manual ante el mismo acuerdo, pero
  adopta una confirmación nueva; esto permite reintentar una publicación fallida.
- Consulta, setter y lifecycle usan la misma selección incluso antes de preflight.
  Bootstrap admite únicamente el continuity.json válido del cambio, no cualquier
  archivo que acompañe a intent.md.
