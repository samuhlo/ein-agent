# 02 · Verificación ligada a lo que se comprobó

Estado: diseño listo para ejecutar; no implementado.
Base: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e` (alpha.9).
Dependencias: 01. El plan 03 referencia este recibo; no crea otro de verificación.
Manifiesto: //002, //003 y //006. Trabajar sobre main limpio.

## A. Proposal

Después de verificar, borrar un archivo entregado debe invalidar la evidencia.
Hoy puede seguir apareciendo como fresca y permitir el cierre. El resultado se
ligará a una identidad de archivos y decisiones, compartida por Pi y Claude.

Anclas actuales: `computeStaleness` y `newestDeliveredMtime` en
`shared/sdd/sdd-routing-core.ts`; `createAssessCloseReadiness` en
`shared/sdd/sdd-close-readiness.ts`; `readProjectVerificationState` en
`ein-pi/agent/lib/project-state-verification.ts`; `performSddClose` en
`ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts`; `runSummaryCommand`
y dispatch en `ein-cc/sdd-cli/cli.ts`; `translateAgent` en `ein-cc/sync.ts`.

Alcance: productor de recibo, identidad, frescura y sus consumidores. El recibo
demuestra estabilidad entre inicio y final de verify, no que sus comandos se
ejecutaron ni que la revisión semántica fue correcta. Esas obligaciones siguen
en el contrato de `sdd-verify`; no vender este hash como cobertura de comportamiento.

Riesgos: autorreferencia del informe, coste al leer árboles grandes, falsos
verdes por ficheros ausentes y nueva ceremonia para informes antiguos.
Los límites y la migración quedan cerrados en C.

## B. Spec

- MUST invalidar una eliminación: Given recibo vigente y dos archivos del
  proyecto, When desaparece uno, Then freshness=stale y el cierre se deniega.
- MUST invalidar edición, alta, renombre, cambio de modo o destino de symlink:
  Given verify terminado, When cambia la superficie, Then se vuelve a verify.
- MUST detectar cambios durante verify: Given snapshot inicial, When cambia el
  árbol antes de finalizar, Then finish devuelve stale y no publica recibo pass.
- MUST evitar autorreferencia: Given un report y un recibo emitidos, When se
  consultan status o se reescribe su formato canónico sin cambiar los hechos,
  Then no se invalida la identidad de código; el digest del report sí exige
  nueva finalización si se modifica su contenido fuera del escritor.
- MUST degradar incertidumbre: Given Git ilegible, symlink fuera de raíz,
  límite excedido o recibo malformado, When se consulta, Then unknown/unavailable,
  nunca fresh. No ejecutar checks ni escribir archivos durante una consulta.
- MUST compartir política: Given los mismos archivos, When Pi, Claude,
  ProjectState, reconciliación o cierre leen la evidencia, Then coincide frescura.
- MUST migrar proporcionalmente: Given informe antiguo sin recibo, When se
  intenta cerrar, Then unbound y una nueva verify bastan; no repetir scope/apply.

## C. Decisions

**Identidad de superficie.** Crear `shared/sdd/sdd-verification-surface.ts`.
`captureVerificationSurface(cwd, changePath, ports)` devuelve `{ok:true, surfaceRef,
decisionRef, entries}` o `{ok:false, code, reason}`. No importar routing-core ni
child_process. El puerto `enumerateGit(cwd)` devuelve raíz real y entradas
`{path,kind:"file"|"gitlink"}` o un error explícito. Procesos pertenecen a
`ein-pi/agent/lib/verification-surface-git.ts` (nuevo), nunca a shared/sdd.

El proveedor Git enumera con `git ls-files --cached --others --exclude-standard -z` desde la raíz
real del repo, deduplicar y ordenar bytes de rutas relativas. Incluir todos los
archivos tracked, aunque falten, y untracked no ignorados; no limitar extensiones
ni extraer rutas de prosa. Añadir a la comparación las rutas del snapshot anterior
para representar una desaparición de untracked como ausencia, nunca omitirla.
Cada entrada tiene path, tipo, modo ejecutable y SHA-256 del contenido o estado
`missing`. Para symlinks, hash del texto del enlace y verificar su destino real:
fuera de raíz, ausente o no enumerado ⇒ unavailable; dentro y enumerado ⇒ su
contenido ya lo captura su entrada propia. No leer contenido siguiendo el enlace.
Los gitlinks/submódulos no se consideran verificados: devolver unsupported-surface
hasta que un diseño independiente cierre su identidad recursiva.

Excluir exclusivamente los archivos conocidos de proceso bajo
`openspec/changes/<id>/` y `.sdd/changes/<id>/`: `intent.md`, `scope.md`, `map.md`,
`design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `summary.md`,
`preflight.json`, `continuity.json`, `verification-session.json`,
`verification-receipt.json` y `.phase-runs/**`; excluir sus temporales del escritor
con prefijo reservado `.ein-verification-`. Excluir los mismos artefactos dentro
de `changes/archive/<id>/`. No excluir `openspec/specs/**`, deltas, docs, tests,
configuración, código ni todo `openspec/` por comodidad. Git ya excluye `.git`.

