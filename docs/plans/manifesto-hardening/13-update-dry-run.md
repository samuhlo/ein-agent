# 13 · Una simulación de update que no finaliza transacciones

Estado: diseño, no implementación. Base inspeccionada: `3b9fa42`.
Principios: MANIFIESTO §§002 y 006. Independiente de 04, con pruebas compartibles de journal.

## A. Proposal

`ein update --dry-run` debe mostrar qué haría sin cambiar la instalación ni su recuperación.
Hoy `runUpdate` ejecuta `recoverPendingTransaction` antes de pasar `dryRun` a la transacción.
Un journal terminal se elimina; uno `complete` puede ejecutar el hijo de finalización.
Después la UI puede decir «no se modificó ningún archivo». Una prueba actual espera esa eliminación.

Separar inspección pura del journal y recuperación con efectos. La simulación solo inspecciona,
resuelve metadatos de release cuando proceda y explica los pasos pendientes.
No cambiar el comportamiento del update real ni prohibir sus recuperaciones automáticas actuales.

## B. Spec · Given / When / Then

- Dado un journal ausente, cuando se simula, se puede resolver release pero no adquirir assets,
  sustituir binario, desplegar template, actualizar paquetes ni promover comandos.
- Dado un journal `complete`, cuando se simula, se informa finalización pendiente y permanece
  byte a byte igual: no `spawnContinuation`, no cleanup, no cambio de estado.
- Dado `recovery-succeeded`, cuando se simula, se informa limpieza pendiente sin eliminar el journal.
- Dado un journal no terminal o corrupto, cuando se simula, se informa que el update quedaría
  bloqueado por recuperación, sin repararlo ni afirmar que la instalación está sana.
- Dado `--dry-run --channel alpha`, la preferencia guardada no cambia.
- Dado un update real posterior, la recuperación existente sigue pudiendo finalizar y limpiar.
- Dado un fallo de lectura, entonces el resultado es desconocido/bloqueado, nunca journal ausente.

## C. Decisions

### Inspección sin efectos

En `installer/src/core/transaction.ts`, exportar `inspectPendingTransaction` y reutilizar el parser
actual de journal. Resultado cerrado: `absent`, `terminal-cleanup-pending`,
`committed-finalization-pending`, `recovery-required`, `unreadable`.
Incluir identidad y acción prevista solo tras validación; conservar distinción archivo inexistente
frente a lectura/JSON/schema fallidos. No llamar a `persistJournal`, callbacks ni capacidades write.
`inspectPendingTransaction` recibe una vista de capacidades de solo lectura (`exists`, `readFile`);
no recibe `recover` o `finalizeCommitted` como callbacks que accidentalmente pueda ejecutar.

`recoverPendingTransaction` consume esa misma interpretación para el camino real, manteniendo
sus efectos actuales; no duplicar dos parsers que terminen discrepando sobre un journal.
No leer transcripciones, credenciales ni artefactos externos para decidir el estado.
No borrar journals corruptos. No tratar el nombre de un archivo como identidad verificada.

### Cableado CLI

En `runUpdate`, validar flags/canal/selector antes de efectos. Cuando `flags.dryRun` es true,
usar inspección; NUNCA llamar `recoverPendingTransaction`, ni pasar un callback que finalice.
Para absent/terminal/complete se puede continuar a la resolución de release de la simulación;
adjuntar la acción pendiente como información, sin convertirla en ya ejecutada.
Para recovery-required/unreadable, devolver el outcome failed existente con stage recovering
y texto «La simulación detecta una recuperación pendiente; no se ha modificado la instalación».
No ejecutar la recuperación para lograr que el dry-run «pase».

Ampliar la variante `dry-run` de `UpdateOutcome` con `pendingRecovery` opcional cerrado:
`cleanup` o `finalize`; no reutilizar un `RecoveryStatus` cuyo nombre implica acción realizada.
`renderOutcome` enumera release, propietario y acción que haría un update real;
la última línea asegura ausencia de cambios solo en este camino sin mutaciones.
Corregir también «solo el binario» a binario/template/marker y superficies previstas:
la transacción real toca más que el ejecutable. No decir que Pi alcanzó latest en una simulación.
Lecturas de preferencias y advisor se mantienen informativas; ningún fallo activa reparación.

