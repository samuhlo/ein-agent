# Summary: fix-harness-selfblocking-contracts

Carril: micro · TDD estricto: ON · Verify: pass

## // 000. RESUMEN

El arnés se autobloqueaba. El planificador de participantes SDD sellaba cada pasaje
con el estado del árbol entero y, para preparar ese pasaje, escribía el checkpoint de
continuidad DENTRO del árbol — invalidando su propio sello en el mismo instante de
emitirlo. En una run real, `ein-cleaner` respondía `source state is stale` en bucle y
`sdd-verify` quedaba bloqueado sin salida posible.

Cinco capas, todas dentro y verificadas.

## // 001. QUÉ CAMBIÓ

1. **Checkpoint invisible para git.** `ein-pi/agent/lib/gitignore.ts` añade
   `openspec/changes/**/continuity.json` y el checkpoint del carril adhoc a su bloque
   gestionado. El patrón `**` es deliberado: `sdd-close` mueve los cambios a `archive/`.
   El fixture de `tests/sdd-participants.test.ts` pasa a llamar a `ensureEinGitignore()`
   en vez de escribir la línea a mano — ahí es donde el bug se escondía.

2. **Sello acotado al scope.** `sdd-participants.ts`, `continuity-checkpoint.ts` y
   `continuity-handoff-lifecycle.ts`: el pasaje se sella con `sdd-scope-v1:sha256:` sobre
   ruta + identidad de inodo + digest de contenido de los ficheros DECLARADOS, no sobre el
   árbol. El validador acepta el formato legado `git-v1:` y solo acuña el nuevo.
   `rebaseSddParticipants` se elimina: estaba en uso, y con un sello acotado habría borrado
   la evidencia del Cleaner en cada refresh (D4, cambio deliberado de contrato).

3. **Scout.** `scout-contract.ts` rechaza un lanzamiento concurrente EN EL LANZAMIENTO
   (antes el rechazo llegaba después de ejecutarse: tres delegaciones quemadas en una run
   real) y fuerza `async: false` en ambas formas. `ein-ai.ts` limpia `scoutTracking` al
   inicio de cada turno, para que un scout cancelado no deje el scout muerto toda la
   sesión. `orchestrator.md` sustituye su sección de fan-out por una secuencial, sin crecer
   en bytes; su test de prosa portante se actualiza en el mismo movimiento.

4. **Gramática de `## Files changed`.** Fijada en `ein-pi/core/agents/sdd-apply.md` y en
   `ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md`, como excepción acotada a la regla de
   compacidad, y comprobada por un test ejecutable: el prompt y el parser ya no pueden
   divergir en silencio.

5. **Documentación.** `docs/guia-cleaner-architect-herramientas-deterministas.md` deja de
   describir el sello global.

## // 002. CÓMO FUNCIONA POR DENTRO

El ciclo que se mordía la cola: `planSddParticipants` sellaba con
`beforeStateRef = state(cwd)`, calculado ANTES de publicar el checkpoint. Publicarlo dejaba
un `continuity.json` untracked que `git status --untracked-files=all` sí ve y cuyo contenido
entra en el hash. `admitSddParticipantCall` recomputaba el estado DESPUÉS de esa escritura,
y nunca coincidía.

La capa 1 rompe el bucle: si git no ve el checkpoint, escribirlo no mueve el estado.
La capa 2 lo hace inmune: el sello mide solo lo que le importa al Cleaner — los ficheros que
va a auditar. Lo que se escriba fuera de ese scope deja de invalidar el pasaje, y lo que se
toque dentro sigue rechazándose en la admisión.

## // 003. DECISIONES

- **D1** — el sello combina ruta, identidad de inodo y digest de contenido: detecta tanto un
  swap de fichero como una reescritura.
- **D2** — prefijo propio `sdd-scope-v1:`; reutilizar `git-v1:` habría hecho que el valor
  mintiera sobre su procedencia.
- **D4** — `rebaseSddParticipants` se elimina en vez de adaptarse: la autoridad de
  invalidación pasa a `passage()`, que valida en cada plan y en cada admisión. Es más fuerte
  que el rebase viejo, que solo actuaba en el refresh.
- **D7** — el guardarraíl del scout vive en código, y su condición de retirada en un
  comentario de código: un guardarraíl sin fecha de caducidad es deuda permanente.
- **D9** — el orden de capas es restricción, no preferencia: la capa 2 habría enmascarado el
  RED de la capa 1.

## // 004. VERIFICACIÓN

- Dos planes consecutivos sin tocar el scope dan el MISMO `passageId` y admiten. El bug
  original está muerto, medido ejercitando el código real.
- Modificar un fichero declarado entre el plan y la admisión sigue rechazando con
  `source state is stale`. El fail-closed no se relajó para desbloquear.
- Suite: 2223 pass / 5 fail. Los 5 fallos se confirmaron preexistentes haciendo stash del
  cambio completo y corriendo la suite sobre HEAD: mismos 5. Typecheck limpio.

## // 005. RIESGOS Y PENDIENTES

1. **Residual abierto y deliberado (D5).** La capa 1 cierra la fuente que se realimentaba,
   pero el `stateRef` global sigue moviéndose con `memory-receipts.jsonl` y con cada
   escritura normal de artefactos. La degradación `fresh` -> `stale` de la verificación
   sigue viva. Está medido y declarado abierto; no se reclama como resuelto.
2. **No llega hasta `ein update`.** Ein corre la copia instalada, no el repo. El bloque de
   `.gitignore` lo reescribe `ensureEinGitignore()` en el `session_start` de Pi.
3. **Presupuesto al límite.** `core/agents/*.md` queda exactamente en su tope de bytes, con
   cero holgura: la próxima adición a cualquier prompt de fase tendrá que pagar recortando.
4. **`design.md` en 476 líneas**, por encima del umbral de 400. Cinco capas es mucho para un
   cambio; se aceptó porque las cinco atacan el mismo autobloqueo.

## // 006. SPECS

El cambio declara delta de comportamiento en dos dominios canónicos, `sdd-lifecycle`
(sello del pasaje, checkpoint, gramática de artefactos) y `scout-routing` (lanzamiento del
scout). `cc-ein-sdd sync` los promocionó a las specs canónicas: estado `synchronized`.
