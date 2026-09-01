status: complete
change: install-journal-execution-boundary
work_groups: 4
verification_status: pass

## // 000. RESUMEN

El diario de instalación deja de ser un armario único. Codec, política, persistencia y ejecución tienen ahora responsabilidades separadas, mientras `install-journal.ts` conserva la misma API como fachada de 19 líneas. El flujo se lee como abrir, admitir o crear, ejecutar, persistir y finalizar o revertir.

## // 001. QUÉ CAMBIÓ

- `install-journal-codec.ts`: validación compuesta y traducción canónica entre bytes y diario.
- `install-journal-policy.ts`: clasificación única de los dos retries y transiciones inmutables alcanzables.
- `install-journal-persistence.ts`: composición de codec y store atómico con errores públicos estables.
- `install-journal-execution.ts`: handlers, checkpoints, SIGINT/SIGTERM, rollback y finalize.
- `install-journal.ts`: fachada de reexports compatible.
- El CLI elimina su copia de la política y consume el mismo clasificador que ejecución.

## // 002. CÓMO FUNCIONA POR DENTRO

El codec decide si unos bytes significan un diario válido. La política recibe diarios ya válidos y devuelve decisiones o estados nuevos sin efectos. Persistencia une esos estados con el store seguro. Ejecución conserva el estado mutable de una instalación concreta, llama las fronteras anteriores y coordina únicamente los efectos externos.

## // 003. DECISIONES

- Los retries devuelven una clase cerrada, no dos booleanos que cada consumidor pueda combinar distinto.
- Las transiciones son funciones de dominio con nombre; no se introdujo un reducer genérico ni una máquina externa.
- El store mantiene en exclusiva permisos, límites y atomicidad; persistencia sólo traduce dominio.
- Se corrigieron dos fallos observables dentro del contrato existente: la retirada legacy fallida ya puede completar su retry y un rollback que lanza no se invoca dos veces.
- Cada PR se mantuvo bajo 400 líneas y 20.000 bytes; no se usaron excepciones ni compresión.

## // 004. VERIFICACIÓN

- verify: `bun test tests/architecture-boundaries.test.ts tests/install-journal-codec.test.ts tests/install-journal-policy.test.ts tests/install-journal-persistence.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts`
- `verify-report.md`: `status: pass`, `behavior_coverage: verified`, sin bloqueos ni hallazgos críticos, altos o medios.
- Foco: 39 pass, 0 fail, 279 assertions.
- Suite completa: 2.927 pass, 0 fail, 14.267 assertions, 212 ficheros.
- Typechecks raíz e installer: pass.
- Sync canónico y check SDD: pass, 0 errores y 0 avisos.

## // 005. PENDIENTE / RIESGOS

- No queda trabajo del diario en el roadmap. El schema v1 y sus bytes no cambiaron; no hay migración pendiente.
- Las señales se prueban mediante el callback real con un adaptador determinista, no enviando señales al propio runner.
- La siguiente fase vigente es retirar peso accidental del payload de Claude; no forma parte de este cambio.
