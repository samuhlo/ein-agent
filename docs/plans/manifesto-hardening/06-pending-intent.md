# 06 · El borrador de intent atraviesa el relevo

Estado: diseño para ejecución, sin implementar ni SDD activo. Base: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e`.
Dependencias: 07 para objetivo/procedencia; integrar la admisión de delegaciones de 05 en 06.4 sin volver a interpretar el workflow; 08 no es requisito.
No crear artefactos de una fase SDD para ejecutar este documento.

## A. Propuesta

Guardar la entrevista en curso como estado local neutral respecto al runtime.
Si Pi se agota después de acordar «solo filas filtradas», Claude recuperará esa decisión y preguntará únicamente lo pendiente.
El borrador no concede permiso de implementación y no crea un cambio SDD.

Hoy `intent-discovery.ts:113-118` escribe `intent.md` solo tras confirmar o si ya había acuerdo canónico.
La primera entrevista reside en custom entries de la sesión Pi (`:35-47`).
La misma sesión Pi puede recuperarla; una sesión nueva o `ein-cc-sdd intent show` no la ve.
`continuitySddFacts()` exige tareas y no proyecta el borrador.
El probe del audit confirma decisión resuelta, intent canónico ausente y CLI Claude `kind:absent`.
Manifiesto: §§003, 005 y 006; no se afirma pérdida de un acuerdo ya confirmado.

La autoridad del borrador será `.ein/intent-drafts/<work>.json`.
La autoridad del acuerdo ejecutable seguirá siendo `openspec/changes/<change>/intent.md`.
Es un almacén de borradores concreto, no un nuevo motor SDD ni un historial de conversación.

## B. Especificación por escenarios

- Dada una ronda con una decisión resuelta y otra pendiente, cuando se abre Claude, entonces conserva la respuesta literal, su ID y las ramas pendientes.
- Dada la misma transición en Claude, cuando se abre una sesión Pi nueva, entonces continúa desde la misma revisión.
- Dado un recibo Pi observado, cuando cruza el relevo, entonces mantiene su ID/source; Claude no lo convierte en una firma propia.
- Dada una respuesta atestiguada por Claude, cuando Pi la lee, entonces conoce esa procedencia y no la presenta como evento observado por Pi.
- Dado un borrador pending, cuando el router evalúa apply o scope, entonces sigue bloqueado aunque exista un intent canónico anterior confirmado.
- Dada una respuesta de ronda, cuando se intenta confirmar sin revisión final nueva, entonces el motor la rechaza como ahora.
- Dadas dos sesiones sobre revisión R, cuando una publica R2, entonces la otra recibe conflicto sin perder ninguna respuesta observada.
- Dada una caída durante promoción a intent.md, cuando se solicita recuperación, entonces se completa la publicación exacta o se declara conflicto, sin pedir otro acuerdo ya obtenido.
- Dado un ensayo que estaba running al caer, cuando se reanuda, entonces no se relanza ni se declara correcto sin recuperar evidencia.
- Dado un proyecto sin borradores y sin SDD, cuando solo se conversa, entonces no se crea estado nuevo.

## C. Decisiones y contrato cerrado

1. Nuevo registro `IntentDraftV1` en `shared/sdd/intent-draft.ts`:
   `{schemaVersion:1, revision, work, agreement, response?, evidence?, questionnaireBindings, publication}`.
   `agreement` usa el `IntentAgreement` existente, incluidos árbol, materialKey, history y revision de ronda.
   La revisión exterior es SHA-256 del snapshot; no sustituye la revisión de ronda usada por los recibos.
   `response` preserva `id,text,source,revision,cancelled`; no regenera IDs al hidratar.
   `evidence` conserva el contrato actual `IntentEvidence`, autorización, resultado acotado y estado.
2. `questionnaireBindings` guarda toolCallId, revisión y los índices/fingerprint de preguntas de cada llamada pendiente.
   Se escribe antes de invocar el selector; recibir/cancelar actualiza respuesta y bindings atómicamente.
   No inferir consentimiento de la mera existencia del binding ni de que el selector terminara.
   Mantener la semántica actual de tandas, respuestas parciales y cancelación.
3. Escritor local `shared/sdd/intent-draft-store.ts`; no crear `shared/runtime/json-record-store`.
   API: `readIntentDraft(root,work)`, `listIntentDrafts(root)`, `transactIntentDraft(root,work,expectedRevision,transition,ports)`.
   Máximo 256 KiB por snapshot, 32 borradores en listado automático y 4 bindings pendientes por ronda.
   Exportar `isSafeDraftWork` en intent-draft con la regex de work de validateAgreement; validar ancestros sin symlink y JSON cerrado; directorio 0700 y archivos 0600.
   Lock exclusivo por work, CAS dentro del lock, temp propio, fsync, rename y verificación de publicación.
   `IntentRuntimePorts = {admission,now,newId,publishObjective}` es dependencia explícita, sin lookup global ni proceso en shared.
   `admission.check(root)` devuelve `{status:isolated|not-git|rejected,root,reason?}`; el writer exige root coincidente y revalida mediante ese callback bajo lock.
   `now/newId` suministran reloj/IDs; `publishObjective` recibe el material y procedencia ya publicados y devuelve éxito o aviso secundario.
   Firma del callback: `publishObjective({objective,work,materialKey,agreementRevision,kind}) -> {status:updated}|{status:warning,code}`; kind es `intent|intent-draft`.
   Crear adaptador `ein-pi/agent/lib/intent-draft-runtime.ts`: `createIntentDraftRuntime(root,{mutating})` implementa esos puertos.
   Solo con mutating inicializa exclusiones mediante `ensureEinGitignore`; su admission ejecuta Git para verificar que el directorio no está tracked y sí ignorado.
   Shared nunca importa ese adaptador, llama Git ni inicializa gitignore; sin puerto de admisión una mutación falla explícitamente.
   Claude obtiene el adaptador por `shared/ports/intent.ts`, puente declarado al archivo Pi anterior; Pi lo importa localmente.
   Usar el escritor de checkpoint como referencia; duplicación local pequeña preferida a una abstracción nueva.
4. La máquina de decisiones será la misma en Pi y Claude.
   Mover implementación actual de `intent-discovery.ts` e `intent-evidence.ts` a `shared/sdd/`; dejar reexports Pi.
   Sustituir la dependencia de tipo ExtensionContext por una interfaz mínima `{cwd,sessionManager:{getBranch}}`.
   No reescribir reglas de confirmación, frontier, materialKey, authorization o evidence durante el traslado.
   El almacenamiento neutral es la autoridad; las custom entries Pi quedan como proyección compatible.
5. `runIntentDiscovery` conserva los cuatro argumentos existentes y recibe `IntentRuntimePorts` como quinto argumento explícito para mutaciones.
   Ampliar `IntentRequest` con `expectedRevision` de draft y `Snapshot` con `draftRevision`; status, propose y recibos devuelven esa revisión exterior.
   Pi expone el campo en `ein_intent`; los observadores internos hacen read+CAS y verifican además la revisión de ronda.
   Carga draft/canónico, ejecuta las transiciones existentes y publica snapshot antes de emitir la proyección Pi.
   Observación de respuesta y resultado de ensayo tienen APIs hermanas `observeIntentResponse` y `observeIntentEvidence` bajo el mismo CAS.
   No editar el draft directamente desde un adaptador ni escribir una respuesta después de devolver su recibo.
   Traslado de 07: sustituir la llamada directa al setter Pi por `ports.publishObjective`; el adaptador la enlaza con `setContinuityObjective`.
6. Promoción/invalidez entre dos archivos se resuelve con `publication` durable, no fingiendo atomicidad entre renames.
   Valores: `none`, `promoting`, `published`, `invalidating`; incluye revisión canónica esperada y acuerdo objetivo exacto.
   Al reabrir: publicar primero draft pending/invalidating; después actualizar intent.md pendiente si existía; finalizar journal.
   Al confirmar: guardar revisión final y recibo fresco en draft/promoting; escribir intent.md; marcar published con su revisión.
   El gate compartido bloquea pending/promoting/invalidating antes de confiar en un intent.md viejo.
   Crear `readIntentAdmission({root,work,changeDir,requiresCanonical})` en `shared/sdd/intent-admission.ts` y fachada Pi homónima.
   Devuelve `{admitted,state,reason?,agreement?,draftRevision?}`; state usa absent/confirmed/pending/cancelled/invalid y solo admite confirmado coherente o ausencia legacy permitida.
   Draft pending/cancelled/publicación intermedia, corrupción o desacuerdo de revisiones veta el canónico anterior; ausencia de draft conserva la compatibilidad existente.
   El lector recibe changeDir resuelto: no importa routing-core, ejecuta Git ni escribe; usa isSafeDraftWork local para evitar ciclos. Un nombre legacy admitido por el router pero fuera de esa gramática no busca draft y conserva su admisión canónica anterior.
   `resolveSddStatus` y `readSddCompletionEvidence` consumen esa misma admisión; summary/reconcile/close no reimplementan precedencia de archivos.
   El cierre mantiene el lock por work del draft durante su última admisión y publicación; el escritor de reapertura usa ese mismo lock.
   Una publicación sin `change` permanece en el borrador: confirmar una conversación no crea SDD por sí solo.
7. Recuperación explícita `recoverIntentDraft(root,work,expectedRevision)`.
   Si el canónico coincide exactamente con el objetivo del journal, finalizar de forma idempotente.
   Si sigue en la revisión previa esperada, terminar esa misma publicación autorizada.
   Si tiene otra revisión/materialKey o está ilegible, devolver conflicto; no sobreescribirlo ni elegir el más reciente por fecha.
   No expirar locks ni romperlos automáticamente por PID/antigüedad; informar bloqueo concreto.
8. Migración de sesiones anteriores: si no existe draft, Pi puede importar sus custom entries validadas al reanudar esa sesión.
   Publicar con expectativa `absent`; si otra sesión ganó, recargar y comparar, no fusionar respuestas por orden temporal.
   Si existe intent.md confirmado sin draft, seguir aceptándolo y no crear borrador en una lectura.
   La primera reapertura crea draft con `baseCanonicalRevision`; no degrada acuerdos antiguos por mera instalación.
   No existe recuperación automática de una sesión Pi antigua que nunca vuelva a abrirse: declarar ese límite.
9. Si `evidence.state=running` tras un relevo, mostrar `outcome-unavailable` como condición de recuperación.
   Preservar el ID/packet original y buscar resultado solo por identificador/artifact ya observado.
   Una respuesta de producto no sustituye el resultado del ensayo; un recibo huérfano no certifica ejecución.
10. Pi: hidratar al `session_start` y antes de la primera lectura de intent.
    Selección: work explícito; después work de `objectiveEvidence` de 07; después único draft pendiente.
    Varios drafts sin selección devuelven `ambiguous` con work IDs, sin elegir el más reciente.
    Los handlers input, ask_user_question y subagent de `ein-intent-discovery.ts` escriben mediante las APIs observadoras.
    `status` solo lee salvo la migración explícita de sesión antigua; no inicia SDD ni revive ensayo.
11. Claude: ampliar el comando existente, no crear otro binario.
    `ein-cc-sdd intent <work> draft-show` y `draft-list` exponen revisión/material/pendientes sin escribir.
    `draft-propose`, `draft-answer`, `draft-review`, `draft-confirm`, `draft-cancel`, `draft-recover` leen JSON por stdin.
    Toda mutación exige `expectedRevision` (`absent` únicamente al crear); answer/review/confirm incluyen revisión de ronda.
    `draft-answer` crea ID nuevo con source `claude-coordinator` y devuelve el ID persistido.
    `draft-confirm` consume una respuesta NUEVA posterior al `draft-review` vigente; `confirmed:true` solo no basta.
    El `record` antiguo mantiene su entrada para peticiones completas, pero rechaza omitir un draft pending y usa el mismo publicador.
12. Handoff consume el draft seleccionado sin copiar conversación.
    07 recibe `material.objective` con kind `intent-draft`, work, materialKey y revisión; no lo llama confirmado.
    El checkpoint resume decisiones pendientes dentro de su límite y conserva la referencia de procedencia.
    El brief exige leer el draft desde su ruta relativa antes de continuar; no depende de incluir todas las respuestas en 12 KiB.
    `mode:adhoc` sigue siendo correcto hasta que exista un cambio SDD canónico.
13. Cancelar conserva tombstone y procedencia; no borra el canónico anterior ni objetivos de otro work.
    Lecturas `published` verifican igualdad con canónico; discrepancia es recuperación pendiente, no aprobación implícita.
    Datos corruptos/desconocidos no se reemplazan por un acuerdo vacío.

## D. Aceptación verificable

- Pi→Claude→Pi mantiene mismos IDs, respuestas, estado del árbol y materialKey en fixtures con dos rondas.
- No aparece `openspec/changes/<work>` antes de confirmación vinculada a un change.
- La nueva sesión no repite la pregunta ya resuelta y no puede confirmar con su respuesta anterior.
- Un record CLI no salta el draft abierto; el router bloquea canónico viejo durante reapertura/promoción.
- Tras publicar invalidating y caer antes de tocar intent.md, status y close reales bloquean el canónico confirmado anterior, también con --force.
- Fallos en cada frontera de publicación recuperan de forma idempotente o dan conflicto explícito.
- Un rechazo CAS conserva en la sesión origen la respuesta no publicada para reintento identificado; no anuncia recibo persistido.
- El brief no incorpora secretos ni transcript; el draft privado conserva las respuestas literales necesarias.
- Prueba comportamental opcional con modelos configurados solo después de pasar las pruebas deterministas; evidencia saneada.

## E. Paquetes de ejecución

### 06.1 · Contrato y persistencia del borrador

Crear: `shared/sdd/intent-draft.ts`, `shared/sdd/intent-draft-store.ts` y sus reexports puros `ein-pi/agent/lib/intent-draft.ts`, `ein-pi/agent/lib/intent-draft-store.ts`.
Leer: `shared/sdd/intent-agreement.ts`, `ein-pi/agent/lib/continuity-checkpoint-store.ts`.
Crear: `tests/intent-draft-store.test.ts`; probar CAS, symlinks, límites, error tras rename y lecturas sin creación.
Comando: `bun test tests/intent-draft-store.test.ts`.
Parar si se borran respuestas para entrar en presupuesto o se construye un almacén genérico.

### 06.1b · Fachadas y frontera instalable

Crear: `ein-pi/agent/lib/intent-draft-runtime.ts`, `shared/ports/intent.ts`.
Editar: `shared/README.md`, `ein-pi/agent/lib/gitignore.ts` para `.ein/intent-drafts/`.
El puerto reexporta contratos/store y `createIntentDraftRuntime`; añadir el motor al puerto solo después del traslado 06.2; declarar motivo, dueño y retirada del puente.
Editar `tests/architecture-boundaries.test.ts`: autorizar solo `shared/ports/intent.ts::../../ein-pi/agent/lib/intent-draft-runtime.ts`.
Comando: `bun test tests/architecture-boundaries.test.ts tests/intent-draft-store.test.ts`.
Verificar overlay temporal de las fachadas homónimas y enlace de exports; no añadir excepciones para imports de shared/sdd hacia Pi.

### 06.2 · Un único motor compartido

Crear: `shared/sdd/intent-discovery.ts`, `shared/sdd/intent-evidence.ts` trasladando las implementaciones existentes.
Editar a reexports: `ein-pi/agent/lib/intent-discovery.ts`, `ein-pi/agent/lib/intent-evidence.ts`.
No cambiar transiciones en este paquete; corregir imports hacia contratos compartidos y el tipo mínimo de contexto.
Comando: `bun test tests/intent-discovery.test.ts tests/intent-evidence.test.ts tests/claude-intent-lifecycle.test.ts`.
Antes/después: idéntico comportamiento en fixtures existentes, nueva ubicación canónica.
Parar ante dependencia ejecutable de Pi SDK en el motor que deba cargar Claude.

### 06.3 · Transacción y gate de publicación

Editar: `shared/sdd/intent-discovery.ts`, `shared/sdd/intent-draft-store.ts`; crear `shared/sdd/intent-admission.ts`, `ein-pi/agent/lib/intent-admission.ts` como reexport puro.
Crear: `tests/intent-draft-publication.test.ts`, `tests/intent-admission.test.ts`.
Pasos: autoridad draft; CAS; journal; recuperación; lector único de admisión usado por requireIntent. No tocar sdd-intent-resolution: es el coordinador de preflight, no el lector de estado efectivo.
Comando: `bun test tests/intent-draft-publication.test.ts tests/intent-admission.test.ts tests/intent-discovery.test.ts`.
Parar si se confirma antes de publicar recibo fresco o si un crash permite ejecutar un canónico obsoleto.

### 06.3b · Estado y consumidores de evidencia de finalización

Editar: `shared/sdd/sdd-routing-core.ts`, `shared/sdd/sdd-close-readiness.ts`, `shared/sdd/sdd-summary-write.ts`, `ein-pi/agent/lib/sdd-reconcile.ts`.
Sustituir readAgreement del router por admisión única; readSddCompletionEvidence añade intentAdmission. Conservar chequeo intent_key y ausencia de acuerdo gestionado.
Close readiness consume status.intent derivado de esa admisión; summary y reconcile exigen evidence.intentAdmission.admitted y usan su acuerdo, sin otra lectura canónica permisiva.
Crear `tests/intent-draft-routing-close.test.ts`: fixture listo para cerrar, crash invalidating antes de escribir canónico, resolveSddStatus y closeChange reales en Pi/CLI Claude.
Probar también promoting, draft ilegible, legacy sin draft, summary/reconcile vetados y recuperación exacta. `--force` no omite intent-unresolved.
Comando: `bun test tests/intent-draft-routing-close.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts tests/sdd-summary-write.test.ts tests/sdd-reconcile.test.ts`.

### 06.3c · Frontera final de cierre contra reapertura concurrente

Editar: `shared/sdd/sdd-close-engine.ts`, `shared/sdd/intent-draft-store.ts`; ampliar `tests/intent-draft-routing-close.test.ts`.
Añadir withIntentAdmissionLock(root,work,callback) usando el lock ya definido: releer la admisión al iniciar la publicación final del cierre y retenerlo hasta terminarla; no crear una política distinta.
Inyectar reapertura entre readiness y publicación: nunca archivar con draft pending; la otra sesión recibe busy/conflict, sin reset de aprobación. Probar lock liberado tras error.
Comando: `bun test tests/intent-draft-routing-close.test.ts tests/sdd-close.test.ts`; parar si solo se añade una comprobación temprana dejando la carrera final abierta.

### 06.4 · Eventos Pi, selector y migración

Editar: `ein-pi/agent/extensions/internal/ein-intent-discovery.ts`, `shared/sdd/intent-discovery.ts`.
Editar: `tests/intent-discovery.test.ts`; crear `tests/intent-draft-pi.test.ts`.
Pasos: inyectar createIntentDraftRuntime en el quinto argumento; migrar entries solo sin draft; hidratar; persistir bindings/answers/evidence; emitir recibo tras éxito.
Comando: `bun test tests/intent-draft-pi.test.ts tests/intent-discovery.test.ts tests/intent-evidence.test.ts`.
Probar reinicio justo antes y después de cada recibo, tandas y cancelaciones parciales.
Parar si el fallback a custom entries sobreescribe una revisión neutral más reciente.

### 06.5 · CLI Claude funcional

Editar: `ein-cc/sdd-cli/intent-command.ts`, `ein-cc/sdd-cli/cli.ts`, `shared/sdd/intent-discovery.ts`.
Editar: `shared/ports/intent.ts`, ya creado en 06.1b, sin añadir otra implementación de transiciones.
Ampliar `IntentInput.source` para `claude-coordinator`; el adaptador fija la fuente, nunca la acepta como dato libre del JSON.
Construir puertos con mutating=true solo para escrituras; show/list no inicializan exclusiones ni ejecutan Git.
Crear: `tests/claude-intent-draft.test.ts` con CLI subprocess y fixture Pi→Claude→Pi.
Comando: `bun test tests/claude-intent-draft.test.ts tests/claude-intent-lifecycle.test.ts`.
Antes: show devuelve absent durante entrevista. Después: draft-show devuelve árbol y recibos reales.
Parar si CLI necesita ejecutar Pi, inventa IDs existentes o acepta confirmar únicamente con un booleano.

### 06.6 · Checkpoint y reentrada

Editar: `ein-pi/agent/lib/continuity-handoff-lifecycle.ts`, `ein-pi/agent/lib/continuity-resume-brief.ts`, `shared/ports/continuity.ts`.
Crear: `ein-pi/agent/lib/continuity-intent-facts.ts`; leer contrato de objetivo de 07.
Crear: `tests/continuity-pending-intent.test.ts`; editar `tests/continuity-resume-brief.test.ts`.
Pasos: seleccionar draft determinísticamente, fijar objetivo provisional, resumir pendientes y mandar releer fuente al destino.
Comando: `bun test tests/continuity-pending-intent.test.ts tests/continuity-resume-brief.test.ts tests/continuity-handoff-lifecycle.test.ts`.
Parar si el handoff crea SDD, elige un work ambiguo o presenta el borrador como autorización de apply.

### 06.7 · Distribución y contrato visible

Editar: `installer/src/core/cc-payload-inventory.ts`, `runtime/skills/local/intent-channel/references/pi-protocol.md`, `ein-cc/CLAUDE.adapter.md`, `ein-cc/CLAUDE.md`.
Incluir módulos nuevos en el staging compartido real y documentar los subcomandos exactos; no prometer rutas inexistentes.
Regenerar únicamente el archivo Claude del repo usando `compileClaudeSurface()`; no ejecutar instalación en el home.
Comandos: `bun -e 'import {checkGeneratedParity} from "./ein-cc/sync.ts"; checkGeneratedParity()'`, `bun run typecheck`, `git diff --check`.
Entrega: fixtures de relevo, evidencia de crashes/CAS, límites de migración y confirmación intacta; sin afirmar recuperación de sesiones antiguas nunca importadas.

## Precisiones del cierre · 22 de septiembre

- El journal admite archiving/archived. Bajo el lock por work, close guarda
  primero el digest del resumen FINAL (después de enriquecerlo), mueve el cambio
  y publica el tombstone archived solo tras contrastar la evidencia duradera.
  La recuperación compara esa identidad; no revive apply ni restaura un acuerdo
  por la mera existencia de un directorio de archivo.
- Archived es historial sin autoridad de ejecución y no aparece como borrador
  pendiente. Una reapertura requiere transición explícita y revisión nueva.
- El primer cierre legacy usa el mismo lock que una primera reapertura sin
  introducir .gitignore después de verify. Solo el lock reservado del borrador
  se excluye de la superficie de verificación; archivos ajenos con sufijo
  json.lock siguen invalidándola. La exclusión no se generaliza al proyecto.
- La adopción legacy mediante CLI conserva expectedDigest, reopenReason y backup
  explícitos. La recuperación automática nunca adopta contenido no reconocido.