`decisionRef` liga por separado los bytes de intent/scope/design/tasks/preflight
del cambio, con marcadores de ausencia; no incluye map, apply-progress, informe
ni resumen. Cambiar decisiones o las tareas después de verify invalida el recibo.
Hashear mediante `openSync/readSync/closeSync` en bloques de 64 KiB, sin límite
nuevo por tamaño de archivo o bytes totales. Comprobar los límites explícitos
del usuario/runtime si existen; agotarlos, cancelación o fallo real ⇒ unavailable
con motivo, sin truncar. La memoria del contenido es constante; los paths se deduplican.
Sin Git, unavailable: no recuperar el mtime como prueba equivalente.

**Productor.** Crear `shared/sdd/sdd-verification-receipt.ts`: factory
`createVerificationService({enumerateGit,now,newToken,limits?})`, que expone
`beginVerification({cwd,changePath})`, `finishVerification({cwd,changePath,token,content})`
y `readVerificationFreshness({cwd,changePath})`. Componerla en nuevo
`ein-pi/agent/lib/sdd-verification-runtime.ts`; `shared/ports/sdd.ts` exporta esta
capacidad para Claude, declarando el puente en README y test de arquitectura.
Condición de retirada del puente: proveedor Git neutral compartido con paridad probada.
Validar changePath como directorio
regular del cambio seguro bajo la raíz canónica o legacy; rechazar symlinks y escapes.
Crear fachadas homónimas en `ein-pi/agent/lib/` para el overlay instalado.

Begin genera UUID, captura superficie+decisiones y escribe atómicamente
`verification-session.json`: `{version:1, token, root, change, startedAt, intentKey?,
surfaceRef, decisionRef, entries}`. Segundo begin sustituye solo la sesión activa;
un token anterior no puede finalizarla. Reanudar consulta la sesión, no la recrea.

Finish exige token actual, misma raíz/cambio, superficie/decisiones iguales,
acuerdo actual confirmado cuando exista y resultado parseado por 01. Normaliza
CRLF y estado global. Para intent_key reutilizar exactamente el bloque `tool_call`
de `registerAgentPromptHook`: retirar líneas que casen
`/^[ \t]*(?:[-*][ \t]+)?intent_key:[^\r\n]*(?:\r?\n|$)/gm` y añadir una clave
con `readAgreement(...).agreement.materialKey`; no existe hoy un helper con nombre.
Hacerlo dentro de finish, validando la misma clave guardada en begin; no alterar la prosa
ni convertir fail en pass. Escribe primero verify-report y después, mediante rename
de archivo temporal hermano, `verification-receipt.json`:
`{version:1, token, root, change, startedAt, finishedAt, surfaceRef, decisionRef,
reportSha256, outcome:"pass"|"fail", entries}`. Unknown no publica recibo vigente.
Un fallo entre ambas escrituras deja digest discordante ⇒ unknown; nunca éxito
parcial. Repetir finish con mismo token/contenido/superficie es idempotente.

**Superficies invocables.** Pi: nueva extensión child-only
`ein-verify-receipt-child.ts` registra `ein_sdd_verification` con action begin|finish,
change y, para finish, token/content. Resolver changePath con `resolveChangesDir`
en el adaptador. No aceptar cwd o rutas del modelo. Añadirla al frontmatter de
sdd-verify y su tool a la allowlist; el guard de intent debe cubrir esta escritura.
Claude: `ein-cc-sdd verification <change> begin` y `... finish --token <uuid>`
con informe por stdin, en nuevo `ein-cc/sdd-cli/verification-command.ts`.
Ambos llaman las APIs compartidas; sync traduce esa tool a Bash y al comando real.
El agente llama begin antes de sus checks y finish después de redactar el report;
no escribe hashes, recibos o verification-session con Write/Edit.

