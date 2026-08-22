## // 000. RESUMEN
Se sustituyó la coordinación automática persistente de participantes SDD por una ejecución advisory efímera, determinista y dependiente de la sesión. El cambio queda verificado y listo para cierre; la pasada advisory observada terminó honestamente en `unavailable` por tres rutas eliminadas del alcance cambiado.

## // 001. QUÉ CAMBIÓ
- `ein-pi/agent/lib/sdd-participants.ts`: planificación completa y slicing determinista, estado en memoria, secuencia Cleaner→Architect, sellos de fuente y resultados honestos.
- `ein-pi/agent/lib/continuity-checkpoint.ts`: retirada del contrato persistente de participantes; continuidad conserva solo hechos genéricos.
- `ein-pi/agent/extensions/ein-ai.ts`: reconocimiento privado y acotado de terminales Pi en foreground; se eliminaron recibos y artefactos durables.
- `ein-pi/agent/lib/continuity-handoff-lifecycle.ts` y `continuity-resume-brief.ts`: eliminación del carry-forward y guidance específicos de participantes.
- `ein-pi/agent/assets/orchestrator.md` y routing SDD: participación advisory, reinicio efímero, resultados honestos y `sdd-verify` no bloqueado.
- Tests focalizados: slicing, continuidad, preflight, herramientas explícitas, routing, Claude/IPC, instalador y contrato de envelopes; se eliminó el módulo/fixture/test de recibos.
- `tests/subagent-envelope-contract.test.ts`: T2 identifica `recognizePiParticipantTerminal`, no el downstream `completeSddParticipantCall`.
- Sync OpenSpec: dominio `sdd-participant-routing` sincronizado sin conflictos (5 operaciones añadidas).

## // 002. CÓMO FUNCIONA POR DENTRO
El coordinador deriva cada ejecución desde el alcance cambiado actual, ordena y reparte todos los paths en slices contiguos bajo los límites existentes (32 archivos/128 KiB). Paths ausentes o imposibles quedan como blockers `scope-unavailable`; no se filtran ni se fabrican avances.

El progreso vive únicamente en la sesión: admite un solo hijo foreground, completa Cleaner en orden y solo ofrece Architect tras todos los Cleaners. Cada admisión verifica el sello vigente; una mutación aceptada recalcula el sello y refresca la obsolescencia de verify. Evidencia bloqueada explícita produce `blocked`; evidencia faltante, stale, imposible o no soportada produce `unavailable`; ninguna salida advisory impide `sdd-verify`.

Continuidad, briefs y lifecycle manejan únicamente datos genéricos. El borde Pi reconoce terminales válidos y pasa el resultado al coordinador, sin recibos, checkpoints, recuperación entre sesiones ni autoridad de archivos.

## // 003. DECISIONES
- Se eligió estado efímero y reinicio desde slice 0 frente a compatibilidad o migración de checkpoints; evita una persistencia engañosa.
- Se mantuvo el slicing completo y fail-closed: un path imposible hace unavailable la planificación sin elevar límites.
- Se conservó la separación entre reconocimiento Pi y finalización del coordinador; T2 corrige solo la expectativa de test.
- Se mantuvo la participación advisory y la verificación mecánica independiente; no se añadió una capa de proveedores ni un gate de participantes.
- La sincronización OpenSpec quedó aplicada en el dominio declarado, sin conflictos.

## // 004. VERIFICACIÓN
- Participante advisory: `unavailable`, con blockers esperados para `pi-sdd-participant-receipt.ts`, el fixture foreground y su test; no se ofrecieron tareas Cleaner/Architect.
- Focalizados: slicing/continuidad/routing/herramientas y contratos adyacentes en verde; cobertura final reportada de 120, 66, 59, 44, 40, 31, 21, 12 y 8 tests según comando.
- Suite completa `bun test`: 2.354 tests, 0 fallos.
- `bun run typecheck` y `cd installer && bun run typecheck`: ambos pasan.
- Hashes protegidos, escaneos de superficies eliminadas/símbolos stale y `git diff --check`: pasan; sin cambios de implementación durante verify.

## // 005. PENDIENTE / RIESGOS
- La participación advisory no persiste progreso: una nueva sesión reinicia desde Cleaner slice 0 por diseño.
- Los tres paths eliminados permanecen como evidencia unavailable y requieren que el alcance cambie antes de poder inspeccionarlos.
- Ningún bloqueo para cerrar; el padre debe archivar el cambio mediante el movimiento determinista de close.
