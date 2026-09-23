# Auditoría de Ein frente al manifiesto

Fecha: 16 de septiembre de 2026.

> Documento histórico de diagnóstico. El diseño ejecutable vigente está en
> [el plan de correcciones](../plans/manifesto-hardening/README.md).
> Los scripts originales se conservan como texto en [las evidencias](2026-09-16-manifiesto-evidencias.md);
> las rutas `/private/tmp` describen el entorno auditado y no son prerrequisitos del plan.

Base: `origin/main`, [commit 3b9fa42](https://github.com/samuhlo/ein-agent/tree/3b9fa420f8cd18480bee6a19dd1ed14b99bc483e), alpha.9.
Se usó el checkout limpio `/private/tmp/ein-scout-salvage`. El manifiesto de
referencia incluye las ampliaciones locales del usuario sobre calidad y economía.
Las PR #451 y #452 se revisaron como cambios pendientes: resuelven parte del
scout, pero no los hallazgos siguientes.

Alcance: verificación y cierre SDD, validación y reconciliación, delegación,
presupuestos, continuidad Pi/Claude, entrega Git y recuperación del instalador.
No se modificaron fuentes, instalaciones ni PRs. Las reproducciones ejecutan
funciones reales con archivos temporales o capacidades de E/S simuladas; no son
una campaña de agentes reales ni una actualización de una instalación personal.

## Conclusión

Hay problemas estructurales. El mismo estado se interpreta de distintas maneras
en el validador, router, cierre, checkpoint y presentación. Además, algunos
controles infieren hechos de texto que no representa de forma inequívoca lo
ejecutado. Esto produce tanto aceptaciones incorrectas como bloqueos innecesarios.

La prioridad es consolidar las garantías de esas fronteras usando los módulos
compartidos existentes. Añadir excepciones de formato o más instrucciones al
padre no cubre por sí solo estas clases de fallo.

P1 significa prioridad alta por una garantía de ejecución, cierre o recuperación
que puede resultar falsa. P2 señala pérdida de continuidad, bloqueos o coste
evitable. No se presenta ninguno de estos casos como prueba de explotación de
seguridad ni de corrupción ocurrida en un proyecto real.

## Hallazgos

### 1. P1 — Un resultado final de fallo puede convertirse en verificación aprobada

El parser toma la primera coincidencia de `status`, `result` o `resultado` en
cualquier parte del documento. Un ejemplo anterior puede dominar el veredicto.

Entrada reproducida:

```text
Example expected result: pass

status: fail
The feature does not work.
```

Salida real del motor: `verify: pass`, `closeReady: true`, `closeOk: true`,
artefacto movido a `archive/`. No se usó `force`.
Como controles, un `status: fail` aislado y un `required_check` con código 1 sí
impiden el cierre; el fallo concreto está en interpretar declaraciones mezcladas.

Fuentes: `shared/sdd/sdd-routing-core.ts:428`,
`shared/sdd/sdd-artifact-validation.ts:190`,
`shared/sdd/sdd-close-readiness.ts:153`.
La herramienta invoca ese cierre directamente y anuncia «Verified change»:
`ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts:29,159`.

Manifiesto: §§002, 006 y 007. La lectura tolerante de prosa no debe crear éxito.

### 2. P1 — Borrar un archivo después de verificar puede dejar vigente el PASS

La frescura se calcula con el mtime más reciente de los archivos entregados
que todavía existen. Un archivo eliminado se omite. Si queda otro archivo
anterior a la verificación, la eliminación no invalida el resultado.

Reproducción: tareas completadas sobre `a.ts` y `b.ts`, verificación posterior,
borrado de `b.ts`. Resultado: `verifyStale: false` y cierre con archivo correcto
en `archive/`, pese a que la superficie verificada cambió.

Fuentes: `shared/sdd/sdd-routing-core.ts:437,452,477` y
`shared/sdd/sdd-close-readiness.ts:155`.
La comparación por identidad Git existe separadamente en
`ein-pi/agent/lib/project-state-verification.ts:116`, pero no gobierna ese cierre.

Manifiesto: §002, frescura y procedencia computables.

Precaución para la solución: reutilizar sin más el hash de todo el repositorio
crearía otro problema. `project-state-git.ts:159` incluye el contenido modificado
de `verify-report.md`; escribir el hash dentro del informe cambia el hash. El test
de binding evita ese caso ignorando expresamente el informe
(`tests/shared-project-state.test.ts:285`). La identidad debe cubrir la superficie
verificada y excluir por construcción sus propios recibos.

### 3. P1 — La reconciliación puede completar la fase del cambio equivocado

El snapshot previo guarda artefactos de todos los cambios. Al fallar un hijo,
se acepta el único artefacto modificado, sin vincularlo al cambio delegado.
Para design, un documento no vacío puede pasar con avisos de secciones ausentes.

Reproducción: ejecución destinada a A; aparece solo `change-b/design.md` con
«Draft started. More work pending.». Resultado: `reconciled: true`, cambio B,
mensaje «fase design COMPLETA» y orden de no repetirla.

Fuentes: `ein-pi/agent/extensions/internal/ein-delegation-results.ts:61`,
`ein-pi/agent/lib/sdd-reconcile.ts:75,108,140,190`.

Manifiesto: §§002 y 006. Hay que separar conservar un borrador útil de certificar
que terminó la ejecución solicitada. Hacer obligatorios más encabezados de prosa
no corregiría la ausencia de identidad de ejecución y cambio.

### 4. P1 — El rollback puede dejar una instalación mezclada y declarar éxito

El paquete instala archivos raíz como `AGENTS.md`, `app.ts`, `settings.json`,
`models.json` y `extensions-manifest.json`. Snapshot y restore solo cubren los
directorios gestionados y dos archivos raíz: manifiesto y `mcp.json`.

Reproducción con funciones reales y almacenamiento en memoria:

```text
snapshotOk: true
restoreOk: true
AGENTS.md: new
app.ts: new
settings.json: new
template-manifest.json: old
mcp.json: old
```

Fuentes: `installer/scripts/bundle-template.ts:52,105`,
`installer/src/core/deploy.ts:160`,
`installer/src/core/template-transaction.ts:21,25,54,57`.
La transacción consume ese restore en `installer/src/core/transaction.ts:610`
y registra recuperación satisfactoria sin comprobar ese inventario completo.

Manifiesto: §§002 y 006. El alcance de la prueba es snapshot/restore, no una
instalación real ni todos los modos de fallo del updater. Los campos de settings
propiedad del usuario necesitan tratamiento separado; no procede restaurarlos
indiscriminadamente junto con los archivos gestionados.

### 5. P1 — Las protecciones de delegación dependen de la escritura del JavaScript

Una delegación que calcula `agent` dinámicamente produce un item con tarea pero
sin agente. El adaptador considera la forma reconocida por tener algún item,
mientras los controles específicos no encuentran el agente.

```js
const who = ["sdd", "apply"].join("-");
return runs.run("fix", { agent: who, task: "fix app/foo.ts" });
```

Resultado de las funciones reales: `unrecognized: false`, `targetsApply: false`,
`turnBudgetAdded: false`, `phaseRuntimeAdded: false`.

Fuentes: `ein-pi/agent/lib/delegation-shape.ts:100,255,271,286`,
`ein-pi/agent/extensions/internal/ein-tool-call-gate.ts:147,189`.

Manifiesto: §§001 y 002. La prueba demuestra omisión de controles específicos
y del aviso, no ausencia de todos los controles: permanecen límites nativos y
guardas de comandos del hijo. No demuestra un push sin autorización.

### 6. P2 — El intent pendiente no atraviesa el relevo

Antes del primer acuerdo confirmado, árbol y respuestas viven en entradas de
la sesión Pi. No existe todavía `intent.md`. El checkpoint no transporta ese
borrador y Claude solo puede leer o registrar acuerdos persistidos.

Reproducción: filas resueltas con «Solo filtrados» y columnas pendientes.
La sesión original conserva el acuerdo pendiente; una sesión nueva no lo tiene
y `intent show` en Claude devuelve `absent`.

Fuentes: `ein-pi/agent/lib/intent-discovery.ts:35,113`,
`ein-pi/agent/lib/continuity-sdd-facts.ts:53`,
`ein-cc/sdd-cli/intent-command.ts:35,45`.

Manifiesto: §§003, 005 y 006. Reabrir la misma sesión Pi sí conserva sus entradas;
el problema es el relevo a una sesión nueva o a otro runtime.

### 7. P2 — Una confirmación puede sustituir al objetivo del checkpoint

`captureInput` recoge cualquier mensaje breve. El siguiente refresh usa ese
mensaje como objetivo, por encima de lo que ya constaba.

Reproducción: objetivo «Implementar exportación CSV…»; después «Sí, continúa»;
el checkpoint pasa a tener «Sí, continúa» como objetivo.

Fuente: `ein-pi/agent/lib/continuity-handoff-lifecycle.ts:151,180`.
Pi y Claude llaman a esa captura en sus entradas ordinarias.

Manifiesto: §§000, 003 y 005. Último mensaje y objetivo vigente son datos distintos.

### 8. P2 — La incertidumbre de una mutación fallida no sobrevive al proceso

La bandera de mutación incierta solo vive en memoria. Una instancia bloquea
`prepare` tras el fallo. Una nueva detecta primero checkpoint obsoleto, pero
`prepare` lo refresca y permite el relevo, perdiendo la causa de incertidumbre.

Resultado reproducido: original ⇒ `mutation-uncertain`; nueva `status` ⇒ stale;
nueva `prepare` ⇒ `ok:true` con avisos de Git sucio y verificación no ejecutada.

Fuente: `ein-pi/agent/lib/continuity-handoff-lifecycle.ts:109,188,209`.

Manifiesto: §§002 y 003. Esto no prueba saltarse el cierre verificado: el destino
sigue recibiendo avisos. Prueba que el bloqueo específico depende del proceso
y se pierde sin una recuperación que resuelva el fallo anterior.

### 9. P2 — El validador acepta tareas terminadas y el router las vuelve a bloquear

Un `tasks.md` con todas las casillas completas y comando de verificación puede
omitir `status` y `blocked_by` según el lint. El router exige ambos igualmente.

Reproducción: lint correcto, cero issues; siguiente fase `close`, pero bloqueada
por esos dos metadatos. El handoff ordena no avanzar.

Fuentes: `shared/sdd/sdd-artifact-validation.ts:153`,
`shared/sdd/sdd-routing-core.ts:371,863`, `ein-pi/agent/lib/sdd-router.ts:33`.

Manifiesto: §004. Hay consumidores legítimos de estado durante tareas pendientes;
la corrección debe compartir el criterio según la operación, no eliminar toda
validación ni convertir un aviso de prosa en un bloqueo universal.

### 10. P2 — El presupuesto de contexto se expresa en prosa y no cubre workflows

`ensurePhaseContextBudget` solo añade texto a la tarea. No incorpora contador
de lecturas/tokens ni persistencia de consumo al reanudar. Además, una delegación
directa recibe el presupuesto y la equivalente en `workflowScript` no.

Fuentes: `ein-pi/agent/lib/sdd-phase-context-budget.ts:6`,
`runtime/agents/sdd-map.md:63,84`.

Manifiesto: §§001 y 002. Sí existen límites temporales separados; no se afirma
que la ejecución carezca de cualquier límite. Las cifras de contexto no deberían
presentarse como un techo aplicado hasta que el runtime observe y limite su uso.

### 11. P2 — TDD tiene dos fuentes para decidir el presupuesto de apply

El prompt del ejecutor lee la postura persistida del cambio. El límite de turnos
solo lee un hint de la delegación o la frase `STRICT TDD MODE IS ACTIVE`.
La misma tarea puede recibir TDD estricto del disco y el cap de 60+3 turnos
destinado a los applies normales si falta repetir el marcador.

Fuentes: `ein-pi/agent/lib/sdd-preflight.ts:240,446`,
`ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts:110`.

Manifiesto: §§002 y 005. El probe confirma la diferencia del helper con/sin
marcador; la lectura distinta del estado persistido se comprueba en código.
No se ejecutó un apply hasta agotar turnos.

### 12. P2 — El guard de revisión puede medir otro conjunto de cambios

Reproducciones con Git real en repositorios temporales:

- Archivo nuevo de 600 líneas sin staging ⇒ 0 líneas, `ok:true`, sin exceso.
- Ese archivo staged ⇒ 600 líneas; pasando `base: HEAD` antes del commit ⇒ 0.
- `tests/fixtures/data.ts` ⇒ producción; el mismo contenido en
  `package/tests/fixtures/data.ts` ⇒ tests.
- Base inexistente ⇒ `ok:false`, `overBudget:false`; la salida invita a medir
  «a ojo». Ese último caso comunica el error, pero el booleano aislado es ambiguo.

Fuentes: `ein-pi/agent/lib/review-forecast.ts:18,201,249,264`,
`ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts:171`,
`runtime/agents/ein-git.md:73`.

El padre mide antes de delegar; el agente de entrega confía en el número y no
vuelve a medir después de stage/commit. La medición no está vinculada al conjunto
exacto que va a entregarse. Esto causa tanto falsos bloqueos como omisiones.

Manifiesto: §§002, 004 y 005.

### 13. P2 — Un dry-run puede finalizar o limpiar recuperación

`runUpdate` llama a recuperación antes de aplicar `dryRun`. Un journal completo
puede finalizarse y eliminarse; uno con recuperación satisfactoria también se
limpia. Después la salida afirma que no se modificó ningún archivo.

Fuentes: `installer/src/cli/update.ts:106`,
`installer/src/core/transaction.ts:397,408`, `installer/src/cli/result.ts:81`.
El test `tests/release-update-cli.test.ts:607` espera ese borrado durante dry-run.

Manifiesto: §006. Confirmado por código y test existente; no se ejecutó un dry-run
en la instalación personal. No es evidencia de instalación de paquetes durante
dry-run: lo comprobado es limpieza/finalización de recuperación.

## Plan por garantías compartidas

### Prioridad 1: verificación y recuperación que no fabriquen éxito

1. Hacer inequívoco el resultado global de verify y compartir su lectura entre
   lint, router, cierre y presentación. Ejemplos, citas y resultados de checks
   individuales no pueden sustituirlo. Contradicciones deben producir fallo o
   desconocido, nunca aprobación por la primera coincidencia.
2. Vincular verify a la identidad de la superficie verificada: archivos,
   contenido y presencia/ausencia. Una eliminación esperada antes de verify es
   distinta de una eliminación posterior. Excluir recibos/documentación propia
   de esa identidad para evitar invalidaciones circulares.
3. Reconciliar exclusivamente la ejecución, cambio y artefacto esperados.
   Conservar un borrador es un resultado parcial útil; completar una fase exige
   evidencia atribuida a esa ejecución.
4. Compartir el inventario de propiedad entre empaquetado, snapshot, restore y
   comprobación del rollback. Registrar ausencias y verificar el estado completo
   restaurado, preservando campos de usuario y credenciales.

Cierre de esta prioridad: los probes 1–4 dejan de aceptar estado incorrecto y
sus controles positivos siguen permitiendo cerrar/restaurar trabajo válido.

### Prioridad 2: una decisión por frontera del flujo

5. Aplicar política de delegación sobre el agente y tarea resueltos en el punto
   real de lanzamiento. Una forma no resoluble debe ser desconocida y reconducirse
   a una invocación soportada. No asumir que reconocer un fragmento de tarea
   equivale a reconocer la ejecución completa.
6. Unificar bloqueos operativos y avisos de lint por operación. Comprobación,
   routing y handoff deben concordar con el cierre; las tareas terminadas no
   deben abrir trabajo de reparación de etiquetas sin consumidor necesario.

Cierre: invocaciones equivalentes reciben las mismas protecciones; ningún aviso
se convierte en bloqueo sin señalar qué operación o garantía está protegiendo.

### Prioridad 3: continuidad del trabajo, incluidas sus incertidumbres

7. Separar objetivo, último input y decisiones. Persistir borradores de intent
   en un contrato neutral al runtime, sin iniciar SDD ni inferir confirmación.
8. Persistir operaciones inciertas y su recuperación. Reabrir o refrescar Git
   no puede convertir por sí solo una operación incierta en resuelta.

Cierre: agotar/cambiar proveedor durante una entrevista, reiniciar después de
un fallo y responder «sí» conservan objetivo, respuestas, pendientes y autoridad.
Probar Pi→Pi nuevo, Pi→Claude y Claude→Pi en los estados que cada runtime admite.

### Prioridad 4: coste y previsualizaciones que midan lo anunciado

9. Resolver una sola vez la postura efectiva de TDD y consumirla tanto en el
   prompt como en los límites del ejecutor. Aplicar los límites observables con
   las capacidades del runtime existente y persistir su consumo cuando proceda;
   las cifras no aplicadas se presentan como orientación.
10. Medir exactamente la entrega propuesta, incluidos archivos nuevos, y asociar
    el resultado a ese estado. Clasificar tests por reglas que cubran raíz y
    paquetes. Un resultado no medible permanece desconocido.
11. Hacer dry-run consultivo también cuando haya recuperación pendiente.

Cierre: el lugar donde se guarda un fixture no altera la decisión; un archivo
nuevo grande se cuenta antes de entregar; dry-run registra cero efectos.

## Cambiar la estrategia de prueba

Mantener los tests actuales y añadir invariantes entre fronteras:

- Añadir un ejemplo al informe no cambia el resultado global.
- Cambiar o eliminar la superficie verificada invalida exactamente esa evidencia.
- Un artefacto de B nunca certifica una ejecución de A.
- Reiniciar un proceso no borra una incertidumbre ni cambia un acuerdo.
- Cambiar la forma equivalente de delegar no elimina protecciones.
- Tras rollback, todo archivo gestionado coincide con el estado anterior.

Ejecutar primero estas comprobaciones con puertos deterministas y fallos
inyectados. Complementarlas con recorridos reales y acotados antes de releases
que toquen esas fronteras. La compatibilidad de carga/UI con Pi latest es útil,
pero no acredita por sí sola estas invariantes del flujo.

Las correcciones se cortan por garantía observable y frontera de reversión.
El plan reutiliza el núcleo y el runtime existentes; cada normalizador o regla
nueva debe sustituir a los criterios duplicados y declarar qué heurística retira.

## Reproducción y límites

Scripts externos al repositorio, sobre el snapshot indicado:

```sh
bun /private/tmp/ein-manifest-sdd-probe.ts
bun /private/tmp/ein-manifest-delegation-probe.ts
bun /private/tmp/ein-manifest-forecast-probe.ts
bun /private/tmp/ein-manifest-template-rollback-probe.ts
bun /private/tmp/ein-manifest-continuity-probe.ts
```

El probe SDD ejecuta router, readiness y close reales, creando y eliminando solo
fixtures temporales. El de delegación prueba adaptadores, sin lanzar hijos. El
de revisión usa Git en repositorios temporales. El de rollback usa las funciones
reales con almacenamiento en memoria y comprueba que no exista su raíz sintética.
El probe de continuidad usa el lifecycle real con puertos simulados y el
protocolo intent; su salida se conserva en
`/private/tmp/ein-manifest-continuity-probe.json`. Sus límites se indican en los
hallazgos correspondientes.

No se ejecutó de nuevo la suite completa ni una matriz de instalaciones reales.
La auditoría identifica contraejemplos concretos y los consumidores afectados;
no afirma que estas sean todas las incidencias posibles del proyecto.
