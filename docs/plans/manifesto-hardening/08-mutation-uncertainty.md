# 08 · La incertidumbre de una operación no desaparece al reiniciar

Estado: diseño para ejecución; no implementado ni cambio SDD activo.
Base: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e`.
Orden: independiente del contrato de objetivo 07; integrar sus cambios de lifecycle de forma secuencial.
No modifica criterios de verify/close ni concede permisos de entrega.

## A. Propuesta

Registrar antes de ejecutar una operación potencialmente mutante y conservar su resultado incierto.
Reabrir sesión, refrescar Git o preparar un relevo no certificará esa operación.
Una lectura fallida conocida no debe crear un bloqueo de mutación.

Hoy `continuity-handoff-lifecycle.ts:109,188` conserva `uncertain` solo en memoria.
La misma instancia bloquea prepare; otra instancia lo pierde y `prepare:210` refresca el checkpoint antes de comprobarlo.
La reproducción del audit obtiene `restartPrepareOk:true` después de un fallo y cambio de stateRef.
El alcance del hallazgo es el relevo: no prueba que se pueda saltar el gate de cierre.
Manifiesto: §§002, 003, 004 y 005.

Usar un único journal local de operaciones: `.ein/continuity-operations.json`.
Este archivo separado sí es necesario: una operación puede empezar antes del primer checkpoint,
crear el primer cambio SDD o archivarlo; la ubicación actual del checkpoint cambia entre adhoc y SDD.
Guardar el inicio dentro del checkpoint seleccionado dejaría operaciones en una ubicación que el siguiente `current()` ya no consulta.
El journal permanece en la raíz del proyecto y no duplica objetivo, progreso ni verificación.
No extraer un almacén genérico ni modificar la ubicación histórica de los checkpoints.

## B. Especificación por escenarios

- Dada una operación mutante admitida, cuando comienza, entonces su inicio durable precede a la ejecución.
- Dado un fallo con efectos posibles, cuando se registra el resultado, entonces persiste `uncertain` con su ID y observaciones.
- Dada una caída antes del resultado, cuando arranca otro runtime, entonces `running` sigue impidiendo prepare.
- Dado ese registro, cuando se ejecuta refresh normal o explícito, entonces no cambia su estado.
- Dada una lectura `read` fallida o un scout con capacidad read-only validada, entonces no se registra como mutación.
- Dado `bash` con comando exacto `git diff --check` fallido, entonces el fallo no crea incertidumbre de mutación.
- Dado un comando no clasificable, cuando falla, entonces no se infiere que fue solo lectura porque Git parezca igual.
- Dado `bun test` fallido, cuando el coordinador revisa la llamada real y sus efectos locales, entonces puede resolver con atestación local explícita, sin fingir prueba mecánica global.
- Dada una denegación de Ein anterior a ejecución, entonces queda `settled/not-started` con recibo de guard, incluso si begin llegó antes o después.
- Dado un token de inspección vigente y revisión explícita del efecto local, cuando se resuelve, entonces queda recibo de recuperación.
- Dado Git cambiado después de inspeccionar, cuando se intenta resolver con el token anterior, entonces se rechaza por obsoleto.
- Dadas dos operaciones concurrentes, cuando termina una, entonces la otra conserva su estado; ningún booleano global la borra.

## C. Decisiones y contrato cerrado

1. Crear `continuity-operations.ts` para contrato/transiciones y `continuity-operation-store.ts` para su único archivo.
   `schemaVersion:1`, `revision:sha256`, `operations:Operation[]`.
   Operación: `id`, `runtime:pi|claude`, `tool`, `inputDigest`, `startedAt`, `beforeStateRef:string|null`,
   `status:running|uncertain|settled`, `outcome?:succeeded|not-started|recovered`, `afterStateRef?:string|null`, `reason?:string`, `recovery?:Recovery`.
   Guardar `nativeCallRef:{sessionRef,toolCallId}` emitido por el adaptador, con referencia opaca del runtime; no una ruta privada copiada al brief.
   Añadir `effectScope:local|external-or-unknown`: escrituras acotadas al proyecto son locales; Bash/delegación sin contrato de efectos es desconocido.
   No guardar comando completo, contenido editado, secretos, razonamiento ni transcripción.
2. ID estable: namespace de runtime + ID nativo de llamada; duplicados idénticos son idempotentes.
   Mismo ID con digest distinto es conflicto, no otra operación ni un resultado aceptable.
   Mantener hasta 32 operaciones sin resolver y 64 asentadas; retirar primero asentadas antiguas.
   Tamaño máximo del archivo: 256 KiB; al superar bytes retirar solo asentadas antiguas, nunca una activa.
   Si se agota el límite activo, devolver bloqueo con IDs concretos; no borrar incertidumbre para ganar espacio.
3. Writer local: copiar únicamente el mecanismo necesario del escritor de checkpoint existente.
   Validación de ruta/ancestros sin symlinks, directorio privado, lock exclusivo, CAS bajo lock, temp único, fsync, rename y lectura posterior.
   Lectura ausente es journal vacío; JSON inválido/IO incierto nunca equivale a vacío.
   Retornos distinguen conflicto, busy, no publicado y publicado sin verificar.
   Un lock abandonado no se roba por timeout; se informa para recuperación explícita.
4. Añadir al lifecycle `beginOperation`, `finishOperation`, `inspectOperation`, `resolveOperation`.
   `beginOperation({id,runtime,tool,inputDigest,effect})` captura stateRef y publica `running`.
   `finishOperation({id,outcome,proof})` vuelve a observar estado; outcome es `succeeded|failed|unavailable` y proof identifica el resultado nativo de esa llamada.
   Para subagent, consumir el terminal validado del sobre compartido; `isError:false`, texto «Done» o exit del contenedor no bastan por sí solos.
   Resultado sin inicio crea una operación `uncertain` con razón `missing-start`; no se fabrica un antes.
   Fallo, timeout o ausencia de resultado conserva incertidumbre aunque before/after de Git coincidan.
   Añadir `recordAdmissionDenied({id,inputDigest,proof:{kind:ein-guard,guardId,reasonCode}})` que publica tombstone `settled/not-started`.
   `beginOperation` respeta ese tombstone: no lo reabre aunque los hooks nativos corran en otro orden; IDs/digests distintos siguen siendo conflicto.
5. `status()` y `prepare()` leen journal en cada llamada, no una copia al arrancar.
   Operaciones running/uncertain o journal ilegible alimentan el bloqueo `mutation-uncertain` existente.
   `refresh(true)` deja de limpiar incertidumbre. `clear()` del checkpoint tampoco borra journal.
   Éxito de otra operación no limpia las anteriores.
6. Clasificación cerrada y pequeña en `continuity-operations.ts`, compartida por adaptadores.
   `read`, `grep`, `find` y equivalentes Claude `Read`, `Grep`, `Glob` son lecturas.
   `ein-scout` solo se considera lectura cuando la admisión real fija herramientas read-only; no basta encontrar ese nombre en prosa.
   Para Bash, reconocer únicamente las cadenas exactas `false`, `true`, `git diff --check`, `git status --short`, `git rev-parse HEAD` tras trim.
   Metacaracteres, prefijos de entorno, redirecciones, pipelines o cualquier otra cadena no heredan esa clasificación.
   No usar `commandIsExplicitlyAllowed` como sinónimo de lectura: su allowlist incluye mutaciones locales.
7. Mantener cobertura explícita de las herramientas mutantes ya enumeradas en `ein-continuity.ts`.
   Añadir inicio para cada una y pruebas de exhaustividad contra esa enumeración.
   Una herramienta nueva sin contrato de efectos se declara no cubierta; no se anuncia garantía universal sobre plugins ajenos.
   La clasificación no concede autorización: los guards y permisos existentes siguen decidiendo ejecución.
8. Recuperación local en dos pasos: `inspectOperation(id)` devuelve operación, diff/estado acotado y token ligado a revisión+stateRef.
   `resolveOperation({id,token,assessment})` exige token vigente y una valoración explícita del coordinador.
   `assessment = {kind:local-attested|external-observed,summary,callRef,evidenceRefs,evidencePaths}`; el arnés verifica referencias, relee paths y sella Git.
   El recibo registra procedencia del coordinador, stateRef inspeccionado y digests; no afirma haber ejecutado tests.
   `Recovery = {token,stateRef,kind,source:pi-coordinator|claude-coordinator,summary,callRef,evidenceRefs,evidence:[{path,digest}],resolvedAt}`; hasta 16 paths y summary de 512 bytes.
   Inyectar `ContinuityRecoveryEvidencePort = {readCall(nativeCallRef),readEvidence(ref)}` en inspect/resolve; no aceptar un texto suministrado como si fuera resultado nativo.
   `readCall` devuelve llamada exacta, digest y terminal observado; `readEvidence` devuelve ID, procedencia, digest y resultado ya existente o `unavailable`.
   Implementar el puerto en `ein-pi/agent/lib/continuity-recovery-evidence.ts`: rama actual Pi y JSONL nativo de la sesión referenciada; Claude usa sus tool_use/tool_result por ID.
   Resolver la referencia mediante `resolveSessionReference`/binding del proyecto existente; leer solo la sesión concreta, sin importar pensamiento ni barrer transcripciones ajenas.
   La valoración `local-attested` puede establecer alcance local de una llamada inicialmente desconocida usando esa llamada y evidencia nombrada.
   Ejemplo positivo obligatorio: `bun test` fallido + package script y archivos afectados leídos; guardar que el coordinador lo atestigua, no que el arnés demostró ausencia de cualquier efecto externo.
   Para efectos realmente externos exigir `external-observed` y IDs de read-back ya obtenido con herramientas de lectura (p. ej. referencia remota y commit esperado).
   El puerto no ejecuta comandos ni inventa read-back; si falta resultado/correspondencia, mantener `external-proof-required` explícito.
   No requiere volver a pedir permiso para una revisión local ya autorizada.
9. Pi: hooks `tool_call`/`tool_result`, usando toolCallId e input digest; fallo al persistir inicio bloquea esa mutación antes de correr.
   SDK inspeccionado: `tool_execution_start` ocurre ANTES de validación/guards; no prueba que el ejecutor arrancara. Un block salta ejecución y puede omitir `tool_result`.
   Cada guard propio registra `recordAdmissionDenied` en su rama de retorno block; su decisión estructurada, no el texto del error, prueba not-started.
   Guard ajeno sin recibo verificable o hook interrumpido conserva incertidumbre; no deducir no ejecución de un evento ausente.
   Exponer `ein_continuity_recover` con acciones `inspect` y `resolve`; nunca resolver desde `session_start`.
   Los errores de recuperación se muestran con opId y causa, sin pedir reiniciar sesión.
10. Claude: `PreToolUse` publica inicio y `PostToolUse`/`PostToolUseFailure` completa el mismo `tool_use_id`.
    Ampliar el IPC tipado de `continuity-runner.ts` con eventos start/result y versión 2; conservar controles v1 de status/handoff.
    Una mutación v1 sin ID se registra como incierta, no como éxito anónimo que limpie todo.
    El payload lleva digest/clase y campos acotados, no el comando completo; IPC conserva autenticación y límites.
11. `buildClaudeHooks()` añade el hook de inicio sin reemplazar el guard Bash existente.
    `guardCmd` publica el mismo recibo de denegación antes de emitir deny, con tool_use_id; el tombstone hace segura cualquier orden entre guard e inicio.
    Error al persistir inicio produce deny para esa mutación; lectura conocida continúa y los demás guards mantienen precedencia.
    CLI: `ein-cc-sdd continuity inspect <opId>` y `ein-cc-sdd continuity resolve <opId> < recovery.json`.
    El CLI llama al mismo motor; no crea SDD ni depende de un supervisor vivo para leer journal.
12. Migración: ausencia de journal anterior indica historial no observado, no prueba de ejecución correcta.
    Mostrar esa limitación al primer relevo; no inventar una operación histórica fallida ni bloquear toda instalación antigua.
    Desde el primer inicio v1, cualquier running/uncertain sí es durable y bloqueante.
    Un archivo con schema desconocido queda protegido e ilegible hasta actualizar; no se reemplaza por vacío.

## D. Aceptación verificable

- El probe original conserva el bloqueo tras recrear el lifecycle y llamar prepare directamente.
- El mismo resultado se obtiene recreando un proceso Claude con el mismo journal.
- Falla una lectura conocida: cero operaciones inciertas nuevas; falla write: una operación identificada.
- Refresh, compact, status y clear no resuelven operaciones.
- Interrupción después de inicio y antes de resultado permanece running tras reinicio.
- Recuperación con token obsoleto o journal conflictivo no publica éxito.
- Fallo de test local se recupera con llamada/evidencia reales y recibo `local-attested`; lectura remota inexistente o IDs prestados no resuelven efecto externo.
- Denegar antes de ejecutar no deja running huérfano; probar con spy de ejecutor=0 y hooks en ambos órdenes.
- Crear/archivar SDD entre inicio y resultado no pierde operación ni cambia la autoridad del journal.
- Los recibos explican inspección local y atestación; no prometen prueba del efecto remoto ni verify/close.

## E. Paquetes de ejecución

### 08.1 · Contrato y journal local

Crear: `ein-pi/agent/lib/continuity-operations.ts`, `ein-pi/agent/lib/continuity-operation-store.ts`.
Editar: `ein-pi/agent/lib/gitignore.ts`, `shared/ports/continuity.ts`.
Leer: `ein-pi/agent/lib/continuity-checkpoint-store.ts` como referencia de publicación segura.
Crear: `tests/continuity-operation-store.test.ts`, `tests/continuity-operations.test.ts`.
Pasos: esquema y límites; transición por ID; escritor CAS; exclusión `.ein/continuity-operations.json` y sus temporales/lock.
Antes de capturar el primer stateRef, instalar esa exclusión con `ensureEinGitignore`; comprobar con Git que el journal no está tracked ni entra en el snapshot.
Si no puede excluirse, devolver `state-store-not-isolated` antes de mutar, sin quitar archivos del índice; fuera de Git conservar stateRef desconocido.
Comando: `bun test tests/continuity-operation-store.test.ts tests/continuity-operations.test.ts`.
Inyectar fallo antes/después de rename, dos escritores, symlink y JSON corrupto; ninguno publica una resolución falsa.
Parar si se necesita abstraer todo el filesystem del proyecto o almacenar comandos completos.

### 08.2 · Lifecycle persistente y recuperación explícita

Editar: `ein-pi/agent/lib/continuity-handoff-lifecycle.ts`, `shared/ports/continuity.ts`, `shared/README.md`.
Crear: `ein-pi/agent/lib/continuity-recovery-evidence.ts`; declarar puentes del puerto hacia ese módulo y `continuity-operations.ts`.
Añadir solo esos dos imports a `tests/architecture-boundaries.test.ts`; ningún núcleo shared lanza procesos ni lee hogares directamente.
Editar: `tests/continuity-handoff-lifecycle.test.ts`; crear `tests/continuity-operation-recovery.test.ts`.
Pasos: sustituir booleano efímero; añadir cuatro métodos; leer journal en status/prepare; impedir refresh-clear; tokens de recuperación.
Mantener temporalmente `mutationResult(boolean)` solo como compatibilidad: un fallo sin ID registra incertidumbre; nunca limpia registros.
Comando: `bun test tests/continuity-handoff-lifecycle.test.ts tests/continuity-operation-recovery.test.ts tests/architecture-boundaries.test.ts`.
Parar si recuperar se reduce a recalcular stateRef o si un éxito posterior borra otro opId.

### 08.3 · Eventos Pi y recibos

Editar: `ein-pi/agent/extensions/ein-continuity.ts`.
Editar: `tests/ein-continuity-extension.test.ts`; crear `tests/continuity-operation-pi.test.ts`.
Pasos: begin antes de ejecución; finish con mismo ID; clasificar lecturas; registrar herramienta inspect/resolve.
Probar hooks reales simulados y una sesión SDK temporal sin proveedor para el orden de persistencia.
Comando: `bun test tests/ein-continuity-extension.test.ts tests/continuity-operation-pi.test.ts`.
Parar si el hook bloquea read/grep por un journal ajeno o sustituye el permiso de una herramienta.

### 08.3b · Denegaciones probadas, sin operaciones huérfanas

Editar: `ein-pi/agent/extensions/internal/ein-tool-call-gate.ts`, `ein-pi/agent/extensions/internal/ein-intent-discovery.ts`, `ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts`, `ein-cc/sdd-cli/cli.ts`.
En ramas que ya devuelven block/deny, registrar el recibo con ID/digest antes de devolver la misma denegación; no cambiar su política.
Claude usa el helper exportado por `shared/ports/continuity.ts`, nunca import directo de Pi.
Crear `tests/continuity-admission-denial.test.ts`: SDK real sin proveedor, guard antes/después de begin, cero ejecuciones, tombstone estable tras restart.
Comando: `bun test tests/continuity-admission-denial.test.ts tests/claude-continuity-runtime.test.ts`.
Parar si la prueba usa tool_execution_start como evidencia de ejecución o clasifica mensajes por palabras como «denied».

### 08.4 · Eventos Claude e IPC

Editar: `ein-cc/continuity-runner.ts`, `ein-cc/sync.ts`.
Editar: `tests/claude-continuity-runtime.test.ts`; crear `tests/claude-continuity-operation-hooks.test.ts`.
Pasos: eventos v2 start/result; tool_use_id; inicio durable antes de allow; combinar PreToolUse con guard existente.
Comando: `bun test tests/claude-continuity-runtime.test.ts tests/claude-continuity-operation-hooks.test.ts`.
Probar secuencia native-hook→IPC→journal→restart; no basta comparar strings de settings.
Parar ante IDs ausentes: registrar incertidumbre explícita; no inventar correlación por orden temporal.

### 08.5 · CLI de recuperación y distribución

Crear: `ein-cc/sdd-cli/continuity-command.ts`.
Editar: `ein-cc/sdd-cli/cli.ts`, `installer/src/core/cc-payload-inventory.ts`, `ein-cc/commands/ein/handoff.md`.
Crear: `tests/claude-continuity-recovery-cli.test.ts` con subprocess e instalación staging aislada.
Comando: `bun test tests/claude-continuity-recovery-cli.test.ts` y `bun run typecheck`.
Validar dependencias transitivas de los dos módulos nuevos en staging, sin ejecutar el instalador contra el home real.
Después: `git diff --check`; reportar límites de efectos externos y de herramientas no cubiertas.
No entregar un botón «reintentar» que borre journal; el único borrado admisible es retención de entradas ya asentadas.

## Precisiones de integración · 22 de septiembre

- El token de inspección liga la revisión de la operación objetivo y stateRef.
  El CAS de escritura sigue usando la revisión completa del journal bajo lock.
  Esto evita que la propia llamada Bash de inspect/resolve invalide el token
  simplemente por registrar otra operación independiente.
- Estado Git y digests de evidencia se revalidan en beforePublish bajo el lock.
- El adaptador conserva el binding de la llamada nativa aunque otro guard
  normalice su input antes de ejecutar; no confunde ese cambio de transporte
  con una llamada distinta ni inventa un resultado satisfactorio.
- La primera correspondencia externa implementada es push/read-back Git con
  destino literal sin credenciales, ref y SHA coincidentes. Un alias sin
  identidad de destino demostrada u otra operación externa no cubierta mantiene
  external-proof-required. Un push reconocido no admite local-attested.
- continuity-operation-runtime.ts compone estas capacidades para lifecycle,
  guards y CLI sobre el mismo journal; no crea otro supervisor ni almacén.