### Alcance de la garantía

Garantía comprobada: no llamadas mutadoras a `UpdateCaps`, no hijo, no gestor de paquetes,
no escritura de preferencia ni promoción de comandos; paths de instalación/journal intactos.
La consulta de metadatos remotos continúa permitida; no descargar el asset de instalación.
No prometer una transacción futura exitosa: el estado puede cambiar después de la simulación.
Temporales del sistema ajenos a la instalación no se usan para maquillar efectos de recuperación.

## D. Acceptance

- Tabla de todos los estados del journal con spies que fallan ante cualquier mutación/spawn.
- Mismos casos con filesystem temporal: hashes del journal/marker/preferencia sin cambios.
- Test original de recuperación + dry-run ahora espera journal presente; un update real posterior
  demuestra que la limpieza todavía funciona y no queda un bloqueo permanente.
- Output de terminal/complete distingue acción pendiente y resultado realizado.
- Selector/flags inválidos no generan cleanup ni hijo antes de devolver el error.
- Sin red real, install personal, proveedor ni suite completa para comprobar estos contratos.

## E. Paquetes cerrados de ejecución

### 13.1 · Lectura del journal y clasificación compartida

Leer: `installer/src/core/transaction.ts`, `installer/src/core/update-caps.ts`,
`tests/helpers/fake-update-caps.ts`, `tests/release-update-transaction.test.ts`.
Editar producción: `installer/src/core/transaction.ts` (un archivo).
Pasos: extraer inspección, preservar la causa de lectura fallida, conectar recovery real al mismo
parser sin alterar su orden de commit/rollback; permitir solo capacidades read en la nueva API.
Crear `tests/update-dry-run-recovery.test.ts` para tabla pura, errores y ausencia de efectos.
Comando: `bun test tests/update-dry-run-recovery.test.ts tests/release-update-transaction.test.ts`.
Parar si la extracción cambia un terminal probado de recuperación real; corregir ese delta antes de CLI.

### 13.2 · Simulación CLI y presentación veraz

Leer: salida 13.1, `installer/src/cli/update.ts`, `installer/src/cli/result.ts`,
`installer/src/core/release-types.ts`, `tests/release-update-cli.test.ts`.
Editar producción: los tres archivos CLI/result/types anteriores.
Pasos: bifurcar dry-run antes de recovery; añadir metadatos pendientes; conservar restricciones
de propiedad; impedir flags inválidos con efectos; actualizar texto binario/template/marker.
Ampliar `tests/update-dry-run-recovery.test.ts` y `tests/release-update-cli.test.ts`.
Comando: `bun test tests/update-dry-run-recovery.test.ts tests/release-update-cli.test.ts`.
Inyectar callbacks `promote`, updatePi, syncPiPackages y caps.child que fallen si se llaman.
No convertir la prueba en un mock de `runUpdate`: invocar la función real con capacidades simuladas.

### 13.3 · Prueba de disco y compatibilidad

Leer: fixtures previos y `tests/release-update-integration.test.ts`.
Editar solo pruebas: `tests/update-dry-run-recovery.test.ts` y, si comparte fixtures,
`tests/release-update-integration.test.ts`.
Pasos: crear instalación mínima con `mkdtemp`; snapshot de bytes/modos; ejecutar dry-run real
con HTTP simulado; comparar; ejecutar después recuperación real sobre esa raíz temporal.
Comando: `bun test tests/update-dry-run-recovery.test.ts tests/release-update-integration.test.ts`.
Parar si alguna prueba usa `AGENT_DIR` personal o una ruta por defecto en vez de la fixture.

### Compatibilidad y reversión

No cambia schema del journal ni política de recovery real. El outcome dry-run tiene campo opcional;
consumidores antiguos conservan la variante y exit code actuales.
Revertir CLI/renderer juntos; la API de inspección puede permanecer sin consumidores mutadores.
Este plan no depende del nuevo snapshot de 04 y debe probar journals antiguos y nuevos por separado.
