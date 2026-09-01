# Scope — install-journal-execution-boundary

scope: Terminar la separación del diario de instalación en codec, política pura, persistencia y coordinación de efectos, manteniendo sin cambios su formato, API pública y garantías de recuperación.
budget_allocated:
  max_tokens: 30000
  max_reads: 45
  max_runtime_ms: 900000

## Problema

`installer/src/core/install-journal.ts` mide 169 líneas y 11.585 bytes, pero su función principal concentra 6.044 caracteres en 68 líneas. En un solo flujo decide reanudación, construye el estado inicial, envuelve handlers, aplica transiciones, persiste checkpoints, atiende SIGINT/SIGTERM, ejecuta rollback y finaliza.

Además, `installer/src/cli/install.ts` contiene una segunda implementación de las dos políticas de reanudación. Las dos copias expresan la misma intención con fuentes de orden distintas, así que una corrección puede admitir un diario en el CLI y rechazarlo después en el ejecutor, o al revés.

La suite actual está verde: 21 pruebas enfocadas del diario y el typecheck del instalador pasan sobre `main` después de las PR #281 y #282.

## Entrega

Un único cambio SDD cubre cuatro PRs encadenadas:

1. Codec: validación compuesta y traducción canónica entre bytes y diario.
2. Política pura: una sola clasificación de reanudación y transiciones sin filesystem ni handlers.
3. Persistencia: composición pequeña entre codec y almacén, con traducción estable de errores.
4. Ejecución: bucle de efectos y fachada pública fina.

El cuarto corte no añade alcance. Evita que separar persistencia y mover el coordinador formen una entrega superior a los presupuestos de revisión.

## Non-goals

- No cambia el schema v1, el JSON canónico, la ruta, permisos, digest ni códigos de error.
- No amplía los casos recuperables. Sólo siguen admitidos el retry previo a mutación de Pi y el retry de retirada legacy ya soportados.
- No añade clases, repositorios genéricos, event bus ni máquina de estados externa.
- No cambia `install-executor.ts`, el orden del plan ni la semántica de que un fallo detenga su runtime y permita los posteriores.
- No reforma `installer/src/cli/install.ts` fuera de retirar la política duplicada.
- No toca todavía el payload de Claude ni el núcleo SDD compartido.

## Áreas afectadas

- `installer/src/core/install-journal.ts` — fachada pública actual.
- Nuevos módulos `install-journal-codec.ts`, `install-journal-policy.ts`, `install-journal-persistence.ts` e `install-journal-execution.ts`.
- `installer/src/cli/install.ts` — consumidor de la decisión de reanudación.
- `tests/install-journal*.test.ts` — codec, política pura, fallos de persistencia y lifecycle real.
- `openspec/specs/installer-runtime/spec.md` — comportamiento canónico.
- `docs/roadmap.md` — retirar la fase cuando el cuarto PR quede verificado.

## Riesgos

- La precedencia de rollback, persistencia y errores es comportamiento: una extracción puede llamar lifecycle dos veces o ocultar el error más seguro.
- Los dos retries especiales dependen del orden exacto de inventario y de estados ya completados; un predicado más permisivo autorizaría mutaciones inciertas.
- Una transición pura mal definida puede producir un diario estructuralmente válido pero históricamente imposible.
- Mover código comprimido puede superar el presupuesto por bytes aunque no cambie semántica; cada PR se medirá antes de publicarse.

## Condiciones de retirada

- Los reexports temporales o helpers sin consumidor se retiran en el mismo cambio; no se deja una fachada de migración nueva.
- Si el coordinador final no queda más legible o exige entender política y almacenamiento para modificarlo, el corte se considera fallido y se revierte.
- Si una función pura sólo tiene un consumidor y no reduce decisiones del coordinador, se vuelve a integrar antes del cierre.