**Lectores.** Exportar `VerificationFreshness = {state: "current"|"stale"|"unbound"|
"unavailable"|"invalid", reason: string, observedSurfaceRef?: string,
currentSurfaceRef?: string}`. `readSddCompletionEvidence` y `SddChangeStatus`
añaden `verification: VerificationFreshness`. `computeStaleness` conserva los
campos públicos; verifyStale significa únicamente `state === "stale"`, no éxito
cuando es false. summaryStale mantiene además su orden respecto al report.
`resolveSddStatus`
mantiene verify cuando no hay pass+current, sin rebobinar fases anteriores.
`createAssessCloseReadiness`, `writeVerifiedSddSummary` y la reconciliación verify
exigen expresamente `verification.state === "current"` además de outcome pass.
Inyectar `readVerification` en `createSddRoutingCore`; añadirlo como argumento
obligatorio a `readSddCompletionEvidence` y `writeVerifiedSddSummary`.
Las composiciones Pi `sdd-routing-runtime.ts` y `sdd-verification-runtime.ts`,
y el puerto Claude `shared/ports/sdd.ts`, suministran el servicio. Ningún núcleo
shared importa la composición Pi ni lanza Git. Tests del núcleo inyectan fixtures;
los de adaptador ejecutan el proveedor real. No usar un singleton global.
ProjectState debe consumir este recibo, no `project_state_git_ref`; ampliar su
contrato con `verificationSurfaceRef` observado/actual, sin llamarles refs Git.
La ausencia de recibo legacy es unbound. No convertir el campo antiguo en recibo.

El cierre normal conserva una copia del recibo validado en el directorio de archivo
junto al resumen: el plan debe extender la transacción de compaction, no escribir
esa copia después de anunciar éxito. El recibo archivado es evidencia histórica,
no permiso para cerrar otra revisión. No cambiar los modos legacy/out-of-flow.

Rollback: revertir APIs y adaptadores como una unidad; dejar recibos existentes
intactos. No migrar eliminando evidencia ni volver automáticamente al cierre por mtime.

## D. Acceptance

Probar la matriz B, caída entre escrituras y tokens obsoletos. Ejecutar begin,
checks simulados en fixture y finish a través de Pi y CLI real; comparar recibos
salvo UUID/fechas. Un test MUST usar un informe NO ignorado por Git para demostrar
que no existe la autorreferencia del fixture antiguo de ProjectState.
Probar modificación de .json/.yaml y ficheros sin extensión; ausencia previamente
declarada que después aparece; modificación conservando mtime; falta de permiso.
Probar que report/recibo/resumen no cambian surfaceRef y que tasks/intent cambian
decisionRef. Probar fallo y control positivo con `closeChange` y archivo duradero.

## E. Execution packets

### 02A · Captura de superficie y contratos compartidos

- read: C; `project-state-git.ts`, overlay y `sdd-summary-write.ts` como precedentes.
- edit: los dos módulos shared nuevos de C y sus dos fachadas Pi (cuatro rutas).
- tests: nuevos `tests/sdd-verification-surface.test.ts`, `tests/sdd-verification-receipt.test.ts`.
- steps: implementar listado, exclusiones, identidades, begin/finish/read y atomicidad.
- verify: `bun test tests/sdd-verification-surface.test.ts tests/sdd-verification-receipt.test.ts`
- stop: negativo de borrado y control sin autorreferencia pasan; APIs cerradas.

### 02B · Puerto Git, composición y frontera pública

- edit: `ein-pi/agent/lib/verification-surface-git.ts`,
  `ein-pi/agent/lib/sdd-verification-runtime.ts` (nuevos), `shared/ports/sdd.ts`, `shared/README.md`.
- tests: nuevo `tests/verification-surface-git.test.ts`; ampliar `tests/architecture-boundaries.test.ts`.
- steps: proveedor Git real, factory con reloj/UUID explícitos, puente público documentado;
  tipar registros gitlink leyendo `git ls-files --stage -z`, no deducirlos por extensión.
- verify: `bun test tests/verification-surface-git.test.ts tests/architecture-boundaries.test.ts`
- stop: shared/sdd no importa procesos; Claude recibe capacidades solo por puerto declarado.

### 02C · Productor Pi y permiso de escritura

- edit: `ein-pi/agent/extensions/internal/ein-verify-receipt-child.ts` (nuevo),
  `runtime/agents/sdd-verify.md`, `ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts`.
- tests: nuevo `tests/verify-receipt-child.test.ts`; `tests/agent-tools-contract.test.ts`.
- steps: registrar solo en verify, validar argumentos, comprobar intent actual y
  sustituir instrucción Write report por begin/finish sin duplicar el contrato.
- verify: `bun test tests/verify-receipt-child.test.ts tests/agent-tools-contract.test.ts tests/prompt-budget.test.ts`
- stop: tool real escribe recibo; intent obsoleto bloquea; evidencia ad-hoc no crea SDD.

### 02D · Productor Claude

- edit: `ein-cc/sdd-cli/verification-command.ts` (nuevo), `ein-cc/sdd-cli/cli.ts`,
  `ein-cc/sync.ts`, `ein-cc/sdd-cli/README.md`.
- tests: nuevo `tests/claude-verification-receipt.test.ts`; contratos de tools.
- steps: stdin/dispatch/help, traducir tool y mensaje Pi a comandos existentes;
  usar el servicio público de shared/ports/sdd, también para escribir resumen;
  devolver errores no cero; no ejecutar shell interpolado desde content.
- verify: `bun test tests/claude-verification-receipt.test.ts tests/claude-sdd-cli-boundaries.test.ts tests/agent-tools-contract.test.ts`
- stop: begin/finish real funciona con espacios/nuevas líneas sin reescribir informe.

### 02E · Routing, cierre y archivo duradero

- edit: `shared/sdd/sdd-routing-core.ts`, `shared/sdd/sdd-close-readiness.ts`,
  `shared/sdd/sdd-close-compaction.ts`, `shared/sdd/sdd-close-engine.ts`.
- tests: ampliar `tests/sdd-router.test.ts`, `tests/sdd-close.test.ts`, `tests/sdd-reconcile.test.ts`.
- steps: conectar lector único; adaptar fixtures pass al productor; preservar recibo
  en compaction y su recuperación; no cambiar la autorización de modos alternativos.
- verify: `bun test tests/sdd-router.test.ts tests/sdd-close.test.ts tests/sdd-reconcile.test.ts tests/sdd-summary-write.test.ts`
- stop: close no archiva borrado/unknown; archivo normal y recuperación conservan recibo.

### 02F · ProjectState y consumidores de evidencia

- edit: `ein-pi/agent/lib/project-state-verification.ts`,
  `ein-pi/agent/lib/project-state-contract.ts`, `shared/sdd/sdd-summary-write.ts`,
  `ein-pi/agent/lib/sdd-reconcile.ts`.
- tests: `tests/shared-project-state.test.ts`, `tests/template-agent-inventory.test.ts`,
  `tests/sdd-summary-write.test.ts`, `tests/sdd-reconcile.test.ts`.
- steps: cambiar únicamente dueño de frescura y campos de procedencia; actualizar
  fixtures antiguos sin ocultar report en .gitignore; comprobar ambos adaptadores.
- verify: `bun test tests/shared-project-state.test.ts tests/template-agent-inventory.test.ts tests/sdd-summary-write.test.ts tests/sdd-reconcile.test.ts`
- stop: todos los consumidores coinciden; no queda mtime ni gitRef como aceptación alternativa.

### 02G · Composiciones restantes y verificación de frontera

- edit: `ein-pi/agent/lib/sdd-routing-runtime.ts`,
  `ein-pi/agent/extensions/internal/ein-close-summary-child.ts`, `shared/ports/sdd.ts`.
- tests: adaptar `tests/intent-discovery.test.ts`, `tests/sdd-progress-honesty.test.ts`
  a la dependencia explícita; conservar escenarios funcionales.
- steps: conectar readVerification en router y escritor de resumen de ambos
  runtimes; cerrar todos los callsites tipados, sin defaults que acepten evidencia.
- verify: `bun test tests/sdd-summary-write.test.ts tests/sdd-progress-honesty.test.ts tests/intent-discovery.test.ts tests/architecture-boundaries.test.ts tests/template-agent-inventory.test.ts`
- verify: `bun run typecheck`
- stop: imports del payload enlazan y los productores/consumidores usan el mismo servicio.

02E–02G forman la transición conjunta de consumidores: aplicar los tres paquetes
antes de ejecutar sus comandos de integración. Cada escritura sigue limitada a
su lista; no entregar un estado intermedio con firmas o dependencias a medias.
